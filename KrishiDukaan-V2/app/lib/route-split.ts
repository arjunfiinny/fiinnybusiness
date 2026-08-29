/**
 * How a customer's payment is divided between the seller and KrishiDukan.
 *
 * WHY THIS EXISTS
 * ---------------
 * Money splitting is the one calculation where a rounding slip or a stale
 * constant does not show up as a bug report — it shows up as a seller being
 * underpaid, quietly, on every order. The subscription price table taught the
 * same lesson the expensive way: three copies of a number, none of which the
 * admin screen could reach, and books that disagreed with the gateway.
 *
 * So: one module, one function, integer paise throughout, rates read from
 * Firestore rather than baked in.
 *
 * THE SPLIT
 * ---------
 * The buyer pays the seller's gross (their items + GST + that seller's delivery
 * charge). Out of it:
 *
 *   platform fee          1% of gross            — KrishiDukan's cut
 *   gateway fee           ~2% + 18% GST on it    — borne by the SELLER
 *   -----------------------------------------------------------------
 *   transfer to seller    gross - commission - gateway fee
 *
 * NOTHING HERE USES FLOATING POINT. Rupee amounts arrive as paise integers and
 * stay that way. `2.36% of 1075.50` in float is how you end up transferring a
 * paise more than you hold.
 *
 * DEDUCTIONS ROUND UP, DELIBERATELY. Razorpay takes its fee off the platform
 * balance before transfers settle, so an under-estimated fee means transferring
 * money that is not there. Rounding each deduction up costs the seller at most
 * one paise per order and makes over-transfer impossible.
 */

/** Firestore path holding the live split configuration. */
export const ROUTE_CONFIG_PATH = { collection: "settings", doc: "route" } as const;

export interface RouteConfig {
  /** KrishiDukan's cut, as a percentage of the seller's gross. */
  commissionPercent: number;
  /** Razorpay's transaction fee percentage (excluding GST on the fee). */
  gatewayFeePercent: number;
  /** GST charged on the gateway fee itself. 18% at the time of writing. */
  gatewayFeeGstPercent: number;
  /**
   * Who absorbs the gateway fee. 'seller' deducts it from the transfer;
   * 'platform' leaves the seller whole and KrishiDukan bears it.
   */
  feeBearer: "seller" | "platform";
  /**
   * Whether transfers are created on hold. Held transfers do not settle to the
   * seller until explicitly released — which is what lets an order be reversed
   * after payment but before delivery.
   */
  holdTransfers: boolean;
}

/**
 * Live defaults. Used when settings/route is missing or malformed, so a bad
 * config document degrades to a known-correct split rather than taking checkout
 * down or, worse, transferring an arbitrary amount.
 */
export const DEFAULT_ROUTE_CONFIG: RouteConfig = {
  // 1%, matching the platform fee published in the Seller & Manufacturer
  // Subscription Terms (app/seller-terms/page.tsx) and on /sell. These two
  // numbers are the same number: the published rate is read from settings/route
  // via app/lib/legal.ts, and this is the value that applies when that document
  // is missing. It was 1.5% while nothing published a rate at all; deducting
  // more than the Terms state is not a discrepancy anyone would forgive.
  commissionPercent: 1,
  gatewayFeePercent: 2,
  gatewayFeeGstPercent: 18,
  feeBearer: "seller",
  holdTransfers: true,
};

/**
 * Validate a raw Firestore value into a usable config.
 * Returns null (never a partial config) so callers fall back cleanly.
 */
export function parseRouteConfig(raw: unknown): RouteConfig | null {
  const d = raw as Partial<RouteConfig> | null | undefined;
  if (!d || typeof d !== "object") return null;

  const pct = (v: unknown, max: number): number | null => {
    const n = Number(v);
    // A negative or absurd percentage is a data error, not something to clamp:
    // silently "fixing" 150% to 100% would still pay the seller nothing.
    if (!Number.isFinite(n) || n < 0 || n > max) return null;
    return n;
  };

  const commissionPercent = pct(d.commissionPercent, 100);
  const gatewayFeePercent = pct(d.gatewayFeePercent, 100);
  const gatewayFeeGstPercent = pct(d.gatewayFeeGstPercent, 100);
  if (commissionPercent === null) return null;
  if (gatewayFeePercent === null) return null;
  if (gatewayFeeGstPercent === null) return null;

  const feeBearer = d.feeBearer === "platform" ? "platform" : "seller";
  const holdTransfers = d.holdTransfers !== false;

  return {
    commissionPercent,
    gatewayFeePercent,
    gatewayFeeGstPercent,
    feeBearer,
    holdTransfers,
  };
}

