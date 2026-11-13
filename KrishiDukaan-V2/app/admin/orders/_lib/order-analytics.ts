"use client";

/**
 * Order analytics — the money math behind Admin → Orders' collapsible analytics
 * panel. Everything here is PURE: it takes an array of orders and returns
 * aggregates, so the panel, the header tiles and the CSV export can never
 * disagree about what "collected" means.
 *
 * It reads ONLY order-level payment state (order.payment.*), never
 * paymentAttempts or the razorpayPayments gateway mirror. That matters (see the
 * Nov 2026 payment audit): paymentAttempts has one row PER checkout attempt, so
 * summing it double-counts retries and treats a failed-then-succeeded order as
 * unpaid. The order's own `payment` object is the single settled outcome —
 * captured amount, and how much of it was refunded — so one order contributes
 * exactly once, no matter how many attempts or products it had.
 *
 * Definitions (fixed, used everywhere):
 *   captured  = payment.amount once the payment reached 'paid'/'refunded'
 *   refunded  = payment.refundedAmount actually processed back to the customer
 *   collected = Σ captured
 *   net       = collected − refunded
 *   unpaid    = Σ order total for genuinely outstanding orders (nothing captured
 *               and the order is still live — cancelled/rejected owe nothing)
 */

import { orderGrandTotal, type OrderDoc, type OrderStatus } from "../../../../types/order";

export type PaymentBucket = "paid" | "unpaid" | "partially_refunded" | "refunded" | "pending";

export const PAYMENT_BUCKET_META: Record<PaymentBucket, { label: string; badge: string }> = {
  paid:               { label: "Paid",               badge: "bg-green-100 text-green-700" },
  unpaid:             { label: "Unpaid",             badge: "bg-amber-100 text-amber-700" },
  partially_refunded: { label: "Partially refunded", badge: "bg-orange-100 text-orange-700" },
  refunded:           { label: "Refunded",           badge: "bg-gray-200 text-gray-700" },
  pending:            { label: "Pending / in process", badge: "bg-blue-100 text-blue-700" },
};

/** Statuses an order no longer owes money for — excluded from "outstanding". */
const NON_OUTSTANDING_STATUSES: OrderStatus[] = ["cancelled", "rejected", "reassigning"];

const orderTotal = orderGrandTotal;

/** Amount actually captured for this order (0 until the gateway captured it). */
export function capturedAmount(o: OrderDoc): number {
  const p = o.payment;
  if (!p) return 0;
  return p.status === "paid" || p.status === "refunded" ? (p.amount ?? 0) : 0;
}

/**
 * Amount successfully refunded back to the customer. Prefers the explicit
 * `refundedAmount` the refund flow records; falls back to the captured amount
 * only when the gateway status is 'refunded' but no figure was stored (a full
 * refund on a legacy order).
 */
export function refundedAmount(o: OrderDoc): number {
  const p = o.payment;
  if (!p) return 0;
  const amt = p.refundedAmount ?? 0;
  if (amt > 0) return amt;
  if (p.status === "refunded") return p.amount ?? 0;
  return 0;
}

/** The order-level payment bucket — distinct from the gateway payment-attempt
 *  status. One order → exactly one bucket. */
export function paymentBucket(o: OrderDoc): PaymentBucket {
  const p = o.payment;
  if (!p || p.status === "failed") return "unpaid";
  if (p.status === "pending") return "pending";
  const captured = p.amount ?? 0;
  const refunded = refundedAmount(o);
  if (p.status === "refunded" || (captured > 0 && refunded >= captured)) return "refunded";
  if (refunded > 0) return "partially_refunded";
  if (p.status === "paid") return "paid";
  return "unpaid";
}

/** Genuinely outstanding value: order total when nothing was captured and the
 *  order is still live. Cancelled/rejected/reassigning owe nothing. */
