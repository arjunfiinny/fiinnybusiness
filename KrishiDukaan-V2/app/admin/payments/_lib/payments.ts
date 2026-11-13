import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../../../firebase";

/**
 * Shared model + helpers for Admin → Payments.
 *
 * Everything the page, the table, the pie charts and the CSV export read goes
 * through this file so there is ONE definition of what a payment attempt is,
 * ONE categorisation rule, and ONE date-range fetch — the spec's requirement
 * that table, analytics and export never disagree.
 *
 * Source of truth is `paymentAttempts/{razorpayOrderId}`, written server-side
 * in app/lib/payment-attempts.ts. We never write it from here.
 */

/** One priced line of a cart attempt (server-resolved at checkout). */
export type AttemptItem = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  sellerPhone: string | null;
  priceSource: string;
};

export type Attempt = {
  id: string;
  razorpayOrderId: string;
  /** Razorpay's payment id — present once a payment entity exists (paid, or a
   *  Razorpay-synced failure). Absent on created/abandoned rows. */
  razorpayPaymentId: string | null;
  kind: "cart" | "subscription";
  status: "created" | "paid" | "failed";
  userId: string;
  userPhone: string | null;
  userName: string | null;
  /** What the customer typed at THIS checkout (may differ from the profile). */
  customerName: string | null;
  customerPhone: string | null;
  /** Razorpay's own contact/email — the only identity on a synced row that has
   *  no matching user doc. */
  razorpayContact: string | null;
  razorpayEmail: string | null;
  amount: number;
  subtotal: number | null;
  deliveryCharge: number | null;
  gstAdded: number | null;
  items: AttemptItem[];
  seatCount: number | null;
  durationMonths: number | null;
  note: string | null;
  /** Raw origin: web | mobile | razorpay_webhook | razorpay_backfill | unknown. */
  source: string;
  /** Razorpay payment method, only stored on synced failure rows today. */
  method: string | null;
  error: {
    code?: string | null;
    description?: string | null;
    reason?: string | null;
    source?: string | null;
    step?: string | null;
  } | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  paidAt: Date | null;
  failedAt: Date | null;
};

/**
 * An attempt still at 'created' this long after the order was made is treated
 * as abandoned. Razorpay's checkout session is far shorter, so anything older
 * has certainly not completed. Generous on purpose — never flag a customer who
 * is still mid-UPI as a lost sale.
 */
export const ABANDON_AFTER_MS = 30 * 60 * 1000;

export type Bucket = "failed" | "abandoned" | "pending" | "paid";

export const BUCKET_LABEL: Record<Bucket, string> = {
  failed: "Failed",
  abandoned: "Abandoned",
  pending: "In process",
  paid: "Successful",
};

/**
 * Which queue an attempt belongs in. "paid" means Razorpay confirmed the money
 * (set by /api/payment/verify, order-status reconciliation, or the
 * payment.captured webhook) — NOTHING else may land there. An attempt still at
 * 'created' inside the abandon window is "pending"; past it, "abandoned".
 *
 * `now` is passed in so a whole dataset is bucketed against a single clock —
 * the table, the charts and the CSV must all agree on the 30-minute split.
 */
export function bucketOf(a: Attempt, now: number = Date.now()): Bucket {
  if (a.status === "paid") return "paid";
  if (a.status === "failed") return "failed";
  return now - (a.createdAt?.getTime() ?? 0) > ABANDON_AFTER_MS
    ? "abandoned"
    : "pending";
}

/** Platform as we can actually prove it. We never guess an OS: the data only
 *  records web vs mobile (="app") vs a Razorpay sync origin. */
export type Platform = "app" | "web" | "razorpay" | "unknown";

export function platformOf(a: Attempt): Platform {
  switch (a.source) {
    case "mobile":
      return "app";
    case "web":
      return "web";
    case "razorpay_webhook":
    case "razorpay_backfill":
      return "razorpay";
    default:
      return "unknown";
  }
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  app: "App",
  web: "Web",
  razorpay: "Razorpay (synced)",
  unknown: "Unknown",
};

export const money = (n: number) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | null;
  if (t?.toDate) return t.toDate();
  if (v instanceof Date) return v;
  return null;
}