export interface SellerSplit {
  /** What the buyer paid for this seller's portion, in paise. */
  grossPaise: number;
  /** KrishiDukan's commission, in paise. */
  commissionPaise: number;
  /** Gateway fee attributed to this seller, in paise. Zero when platform-borne. */
  gatewayFeePaise: number;
  /** What actually moves to the seller's linked account, in paise. */
  transferPaise: number;
}

/** Percentage of a paise amount, rounded up to a whole paise. */
function pctOfPaise(paise: number, percent: number): number {
  if (percent <= 0) return 0;
  // Scaled integer arithmetic: percent carries at most 2 decimals, so multiply
  // through by 10_000 and divide once. Keeps 1.5% of 107550 exact.
  return Math.ceil((paise * Math.round(percent * 100)) / 10_000);
}

/**
 * Split one seller's share of a payment.
 *
 * Throws on a non-positive gross — a zero-rupee order should never have reached
 * a payment gateway, and creating a transfer for it would fail at Razorpay with
 * a far less obvious message.
 */
export function computeSellerSplit(
  grossPaise: number,
  config: RouteConfig = DEFAULT_ROUTE_CONFIG,
): SellerSplit {
  const gross = Math.round(Number(grossPaise));
  if (!Number.isFinite(gross) || gross <= 0) {
    throw new Error(`computeSellerSplit: gross must be a positive paise amount, got ${grossPaise}`);
  }

  const commissionPaise = pctOfPaise(gross, config.commissionPercent);

  // The gateway fee is charged on the whole captured payment; each seller bears
  // the share proportional to their slice of it, which is what applying the rate
  // to their gross amounts to.
  const feeBase = pctOfPaise(gross, config.gatewayFeePercent);
  const feeGst = pctOfPaise(feeBase, config.gatewayFeeGstPercent);
  const gatewayFeePaise = config.feeBearer === "seller" ? feeBase + feeGst : 0;

  const transferPaise = gross - commissionPaise - gatewayFeePaise;
  if (transferPaise <= 0) {
    throw new Error(
      `computeSellerSplit: deductions (${commissionPaise + gatewayFeePaise}) ` +
        `meet or exceed the gross (${gross}). Check settings/route.`,
    );
  }

  return { grossPaise: gross, commissionPaise, gatewayFeePaise, transferPaise };
}

/**
 * Guard run before an order is sent to Razorpay.
 *
 * Razorpay rejects an order whose transfers exceed its amount, but it does so
 * at checkout — in front of the customer. Failing here instead turns a payment
 * failure into a server error we can see in logs.
 */
export function assertTransfersFit(orderAmountPaise: number, splits: SellerSplit[]): void {
  const total = splits.reduce((sum, s) => sum + s.transferPaise, 0);
  if (total > orderAmountPaise) {
    throw new Error(
      `Route transfers (${total} paise) exceed the order amount (${orderAmountPaise} paise).`,
    );
  }
}

/**
 * Split an order amount across sellers in proportion to their subtotals.
 *
 * Uses largest-remainder rather than rounding each share independently: three
 * sellers on a Rs 100.01 order rounded separately lose a paise nobody owns, and
 * a paise that belongs to no one is a reconciliation bug that surfaces months
 * later. The returned shares sum to EXACTLY orderAmountPaise.
 *
 * Deriving each share from the captured amount (rather than summing per-seller
 * figures) also means delivery charges and any client/server rounding gap are
 * distributed across sellers instead of being stranded.
 */
export function allocateShares(
  orderAmountPaise: number,
  entries: Array<[string, number]>,
): Array<{ key: string; paise: number }> {
  const positive = entries.filter(([, v]) => Number(v) > 0);
  if (positive.length === 0 || orderAmountPaise <= 0) return [];

  const total = positive.reduce((sum, [, v]) => sum + Number(v), 0);
  if (total <= 0) return [];

  const exact = positive.map(([key, value]) => ({
    key,
    exact: (Number(value) / total) * orderAmountPaise,
  }));
  const shares = exact.map((e) => ({ key: e.key, paise: Math.floor(e.exact) }));

  let remainder = orderAmountPaise - shares.reduce((sum, sh) => sum + sh.paise, 0);
  const byRemainder = exact
    .map((e, i) => ({ i, frac: e.exact - Math.floor(e.exact) }))
    .sort((a, b) => b.frac - a.frac);
  for (let n = 0; n < byRemainder.length && remainder > 0; n++, remainder--) {
    shares[byRemainder[n]!.i]!.paise += 1;
  }

  return shares;
}
