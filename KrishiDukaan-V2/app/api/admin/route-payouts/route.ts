import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { AggregateField, FieldValue, type Query } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { fetchPaymentTransfers, matchSellerTransfer, outstandingPaise } from "../../../lib/route-transfers";

/**
 * /api/admin/route-payouts: admin view of seller money in Razorpay Route.
 *
 * GET  → totals per payout state, onboarded sellers, and a page of transfers.
 * POST → { action: "release", orderId }: release a delivered order's held
 *        transfer (one that the delivery trigger never released, e.g. it was
 *        delivered while settings/route.releaseEnabled was off).
 *
 * WHERE THE STATUS COMES FROM
 * orders/{id}.payout, which functions/src/payouts/payout-status.ts keeps in
 * step with Razorpay (transfer status, settlement status, hold, settlement
 * id). This page used to call Razorpay once per order on every load (25
 * orders per seller); now it reads Firestore, and counts and sums come from
 * aggregation queries rather than reading every order.
 */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const SELLER_COLLECTIONS = ["retailers", "manufacturers"] as const;
const PAGE = 50;
const PAYOUT_STATES = ["on_hold", "scheduled", "processing", "settled", "failed", "reversed", "not_routed"] as const;

type AdminAuthResult =
  | { ok: true; uid: string; response?: undefined }
  | { ok: false; uid?: undefined; response: NextResponse };

async function requireAdmin(req: NextRequest): Promise<AdminAuthResult> {
  const header = req.headers.get("Authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) {
    return { ok: false, response: NextResponse.json({ error: "Missing authorization token" }, { status: 401 }) };
  }
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid authorization token" }, { status: 401 }) };
  }

  const db = getAdminDb();
  const [byUid, idx] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("uidIndex").doc(uid).get(),
  ]);
  let isAdmin = byUid.exists && byUid.data()?.role === "admin";
  if (!isAdmin && idx.exists) {
    const phone = idx.data()?.phone;
    if (phone) {
      const byPhone = await db.collection("users").doc(String(phone)).get();
      isAdmin = byPhone.exists && byPhone.data()?.role === "admin";
    }
  }
  if (!isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, uid };
}

const ms = (v: unknown): number | null => {
  const t = v as { toMillis?: () => number } | null | undefined;
  if (t && typeof t.toMillis === "function") return t.toMillis();
  return typeof v === "number" && v > 0 ? v : null;
};

type TransferRow = {
  orderId: string;
  createdAt: number | null;
  orderStatus: string;
  sellerName: string;
  sellerPhone: string;
  via: string;
  transferId: string | null;
  account: string | null;
  amount: number;
  reversed: number;
  transferStatus: string | null;
  settlementStatus: string | null;
  state: string;
  onHoldUntil: number | null;
  settlementId: string | null;
  settledAt: number | null;
  checkedAt: number | null;
  error: string | null;
};