export function toAttempt(d: QueryDocumentSnapshot<DocumentData>): Attempt {
  const x = d.data();
  return {
    id: d.id,
    razorpayOrderId: String(x.razorpayOrderId ?? d.id),
    razorpayPaymentId: x.razorpayPaymentId ?? null,
    kind: x.kind === "subscription" ? "subscription" : "cart",
    status: x.status ?? "created",
    userId: String(x.userId ?? ""),
    userPhone: x.userPhone ?? null,
    userName: x.userName ?? null,
    customerName: x.customerName ?? null,
    customerPhone: x.customerPhone ?? null,
    razorpayContact: x.razorpayContact ?? null,
    razorpayEmail: x.razorpayEmail ?? null,
    amount: Number(x.amount ?? 0),
    subtotal: x.subtotal ?? null,
    deliveryCharge: x.deliveryCharge ?? null,
    gstAdded: x.gstAdded ?? null,
    items: Array.isArray(x.items) ? x.items : [],
    seatCount: x.seatCount ?? null,
    durationMonths: x.durationMonths ?? null,
    note: x.note ?? null,
    source: String(x.source ?? "unknown"),
    method: x.method ?? null,
    error: x.error ?? null,
    createdAt: toDate(x.createdAt),
    updatedAt: toDate(x.updatedAt),
    paidAt: toDate(x.paidAt),
    failedAt: toDate(x.failedAt),
  };
}

/**
 * Every attempt created inside [from, to], newest first. One shot — the page
 * buckets, filters, charts, paginates and exports this set entirely
 * client-side, so the window (default 30 days) is what bounds the volume.
 *
 * Range + matching orderBy on the same field needs no composite index.
 */
export async function fetchAttemptsInRange(from: Date, to: Date): Promise<Attempt[]> {
  const q = query(
    collection(db, "paymentAttempts"),
    where("createdAt", ">=", Timestamp.fromDate(from)),
    where("createdAt", "<=", Timestamp.fromDate(to)),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map(toAttempt);
}

/** The best contact number we hold for a buyer, in priority order. */
export function phoneOf(a: Attempt): string | null {
  return a.userPhone || a.customerPhone || a.razorpayContact || null;
}

/** The best display name for a buyer. */
export function nameOf(a: Attempt): string {
  return a.userName || a.customerName || a.razorpayContact || a.razorpayEmail || "Unknown buyer";
}

/** A one-line description of what was being bought. */
export function productSummary(a: Attempt): string {
  if (a.kind === "subscription") {
    return `Subscription — ${a.seatCount ?? "?"} seat(s), ${a.durationMonths ?? "?"} month(s)`;
  }
  if (a.items.length > 0) return a.items.map((i) => `${i.name} ×${i.qty}`).join(", ");
  return a.note || "Cart order";
}

/** The single most useful line for a support call: why it did not go through. */
export function reasonOf(a: Attempt, bucket: Bucket): string {
  return (
    a.error?.description ||
    a.error?.reason ||
    (bucket === "abandoned"
      ? "Customer closed the payment screen without completing it."
      : bucket === "pending"
        ? "Checkout opened — not paid yet. Moves to Abandoned if unpaid after 30 min."
        : bucket === "paid"
          ? "Payment captured."
          : "—")
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────

/**
 * Makes one value safe for a CSV cell:
 *  - neutralises formula injection (a cell starting = + - @ is prefixed with ')
 *    so a spreadsheet never executes it;
 *  - quotes and escapes anything containing a comma, quote or newline.
 */
function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const CSV_HEADERS = [
  "Payment ID",
  "Razorpay Order ID",
  "Customer Name",
  "Customer Phone Number",
  "Customer ID",
  "Product Name",
  "Product ID",
  "Quantity",
  "Subtotal",
  "Delivery Charges",
  "GST",
  "Total Amount",
  "Payment Status",
  "Error Code",
  "Error Description",
  "Error Source",
  "Error Step",
  "Error Reason",
  "Payment Method",
  "Platform",
  "Created Date",
  "Updated Date",
  "Captured Date",
  "Refund Status",
];

const fmtDate = (d: Date | null) => (d ? d.toISOString() : "");

export function attemptsToCsv(rows: Attempt[], now: number = Date.now()): string {
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  for (const a of rows) {
    const bucket = bucketOf(a, now);
    const productName =
      a.kind === "subscription" ? productSummary(a) : a.items.map((i) => i.name).join(" | ");
    const productId = a.items.map((i) => i.productId).join(" | ");
    const qty = a.items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    lines.push(
      [
        a.razorpayPaymentId,
        a.razorpayOrderId,
        nameOf(a),
        phoneOf(a),
        a.userId,
        productName,
        productId,
        a.kind === "subscription" ? (a.seatCount ?? "") : qty || "",
        a.subtotal ?? "",
        a.deliveryCharge ?? "",
        a.gstAdded ?? "",
        a.amount,
        BUCKET_LABEL[bucket],
        a.error?.code ?? "",
        a.error?.description ?? "",
        a.error?.source ?? "",
        a.error?.step ?? "",
        a.error?.reason ?? "",
        a.method ?? "",
        PLATFORM_LABEL[platformOf(a)],
        fmtDate(a.createdAt),
        fmtDate(a.updatedAt),
        // No dedicated captured_at is stored; paidAt (when we confirmed the
        // money) is the closest truthful value and is blank unless paid.
        fmtDate(a.paidAt),
        // Refund state is not tracked on payment attempts today.
        "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  // Prepend a BOM so Excel reads ₹ and Indic names as UTF-8.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
