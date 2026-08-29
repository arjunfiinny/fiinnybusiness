/**
 * The commercial rates the legal documents and the seller-facing marketing
 * pages quote, resolved from the same Firestore document the payment split uses.
 *
 * WHY THIS EXISTS
 * ---------------
 * Same lesson as app/lib/pricing.ts, applied to legal copy. Before this, the
 * "0% commission" claim lived in ten hand-written places — the /sell hero, the
 * /sell JSON-LD, four store-directory CTAs, two help CTAs and two dashboard
 * panels — and nothing kept them in sync with what the code actually deducted.
 * They ended up promising something the money-splitting code contradicted.
 *
 * So every page that states a rate imports it from here, and the rates
 * themselves are read from settings/route — the SAME document
 * app/lib/route-split.ts splits a payment with. A published rate cannot drift
 * from a charged one.
 *
 * SERVER-SIDE ONLY, because of the Firestore import. Client components that
 * need the routes, the entity or the version string import
 * app/lib/legal-constants.ts instead; everything in it is re-exported here so a
 * server component still only has to import one module.
 */
import { doc, getDoc } from "firebase/firestore/lite";
import { getClientDb } from "./firebase-client-server";
import {
  DEFAULT_ROUTE_CONFIG,
  ROUTE_CONFIG_PATH,
  parseRouteConfig,
  type RouteConfig,
} from "./route-split";

export {
  COMPANY,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_ROUTES,
  SITE_URL,
  TERMS_VERSION,
  pct,
} from "./legal-constants";

/**
 * The transaction charges quoted in prose, resolved from settings/route.
 *
 * `gatewayFeePercent` is quoted as an approximation everywhere it appears,
 * because it is the payment service provider's charge and not ours to fix. See
 * the wording in app/seller-terms/page.tsx clause 5.
 */
export interface PublicFeeRates {
  /** KrishiDukan's platform fee on a successful online transaction, in percent. */
  platformFeePercent: number;
  /** The payment gateway's current approximate charge, in percent. */
  gatewayFeePercent: number;
  /** GST currently charged on the gateway fee itself, in percent. */
  gatewayFeeGstPercent: number;
  /** platformFeePercent + gatewayFeePercent — the current base charge. */
  baseTransactionPercent: number;
  /** Whether the seller or the platform absorbs the gateway fee. */
  feeBearer: RouteConfig["feeBearer"];
}

/** Derive the display rates from a split configuration. */
export function toPublicFeeRates(config: RouteConfig): PublicFeeRates {
  return {
    platformFeePercent: config.commissionPercent,
    gatewayFeePercent: config.gatewayFeePercent,
    gatewayFeeGstPercent: config.gatewayFeeGstPercent,
    // Rounded to two places: 1 + 2 in floating point is fine, but an admin who
    // sets 1.15% should not produce "3.1500000000000004%" on a legal page.
    baseTransactionPercent:
      Math.round((config.commissionPercent + config.gatewayFeePercent) * 100) / 100,
    feeBearer: config.feeBearer,
  };
}

/**
 * Read the live rates for a public, unauthenticated page.
 *
 * Uses the client-lite SDK against settings/route, which firestore.rules makes
 * world-readable for exactly this reason (the same way /sell reads
 * settings/pricing). Falls back to the built-in defaults on any failure — a
 * legal page must render even when Firestore does not answer, and the defaults
 * are the rates the split code would apply in that same situation.
 */
export async function loadPublicFeeRates(): Promise<PublicFeeRates> {
  let config = DEFAULT_ROUTE_CONFIG;
  try {
    const snap = await getDoc(
      doc(getClientDb(), ROUTE_CONFIG_PATH.collection, ROUTE_CONFIG_PATH.doc),
    );
    if (snap.exists()) config = parseRouteConfig(snap.data()) ?? DEFAULT_ROUTE_CONFIG;
  } catch (err) {
    console.warn("[legal] route config read failed, using defaults:", err);
  }
  return toPublicFeeRates(config);
}