function rowOf(doc: FirebaseFirestore.DocumentSnapshot): TransferRow {
  const o = doc.data() ?? {};
  const p = (o.payout ?? {}) as Record<string, unknown>;
  return {
    orderId: doc.id,
    createdAt: ms(o.createdAt),
    orderStatus: String(o.status ?? ""),
    sellerName: String(o.sellerName ?? o.storeName ?? o.shopName ?? ""),
    sellerPhone: String(o.sellerPhone ?? ""),
    via: String(p.via ?? ""),
    transferId: (p.transferId as string) ?? null,
    account: (p.account as string) ?? null,
    amount: Number(p.amount ?? 0) || 0,
    reversed: Number(p.reversed ?? 0) || 0,
    transferStatus: (p.transferStatus as string) ?? null,
    settlementStatus: (p.settlementStatus as string) ?? null,
    state: String(p.state ?? "checking"),
    onHoldUntil: ms(p.onHoldUntil),
    settlementId: (p.settlementId as string) ?? null,
    settledAt: ms(p.settledAt),
    checkedAt: ms(p.checkedAt),
    error: (p.error as string) ?? null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const db = getAdminDb();
    const orders = db.collection("orders");
    const params = req.nextUrl.searchParams;
    const filter = params.get("state") ?? "all";
    const cursor = params.get("cursor");

    // Totals per state: one count+sum query each.
    const summaryP = Promise.all(
      [...PAYOUT_STATES.map((s) => ({ key: s as string, q: orders.where("payout.state", "==", s) as Query })),
        // Delivered but still held: money a release never reached.
        { key: "needs_action", q: orders.where("payout.state", "==", "on_hold").where("status", "==", "delivered") as Query },
      ].map(async ({ key, q }) => {
        const agg = await q.aggregate({ count: AggregateField.count(), amount: AggregateField.sum("payout.amount") }).get();
        return [key, { count: agg.data().count, amount: Math.round((Number(agg.data().amount) || 0) * 100) / 100 }] as const;
      }),
    ).then((pairs) => Object.fromEntries(pairs));

    let q: Query =
      filter === "needs_action"
        ? orders.where("payout.state", "==", "on_hold").where("status", "==", "delivered")
        : (PAYOUT_STATES as readonly string[]).includes(filter)
          ? orders.where("payout.state", "==", filter)
          : orders.where("payout.state", "in", [...PAYOUT_STATES]);
    q = q.orderBy("createdAt", "desc").limit(PAGE);
    if (cursor && /^[A-Za-z0-9_-]{1,120}$/.test(cursor)) {
      const after = await orders.doc(cursor).get();
      if (after.exists) q = q.startAfter(after);
    }

    const sellersP = (async () => {
      const rows: { phone: string; collection: string; businessName: string; razorpayAccountId: string; routeStatus: string }[] = [];
      for (const collection of SELLER_COLLECTIONS) {
        // Only sellers with a Route account (a filter on the field, not a scan).
        const snap = await db.collection(collection).where("razorpayAccountId", ">", "").get();
        for (const doc of snap.docs) {
          const d = doc.data();
          rows.push({
            phone: doc.id,
            collection,
            businessName: String(d.businessName ?? d.shopName ?? d.storeName ?? d.name ?? doc.id),
            razorpayAccountId: String(d.razorpayAccountId),
            routeStatus: String(d.routeStatus ?? "unknown"),
          });
        }
      }
      return rows;
    })();

    const [summary, page, sellers] = await Promise.all([summaryP, q.get(), sellersP]);
    const transfers = page.docs.map(rowOf);
    return NextResponse.json({
      summary,
      sellers,
      transfers,
      nextCursor: page.size === PAGE ? page.docs[page.docs.length - 1].id : null,
    });
  } catch (error) {
    console.error("[route-payouts] failed:", error);
    return NextResponse.json({ error: "Could not load Route payout data" }, { status: 500 });
  }
}

/**
 * Release a delivered order's held Route transfer now. Checks with Razorpay
 * first (never from our own fields alone): the transfer must be this seller's,
 * still on hold, and not reversed. Razorpay then settles it to the seller by
 * the next working day.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  let body: { action?: string; orderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.action !== "release" || !body.orderId || !/^[A-Za-z0-9_-]{1,120}$/.test(body.orderId)) {
    return NextResponse.json({ error: "Expected { action: 'release', orderId }" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("orders").doc(body.orderId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const o = snap.data()!;

  if (o.status !== "delivered") {
    return NextResponse.json({ error: "Only a delivered order's money can be released." }, { status: 409 });
  }
  if (o.payment?.transferId) {
    return NextResponse.json({ error: "This order was paid by the payout run, not a Route transfer." }, { status: 409 });
  }
  const paymentId = String(o.payment?.razorpayPaymentId ?? "").trim();
  if (!paymentId) return NextResponse.json({ error: "No online payment on this order." }, { status: 409 });

  try {
    const transfers = await fetchPaymentTransfers(paymentId);
    const preferred = String(o.routeTransfer?.id ?? o.routeRelease?.transferId ?? "").trim() || null;
    const match = matchSellerTransfer(transfers, [o.sellerPhone, o.sellerId], preferred);
    if (!match) return NextResponse.json({ error: "No Route transfer for this seller on the payment." }, { status: 409 });
    if (outstandingPaise(match) <= 0) return NextResponse.json({ error: "That transfer has been reversed." }, { status: 409 });
    if (!match.on_hold) {
      await ref.set({ payout: { nextCheckAt: 0 } }, { merge: true });
      return NextResponse.json({ ok: true, alreadyReleased: true, transferId: match.id });
    }

    await razorpay.transfers.edit(match.id, { on_hold: 0 });

    await ref.set(
      {
        routeRelease: {
          transferId: match.id,
          amount: match.amount,
          status: "released_by_admin",
          releasedBy: auth.uid,
          recordedAt: FieldValue.serverTimestamp(),
        },
        payout: { nextCheckAt: 0 },
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true, transferId: match.id });
  } catch (error) {
    console.error("[route-payouts] release failed:", error);
    const message = (error as { error?: { description?: string } })?.error?.description ?? "Razorpay refused the release.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
