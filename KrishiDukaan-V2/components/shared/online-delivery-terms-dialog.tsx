"use client";

/**
 * The commercial terms a seller accepts before Online Delivery is switched on.
 *
 * WHY A BLOCKING DIALOG
 * ---------------------
 * Turning Online Delivery on is the moment a seller starts being charged a
 * percentage of every sale. Until now that was agreed over email, one partner
 * at a time; this is the same deal, shown to everyone who enables it, with an
 * explicit "I agree" recorded against the account (see DELIVERY_TERMS_VERSION).
 *
 * WHERE THE NUMBERS COME FROM
 * ---------------------------
 * Every rate is read at open time from the SAME two documents that charge it —
 * settings/pricing for the listing fee and settings/route for the platform and
 * gateway percentages. Nothing here is typed in by hand. A seller who is quoted
 * 1% and charged 1.5% has a complaint that no amount of drafting fixes, and the
 * only way to guarantee that cannot happen is to never write the number twice.
 *
 * If either document is unreadable the built-in defaults are shown — the same
 * values the split itself falls back to, so the quote still matches the charge.
 */
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { AlertTriangle, Loader2, Truck, X } from "lucide-react";
import { db } from "../../app/firebase";
import {
  DEFAULT_ROUTE_CONFIG,
  ROUTE_CONFIG_PATH,
  parseRouteConfig,
  type RouteConfig,
} from "../../app/lib/route-split";
import {
  DEFAULT_DURATIONS,
  PRICING_DOC_PATH,
  parseDurations,
} from "../../app/lib/pricing";
import { COMPANY, LEGAL_ROUTES, pct } from "../../app/lib/legal-constants";

/** Cheapest per-listing monthly rate on the live ladder. */
function monthlyListingFee(durations: typeof DEFAULT_DURATIONS): number | null {
  // Bundles are excluded: "₹4,999 for 50 listings" is not a per-product rate.
  const perListing = durations.filter((d) => typeof d.flatPrice !== "number");
  if (perListing.length === 0) return null;
  const cheapest = perListing.reduce((a, b) => (b.months < a.months ? b : a));
  return Math.round(cheapest.pricePerSeat / cheapest.months);
}

/** The rates as displayed, handed back so the caller can record what was shown. */
export interface DisplayedDeliveryRates {
  listingFeePerMonth: number | null;
  platformFeePercent: number;
  gatewayFeePercent: number;
  gstPercent: number;
}

interface Props {
  open: boolean;
  /**
   * Runs only after the seller has ticked the box and pressed Agree, and is
   * handed the rates that were on screen — recording those, rather than
   * re-reading settings afterwards, is what makes the record honest if an admin
   * changes a rate a second later.
   */
  onAgree: (rates: DisplayedDeliveryRates) => void;
  onCancel: () => void;
  /** True while the caller is writing the enable to Firestore. */
  busy?: boolean;
}

