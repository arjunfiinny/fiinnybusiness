/**
 * The one-line commercial summary shown in the "list your store" CTA on the
 * help pages and the four store-directory pages.
 *
 * WHY IT IS A COMPONENT
 * ---------------------
 * That sentence was written out by hand in six places, each saying "0%
 * commission on every sale — you pay ₹21 per product listing". Six copies of
 * two numbers, none of them connected to the code that charges them, is exactly
 * how the "0% commission" claim survived the introduction of a platform fee.
 *
 * So the numbers are read here, once, from the same two Firestore documents the
 * checkout and the payment split use — settings/pricing and settings/route. A
 * rate change in the admin screen moves all six CTAs.
 *
 * Async server component: every page that renders it is SSR with its own
 * revalidate window, so this adds one cached Firestore read per page build, not
 * one per request.
 */
import { doc, getDoc } from "firebase/firestore/lite";
import { getClientDb } from "../../app/lib/firebase-client-server";
import { loadPublicFeeRates, pct } from "../../app/lib/legal";
import { DEFAULT_DURATIONS, PRICING_DOC_PATH, parseDurations } from "../../app/lib/pricing";

/** Cheapest per-listing rate on the live ladder, with its period. */
async function loadEntry(): Promise<{ price: number; months: number } | null> {
  let durations = DEFAULT_DURATIONS;
  try {
    const snap = await getDoc(
      doc(getClientDb(), PRICING_DOC_PATH.collection, PRICING_DOC_PATH.doc),
    );
    if (snap.exists()) durations = parseDurations(snap.data()) ?? DEFAULT_DURATIONS;
  } catch (err) {
    console.warn("[seller-pricing-line] pricing read failed, using defaults:", err);
  }
  // Bundle plans are excluded: "Rs 4,999 for 50 listings" is not a per-product
  // rate, and quoting it as "from Rs 4,999 per listing" would be wrong.
  const perListing = durations.filter((d) => typeof d.flatPrice !== "number");
  if (perListing.length === 0) return null;
  const entry = perListing.reduce((a, b) => (b.months < a.months ? b : a));
  return { price: entry.pricePerSeat, months: entry.months };
}

export default async function SellerPricingLine() {
  const [fees, entry] = await Promise.all([loadPublicFeeRates(), loadEntry()]);

  const period = !entry ? "" : entry.months === 1 ? "month" : `${entry.months} months`;

  return (
    <>
      {entry ? (
        <>
          From ₹{entry.price} per product listing per {period}, plus a{" "}
          {pct(fees.platformFeePercent)} platform fee on successful online sales.
        </>
      ) : (
        <>
          A {pct(fees.platformFeePercent)} platform fee applies to successful online
          sales, in addition to your listing subscription.
        </>
      )}{" "}
      Payment gateway charges (currently around {pct(fees.gatewayFeePercent)}, levied
      by the payment service provider) and applicable taxes are additional.
    </>
  );
}
