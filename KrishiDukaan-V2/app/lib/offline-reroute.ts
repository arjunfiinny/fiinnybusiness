/**
 * Checkout reroute for products listed by stores that cannot deliver online.
 *
 * App builds before PR #178 built every `availability[]` store as orderable and
 * picked the nearest one for "Buy now". For Karan Arjun Power Plus only a few of
 * ~60 stores deliver online, so most app checkouts failed with
 * `seller_not_eligible`. Users can't all be made to update, so for the products
 * listed here ONLY, a line sent to a store that cannot deliver online is moved
 * to the named store that does. Every other product, and any line whose store
 * can deliver, is left exactly as sent.
 *
 * Pure: create-cart-order does the reads and passes the facts in.
 */
import { makeSellerMatcher } from './cart-pricing';

/** productId → the store (phone) that fulfils its online orders. */
export const OFFLINE_REROUTE: Readonly<Record<string, string>> = {
  // Karan Arjun Power Plus → KaranArjun Krushi Seva Kendra Nandgaon (owner's call, 26 Nov 2026)
  MhdOeDTFMn5065FvFeAM: '+918658031942',
};

const SELLER_PHONE_RE = /^(\+91)?[6-9]\d{9}$/;
const last10 = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-10);

export type RerouteFacts = {
  productId: string;
  /** sellerPhone the client sent, else its sellerId ('' when none). */
  sentSeller: string;
  /**
   * Every seller identifier the client sent (sellerPhone AND sellerId). The
   * sent store's availability entry is found with all of them, exactly as
   * create-cart-order's own lookup does, so both pick the same entry when a
   * store is listed twice. Defaults to [sentSeller].
   */
  sentSellerIds?: Array<string | null | undefined>;
  /** The canonical product's availability[] entries. */
  availability: Array<Record<string, unknown>>;
  /** Account-level online delivery, as create-cart-order reads it. */
  accountOnline: (phone: string) => boolean;
};

/** The store to send this line to instead, or null to leave it as sent. */
export function rerouteTarget(f: RerouteFacts): string | null {
  const target = OFFLINE_REROUTE[f.productId];
  if (!target) return null;
  const sent = f.sentSeller.trim();
  // No seller sent: the server resolves the product owner itself — unchanged.
  if (!sent) return null;
  if (last10(sent) === last10(target)) return null;

  // Can the sent store deliver? Same two tests as create-cart-order's
  // eligibility check: account online AND its listing not isOnline:false.
  const sentEntry = f.availability.find(makeSellerMatcher([sent, ...(f.sentSellerIds ?? [])]));
  const sentListingOnline = sentEntry ? sentEntry.isOnline !== false : true;
  if (SELLER_PHONE_RE.test(sent) && f.accountOnline(sent) && sentListingOnline) return null;

  // Only move it to a target that can really take the order.
  const targetEntry = f.availability.find(makeSellerMatcher([target]));
  if (!targetEntry || targetEntry.isOnline === false) return null;
  if (String(targetEntry.stockLevel ?? '').toLowerCase().includes('out')) return null;
  if (!f.accountOnline(target)) return null;
  return target;
}