export function OnlineDeliveryTermsDialog({ open, onAgree, onCancel, busy }: Props) {
  const [config, setConfig] = useState<RouteConfig>(DEFAULT_ROUTE_CONFIG);
  const [listingFee, setListingFee] = useState<number | null>(21);
  const [loading, setLoading] = useState(true);
  const [agreed, setAgreed] = useState(false);

  // Re-read on every open rather than once per mount: an admin can change a
  // rate between two sellers enabling delivery in the same browser session.
  useEffect(() => {
    if (!open) return;
    setAgreed(false);
    setLoading(true);
    let cancelled = false;

    (async () => {
      try {
        const [routeSnap, pricingSnap] = await Promise.all([
          getDoc(doc(db, ROUTE_CONFIG_PATH.collection, ROUTE_CONFIG_PATH.doc)),
          getDoc(doc(db, PRICING_DOC_PATH.collection, PRICING_DOC_PATH.doc)),
        ]);
        if (cancelled) return;
        if (routeSnap.exists()) {
          setConfig(parseRouteConfig(routeSnap.data()) ?? DEFAULT_ROUTE_CONFIG);
        }
        if (pricingSnap.exists()) {
          setListingFee(
            monthlyListingFee(parseDurations(pricingSnap.data()) ?? DEFAULT_DURATIONS),
          );
        }
      } catch (err) {
        // Defaults are already in state and match what the split applies.
        console.warn("[delivery-terms] rate read failed, showing defaults:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const totalPct = config.commissionPercent + config.gatewayFeePercent;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-terms-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl bg-surface-container-lowest shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/30 px-5 py-4">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary shrink-0" />
            <h2 id="delivery-terms-title" className="text-base font-semibold text-on-surface">
              Online Delivery — Terms &amp; Conditions
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-on-surface">
          <p className="mb-4 text-on-surface-variant">
            Enabling Online Delivery lets farmers and other buyers discover and order your
            products on {COMPANY.brand} and have them delivered. Please read and accept the
            terms below before continuing.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading current rates…
            </div>
          ) : (
            <ol className="flex flex-col gap-4">
              <li>
                <h3 className="font-semibold">1. Product listing and online sales</h3>
                <p className="mt-1 text-on-surface-variant">
                  You may list your products on {COMPANY.brand}, where buyers can discover
                  and purchase them online.
                  {listingFee !== null && (
                    <> The product listing fee is <strong>₹{listingFee} per product (SKU) per month</strong>.</>
                  )}{" "}
                  You are not required to hold any inventory with {COMPANY.brand} — you
                  manage your own stock and fulfilment.
                </p>
              </li>

              <li>
                <h3 className="font-semibold">2. Transaction charges</h3>
                <p className="mt-1 text-on-surface-variant">
                  On each successful online transaction through {COMPANY.brand}:
                </p>
                <ul className="mt-2 flex flex-col gap-1 rounded-xl bg-surface-container px-4 py-3">
                  <li className="flex justify-between gap-4">
                    <span>{COMPANY.brand} platform fee</span>
                    <strong>{pct(config.commissionPercent)} of transaction value</strong>
                  </li>
                  <li className="flex justify-between gap-4">
                    <span>Payment gateway fee (current)</span>
                    <strong>{pct(config.gatewayFeePercent)} of transaction value</strong>
                  </li>
                  <li className="flex justify-between gap-4 border-t border-outline-variant/30 pt-1">
                    <span>Total current transaction charges</span>
                    <strong>{pct(totalPct)} of transaction value</strong>
                  </li>
                </ul>
                <p className="mt-2 text-on-surface-variant">
                  GST at {pct(config.gatewayFeeGstPercent)} is applicable separately on the
                  applicable charges, as per prevailing GST regulations.
                </p>
                <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    Payment gateway charges are levied by the payment gateway provider and
                    are not controlled or determined by {COMPANY.brand}. The gateway fee may
                    change in future depending on the payment method, the gateway provider,
                    the applicable pricing plan, or changes introduced by the provider. The{" "}
                    {COMPANY.brand} platform fee remains separate from gateway charges.
                  </span>
                </p>
              </li>

              <li>
                <h3 className="font-semibold">3. Order fulfilment and delivery</h3>
                <p className="mt-1 text-on-surface-variant">
                  {COMPANY.brand} provides the platform for product discovery and online
                  ordering. Packing, dispatch, shipping and delivery of every order are
                  managed by you. You therefore control how your products are packed, which
                  delivery or logistics partner is used, and how orders are fulfilled.{" "}
                  {COMPANY.brand} does not currently provide logistics or delivery services.
                </p>
              </li>

              <li>
                <h3 className="font-semibold">4. Product discovery</h3>
                <p className="mt-1 text-on-surface-variant">
                  Your products will have their own listings on {COMPANY.brand}, where users
                  can view details such as composition, pack sizes and applications. If your
                  products are also sold through physical retail stores, those retailers can
                  be onboarded separately so farmers can discover where your products are
                  available locally.
                </p>
              </li>

              <li>
                <h3 className="font-semibold">5. Reels and farmer education</h3>
                <p className="mt-1 text-on-surface-variant">
                  You may upload agricultural and product-related reels — product education,
                  applications and usage, crop guidance and farmer awareness content.
                  Products can be linked to relevant content so a farmer can move from
                  learning about a product to finding or buying it. This is optional.
                </p>
              </li>
            </ol>
          )}

          <p className="mt-4 text-xs text-on-surface-variant">
            These terms apply in addition to the{" "}
            <a href={LEGAL_ROUTES.sellerTerms} target="_blank" rel="noopener noreferrer"
               className="font-medium underline hover:no-underline">
              Seller &amp; Manufacturer Terms
            </a>{" "}
            and the{" "}
            <a href={LEGAL_ROUTES.terms} target="_blank" rel="noopener noreferrer"
               className="font-medium underline hover:no-underline">
              Terms of Use
            </a>
            . You can turn Online Delivery off at any time from this page.
          </p>
        </div>

        <div className="border-t border-outline-variant/30 px-5 py-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-on-surface">
            <input
              type="checkbox"
              checked={agreed}
              disabled={loading || busy}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            />
            <span>
              I have read and agree to these Online Delivery terms, including the platform
              fee and payment gateway charges above.
            </span>
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                onAgree({
                  listingFeePerMonth: listingFee,
                  platformFeePercent: config.commissionPercent,
                  gatewayFeePercent: config.gatewayFeePercent,
                  gstPercent: config.gatewayFeeGstPercent,
                })
              }
              disabled={!agreed || loading || busy}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-95 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Enabling…" : "Agree & Enable Online Delivery"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="inline-flex items-center rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
