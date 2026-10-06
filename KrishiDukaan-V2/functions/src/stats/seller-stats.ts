import * as admin from "firebase-admin";
import { createHash } from "crypto";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { addTo, applyOnce, diffContributions, fieldKey, istDayKey, millisOf, type Contribution } from "./increments";
import { orderTotal } from "./platform-daily";

/**
 * Per-seller order totals for the seller dashboard (website Home and
 * Analytics), kept by a trigger on orders so the dashboard stops reading the
 * seller's whole order history:
 *
 *   sellerStats/{sellerKey}            all time:
 *     { sellerKey, orders: { count, revenue, paid, paidAmount,
 *                            status: { placed: n, ... } },
 *       items: { <key>: { name, qty, revenue } } }
 *   sellerDailyStats/{sellerKey}_{YYYY-MM-DD}   (India dates):
 *     { sellerKey, date, orders: { count, revenue } }
 *
 * Same rules as the dashboard's former order scan: revenue and products sold
 * leave out cancelled and rejected orders; the order count includes them.
 * sellerKey is the seller's phone as "+91" + 10 digits when the order has
 * one (sellerPhone, or a phone-shaped sellerId), else sellerId (an Auth UID),
 * so each order counts under exactly one key.
 * scripts/backfill-seller-stats.ts builds the history and can be re-run.
 */

const REGION = "asia-south1";
export const SELLER_STATS = "sellerStats";
export const SELLER_DAILY = "sellerDailyStats";

type Data = admin.firestore.DocumentData | undefined;

/** "+91" + 10 digits for anything phone-shaped, else the value as is. */
export function normalizeSellerKey(value: unknown): string {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (/^\+?\d{10,12}$/.test(raw.replace(/[\s-]/g, "")) && digits.length >= 10) return `+91${digits.slice(-10)}`;
  return raw;
}

export function sellerKeyOf(d: admin.firestore.DocumentData): string {
  return normalizeSellerKey(d.sellerPhone) || normalizeSellerKey(d.sellerId);
}

/** A map key for a product name that is safe in a field path, and stable. */
export function itemKey(name: string): string {
  return `${fieldKey(name, "item").slice(0, 40)}_${createHash("sha1").update(name).digest("hex").slice(0, 8)}`;
}

function itemName(item: Record<string, unknown> | null | undefined): string {
  return String(item?.name ?? "Unknown product");
}

export function sellerContribution(d: Data): Contribution {
  const c: Contribution = new Map();
  if (!d) return c;
  const key = sellerKeyOf(d);
  if (!key || key.includes("/")) return c;
  const totals = `${SELLER_STATS}/${key}`;
  const status = String(d.status ?? "unknown");
  const cancelled = status === "cancelled" || status === "rejected";
  const total = orderTotal(d);

  addTo(c, totals, "orders.count", 1);
  addTo(c, totals, `orders.status.${fieldKey(status)}`, 1);
  if (!cancelled) addTo(c, totals, "orders.revenue", total);
  // Paid online (the Orders page's "paid" tiles), whatever the status.
  if (d.payment?.status === "paid") {
    addTo(c, totals, "orders.paid", 1);
    addTo(c, totals, "orders.paidAmount", Number(d.payment.amount ?? 0) || 0);
  }

  const ms = millisOf(d.createdAt);
  if (ms > 0) {
    const day = `${SELLER_DAILY}/${key}_${istDayKey(ms)}`;
    addTo(c, day, "orders.count", 1);
    if (!cancelled) addTo(c, day, "orders.revenue", total);
  }

  if (!cancelled && Array.isArray(d.items)) {
    for (const item of d.items) {
      const k = itemKey(itemName(item));
      const qty = Number(item?.quantity ?? 0);
      addTo(c, totals, `items.${k}.qty`, qty);
      addTo(c, totals, `items.${k}.revenue`, Number(item?.price ?? 0) * qty);
    }
  }
  return c;
}

/** Plain fields written alongside the increments: who and which day, and item names. */
export function sellerExtra(path: string, orders: Data[]): Record<string, unknown> {
  if (path.startsWith(`${SELLER_DAILY}/`)) {
    const id = path.slice(SELLER_DAILY.length + 1);
    return { sellerKey: id.slice(0, -11), date: id.slice(-10) };
  }
  const items: Record<string, { name: string }> = {};
  for (const d of orders) {
    if (!d || !Array.isArray(d.items)) continue;
    for (const item of d.items) items[itemKey(itemName(item))] = { name: itemName(item) };
  }
  return { sellerKey: path.slice(SELLER_STATS.length + 1), items };
}

export const sellerStatsOnOrderWrite = onDocumentWritten(
  { document: "orders/{id}", region: REGION, retry: true },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    try {
      await applyOnce(
        "seller",
        event.id,
        diffContributions(sellerContribution(before), sellerContribution(after)),
        (path) => sellerExtra(path, [before, after]),
      );
    } catch (err) {
      logger.error("[sellerStats] update failed", { eventId: event.id, err: String(err) });
      throw err; // retried; the event marker keeps it exactly-once
    }
  },
);
