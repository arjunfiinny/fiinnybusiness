/**
 * Seller earnings — what a seller is owed, what is still on hold, and what has
 * already been paid out.
 *
 * Derived from the seller's own `orders` documents rather than a separate
 * ledger, so it can never drift from the orders the seller already sees. Once
 * Razorpay Route transfers go live, an order's recorded transfer takes
 * precedence over the derived state (see `payoutStateFor`).
 */

/** Days after an order is marked delivered before its money is released.
 *
 * Matches the refund window the support FAQ already promises customers
 * ("5-7 business days"): releasing sooner would push money to a seller before
 * the customer's own refund window has closed, and Route transfers must be
 * reversed to claw that back. */
export const PAYOUT_HOLD_DAYS = 7;

/** KrishiDukan takes no commission — a public promise on /sell ("0%
 *  commission, always... we do not deduct a marketplace commission, ever").
 *  Only the payment gateway's own fee is deducted, and that is charged by
 *  Razorpay, not by us. Kept as a named constant so any future change is a
 *  deliberate edit here rather than an arithmetic tweak somewhere. */
export const PLATFORM_COMMISSION_RATE = 0;

export type PayoutState =
  /** Order not delivered yet — nothing is owed until it is. */
  | "awaiting_delivery"
  /** Delivered, inside the hold window. */
  | "on_hold"
  /** Hold elapsed — due to be transferred. */
  | "due"
  /** Razorpay transfer created for this order. */
  | "transferred"
  /** Order cancelled/rejected — never payable. */
  | "not_payable";

export type OrderLike = {
  id: string;
  status?: string;
  /** Mobile writes `total`; web writes `grandTotal`. Same meaning, and both
   *  appear in production, so both must be read. */
  total?: number;
  grandTotal?: number;
  subtotal?: number;
  deliveryCharge?: number;
  totalGst?: number;
  createdAt?: unknown;
  statusHistory?: { status?: string; at?: string }[];
  payment?: {
    gatewayFee?: number;
    gatewayTax?: number;
    razorpayPaymentId?: string;
    /** Set once a Route transfer exists for this order. */
    transferId?: string;
    transferredAt?: string;
  };
};

export type SellerEarningsRow = {
  orderId: string;
  gross: number;
  gatewayFee: number;
  net: number;
  state: PayoutState;
  deliveredAt: Date | null;
  releaseOn: Date | null;
};

export type SellerEarningsSummary = {
  /** Delivered, hold elapsed, not yet transferred — the headline "ready" number. */
  due: number;
  /** Delivered but still inside the hold window. */
  onHold: number;
  /** Orders placed but not yet delivered. */
  awaitingDelivery: number;
  /** Already transferred out. */
  paidOut: number;
  /** Gateway fees deducted across all counted orders, for transparency. */
  gatewayFees: number;
  /** Earliest date on which any on-hold money becomes due. */
  nextReleaseOn: Date | null;
  rows: SellerEarningsRow[];
};

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  // Firestore Timestamp
  const ts = v as { toDate?: () => Date; seconds?: number };
  if (typeof ts.toDate === "function") return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** The seller's share of an order. Mobile and web disagree on the field name. */
export function grossFor(order: OrderLike): number {
  const value = order.total ?? order.grandTotal;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // Fall back to the parts when neither total field is present.
  return (
    (order.subtotal ?? 0) + (order.deliveryCharge ?? 0) + (order.totalGst ?? 0)
  );
}

/** When the order was marked delivered, from its own status history. */
export function deliveredAtFor(order: OrderLike): Date | null {
  if (!Array.isArray(order.statusHistory)) return null;
  // Last delivered entry wins — an order re-marked delivered after a
  // correction should hold from the corrected date, not the first attempt.
  for (let i = order.statusHistory.length - 1; i >= 0; i -= 1) {
    const entry = order.statusHistory[i];
    if (entry?.status === "delivered") return toDate(entry.at);
  }
  return null;
}

export function payoutStateFor(order: OrderLike, now = new Date()): {
  state: PayoutState;
  deliveredAt: Date | null;
  releaseOn: Date | null;
} {
  // A recorded transfer is authoritative — it means money actually moved,
  // regardless of what the derived rules would say.
  if (order.payment?.transferId) {
    return { state: "transferred", deliveredAt: deliveredAtFor(order), releaseOn: null };
  }

  const status = (order.status ?? "").toLowerCase();
  if (status === "cancelled" || status === "rejected" || status === "refunded") {
    return { state: "not_payable", deliveredAt: null, releaseOn: null };
  }

  const deliveredAt = deliveredAtFor(order);
  // Trust the explicit status even if statusHistory is missing the entry —
  // web seeds statusHistory but older orders may predate it.
  const isDelivered = status === "delivered" || deliveredAt !== null;
  if (!isDelivered) {
    return { state: "awaiting_delivery", deliveredAt: null, releaseOn: null };
  }

  // No delivered timestamp to hold from: treat as due rather than trapping the
  // money in a hold that can never elapse.
  if (!deliveredAt) {
    return { state: "due", deliveredAt: null, releaseOn: null };
  }

  const releaseOn = new Date(deliveredAt.getTime());
  releaseOn.setDate(releaseOn.getDate() + PAYOUT_HOLD_DAYS);

  return {
    state: releaseOn.getTime() <= now.getTime() ? "due" : "on_hold",
    deliveredAt,
    releaseOn,
  };
}

export function computeSellerEarnings(
  orders: OrderLike[],
  now = new Date(),
): SellerEarningsSummary {
  const rows: SellerEarningsRow[] = [];
  let due = 0;
  let onHold = 0;
  let awaitingDelivery = 0;
  let paidOut = 0;
  let gatewayFees = 0;
  let nextReleaseOn: Date | null = null;

  for (const order of orders) {
    const { state, deliveredAt, releaseOn } = payoutStateFor(order, now);
    if (state === "not_payable") continue;

    const gross = grossFor(order);
    // Gateway fee is only known once /api/payment/fee has fetched it from
    // Razorpay; treat unknown as 0 rather than guessing a rate, so the number
    // shown is never a fabricated deduction.
    const gatewayFee =
      (order.payment?.gatewayFee ?? 0) + (order.payment?.gatewayTax ?? 0);
    const net = Math.max(0, gross - gatewayFee);

    rows.push({ orderId: order.id, gross, gatewayFee, net, state, deliveredAt, releaseOn });
    gatewayFees += gatewayFee;

    if (state === "due") due += net;
    else if (state === "on_hold") {
      onHold += net;
      if (releaseOn && (!nextReleaseOn || releaseOn < nextReleaseOn)) {
        nextReleaseOn = releaseOn;
      }
    } else if (state === "awaiting_delivery") awaitingDelivery += net;
    else if (state === "transferred") paidOut += net;
  }

  // Newest activity first.
  rows.sort((a, b) => {
    const av = a.deliveredAt?.getTime() ?? 0;
    const bv = b.deliveredAt?.getTime() ?? 0;
    return bv - av;
  });

  return { due, onHold, awaitingDelivery, paidOut, gatewayFees, nextReleaseOn, rows };
}