export function outstandingValue(o: OrderDoc): number {
  if (NON_OUTSTANDING_STATUSES.includes(o.status)) return 0;
  return capturedAmount(o) > 0 ? 0 : orderTotal(o);
}

export type FinancialSummary = {
  totalOrders: number;
  totalValue: number;
  collected: number;
  refunded: number;
  netCollected: number;
  unpaidValue: number;
};

export function computeFinancialSummary(orders: OrderDoc[]): FinancialSummary {
  let totalValue = 0, collected = 0, refunded = 0, unpaidValue = 0;
  for (const o of orders) {
    totalValue += orderTotal(o);
    collected += capturedAmount(o);
    refunded += refundedAmount(o);
    unpaidValue += outstandingValue(o);
  }
  return {
    totalOrders: orders.length, // one order counts once, whatever its product/attempt count
    totalValue,
    collected,
    refunded,
    netCollected: collected - refunded,
    unpaidValue,
  };
}

export type PaymentDistribution = Record<PaymentBucket, { count: number; amount: number }>;

/** Count + money for each payment bucket. `amount` is the captured amount so the
 *  buckets reconcile with "collected" (refunded rows still show what was taken). */
export function computePaymentDistribution(orders: OrderDoc[]): PaymentDistribution {
  const empty = (): { count: number; amount: number } => ({ count: 0, amount: 0 });
  const dist: PaymentDistribution = {
    paid: empty(), unpaid: empty(), partially_refunded: empty(), refunded: empty(), pending: empty(),
  };
  for (const o of orders) {
    const b = paymentBucket(o);
    dist[b].count += 1;
    // Unpaid/pending have no captured money — show the order value instead so
    // the column is meaningful; captured buckets show captured.
    dist[b].amount += b === "unpaid" || b === "pending" ? orderTotal(o) : capturedAmount(o);
  }
  return dist;
}

export type SellerBreakdownRow = {
  sellerKey: string;
  sellerName: string;
  sellerType: OrderDoc["sellerType"];
  orders: number;
  value: number;
  accepted: number;
  dispatched: number;
  delivered: number;
  cancelledRejected: number;
  collected: number;
  refunded: number;
};

export type SellerSortKey = "orders" | "value" | "collected";

/**
 * Per-seller rollup keyed by the order's ACTUAL assigned seller
 * (order.sellerId — reassignments move this, so the current owner is credited).
 * Status columns count an order by its CURRENT status.
 */
export function computeSellerBreakdown(orders: OrderDoc[], sortBy: SellerSortKey = "value"): SellerBreakdownRow[] {
  const byKey = new Map<string, SellerBreakdownRow>();
  for (const o of orders) {
    const key = o.sellerId || o.sellerPhone || o.sellerName || "—";
    let row = byKey.get(key);
    if (!row) {
      row = {
        sellerKey: key,
        sellerName: o.sellerName || o.sellerId || "—",
        sellerType: o.sellerType,
        orders: 0, value: 0, accepted: 0, dispatched: 0, delivered: 0,
        cancelledRejected: 0, collected: 0, refunded: 0,
      };
      byKey.set(key, row);
    }
    // Keep the friendliest name we have seen for this seller.
    if (!row.sellerName || row.sellerName === "—") row.sellerName = o.sellerName || o.sellerId || "—";
    row.orders += 1;
    row.value += orderTotal(o);
    row.collected += capturedAmount(o);
    row.refunded += refundedAmount(o);
    if (o.status === "accepted") row.accepted += 1;
    if (o.status === "dispatched") row.dispatched += 1;
    if (o.status === "delivered") row.delivered += 1;
    if (o.status === "cancelled" || o.status === "rejected") row.cancelledRejected += 1;
  }
  const rows = Array.from(byKey.values());
  rows.sort((a, b) =>
    sortBy === "orders" ? b.orders - a.orders
      : sortBy === "collected" ? b.collected - a.collected
        : b.value - a.value);
  return rows;
}
