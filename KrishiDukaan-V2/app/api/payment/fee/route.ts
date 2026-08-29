/**
 * POST /api/payment/fee — the real payment-gateway charge on one order.
 *
 * The seller's payout is `order total − KrishiDukan platform fee − gateway fee`.
 * The platform fee used to be reported as a hardcoded 0 here, which was the API
 * end of the site-wide "0% commission" claim; it is now derived from
 * settings/route, the same document app/lib/route-split.ts splits the payment
 * with, so the figure shown to the seller is the figure actually deducted.
 *
 * Showing the gateway charge honestly needs Razorpay's ACTUAL fee, which is not
 * in the payment-success payload the client sees — it only appears on the
 * payment entity after capture. So it is fetched here with the key secret and
 * cached onto the order doc, which also gives reconciliation a stored number
 * rather than a recomputed guess.
 *
 * Authorisation: the caller must be the seller on that order (or an admin).
 * Fee data is business-sensitive and this route runs with the key secret, so
 * it verifies a Firebase ID token rather than trusting anything in the body.
 */
import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAdminDb, getAdminAuth } from "../../../lib/firebase-admin";
import { loadRouteConfig } from "../../../lib/route-server";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/** Razorpay returns paise; the order docs store rupees. */
const toRupees = (paise: unknown): number =>
  typeof paise === "number" ? Math.round(paise) / 100 : 0;

/**
 * KrishiDukan's platform fee on one order, in rupees.
 *
 * Derived from the same rate and the same rounding rule computeSellerSplit()
 * uses, so the number the seller reads on the order matches the number deducted
 * from the transfer rather than being an independently-rounded second opinion.
 * A config read failure yields null — an honest "unavailable" beats a confident
 * wrong figure on a money screen.
 */
async function platformFeeFor(order: Record<string, any>): Promise<number | null> {
  const gross = Number(order.grandTotal ?? order.subtotal ?? 0);
  if (!Number.isFinite(gross) || gross <= 0) return null;
  try {
    const { commissionPercent } = await loadRouteConfig();
    if (commissionPercent <= 0) return 0;
    const grossPaise = Math.round(gross * 100);
    const feePaise = Math.ceil(
      (grossPaise * Math.round(commissionPercent * 100)) / 10_000,
    );
    return feePaise / 100;
  } catch (e) {
    console.error("[api/payment/fee] platform fee unavailable:", e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!idToken) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }

    const { orderId } = (await req.json()) as { orderId?: string };
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orderSnap.data() as Record<string, any>;
    const callerPhone = String(decoded.phone_number ?? "").trim();

    // Admins can see any order's fee; everyone else must own the sale.
    let isAdmin = false;
    try {
      const userSnap = await db.collection("users").doc(callerPhone || decoded.uid).get();
      isAdmin = String(userSnap.data()?.role ?? "") === "admin";
    } catch {
      /* non-fatal — falls back to the seller check below */
    }

    const isSeller =
      (callerPhone && String(order.sellerPhone ?? "") === callerPhone) ||
      String(order.sellerId ?? "") === decoded.uid ||
      (callerPhone && String(order.sellerId ?? "") === callerPhone);

    if (!isSeller && !isAdmin) {
      return NextResponse.json({ error: "Not your order" }, { status: 403 });
    }

    const platformFee = await platformFeeFor(order);

    // Already cached — Razorpay's fee never changes once captured.
    if (typeof order.payment?.gatewayFee === "number") {
      return NextResponse.json({
        gatewayFee: order.payment.gatewayFee,
        gatewayTax: order.payment.gatewayTax ?? 0,
        platformFee,
        cached: true,
      });
    }

    const paymentId = String(order.payment?.razorpayPaymentId ?? "").trim();
    if (!paymentId) {
      // Legacy or unpaid order — no gateway charge to report.
      return NextResponse.json({ gatewayFee: null, gatewayTax: null, platformFee });
    }

    const payment = await razorpay.payments.fetch(paymentId);

    // `fee` is only populated once the payment is captured; a pending or
    // failed payment has none yet, and caching a 0 would be wrong.
    if (payment.fee == null) {
      return NextResponse.json({ gatewayFee: null, gatewayTax: null, platformFee });
    }

    const gatewayFee = toRupees(payment.fee);
    const gatewayTax = toRupees(payment.tax);

    await orderRef.update({
      "payment.gatewayFee": gatewayFee,
      "payment.gatewayTax": gatewayTax,
      "payment.feeFetchedAt": new Date().toISOString(),
    });

    return NextResponse.json({ gatewayFee, gatewayTax, platformFee, cached: false });
  } catch (error) {
    console.error("[api/payment/fee] failed:", error);
    return NextResponse.json({ error: "Could not fetch the payment fee" }, { status: 500 });
  }
}
