import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { recordFailureFromRazorpay } from "../../../lib/payment-attempts";

/**
 * Razorpay webhook — the fix for the gap our own client-side reporting can
 * never close: Razorpay's dashboard was showing failed payments (declined
 * cards, timed-out UPI) that never appeared in Admin -> Payments, because
 * that page only ever learned about a failure if OUR app detected it and
 * successfully phoned home. A killed app, a dropped connection, or simply an
 * old app version that predates the reporting code all mean the failure is
 * real on Razorpay's side and invisible on ours.
 *
 * This closes it server-to-server: Razorpay calls this endpoint the instant
 * it marks a payment failed, independent of the client entirely. Configure
 * in Razorpay Dashboard -> Settings -> Webhooks:
 *   URL:    https://krishidukan.com/api/webhooks/razorpay
 *   Events: payment.failed
 *   Secret: put the same value in RAZORPAY_WEBHOOK_SECRET
 * (This is a DIFFERENT secret from RAZORPAY_KEY_SECRET — the webhook secret
 * is generated when the webhook is created in the Dashboard.)
 *
 * Scoped to payment.failed only. Successful payments already have a
 * reliable path (/api/payment/verify, itself signature-checked) — adding a
 * webhook for those too is a reasonable next step but is not what this was
 * asked to fix, so it is left out rather than expanding scope silently.
 */

function verifySignature(rawBody: Buffer, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not configured");
    return false;
  }
  if (!signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Signature is computed over the EXACT raw bytes Razorpay sent — req.json()
  // would re-serialize and silently break verification (different key order/
  // whitespace), same reason the existing WA webhook reads arrayBuffer first.
  const rawBody = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifySignature(rawBody, signature)) {
    // A bad signature means the request cannot be trusted at all — this is
    // the one case worth rejecting outright rather than the 200-and-log-only
    // pattern below, since acknowledging a forged event would be wrong, not
    // just imperfect.
    console.error("[razorpay-webhook] signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody.toString());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Every other failure mode below is answered 200. Razorpay retries a
  // non-2xx response for up to 24 hours; retrying will not fix a bug in our
  // own handling, and repeatedly re-processing the same event is pure noise.
  // The event is logged either way so nothing is silently lost.
  try {
    if (event.event !== "payment.failed") {
      return NextResponse.json({ ok: true, ignored: event.event ?? "unknown" });
    }

    const payload = event.payload as Record<string, unknown> | undefined;
    const paymentEntity = (payload?.payment as Record<string, unknown> | undefined)?.entity as
      | Record<string, unknown>
      | undefined;
    if (!paymentEntity?.order_id) {
      console.error("[razorpay-webhook] payment.failed with no order_id, skipping");
      return NextResponse.json({ ok: true, skipped: "no order_id" });
    }

    const orderId = String(paymentEntity.order_id);

    // Razorpay copies an order's notes onto its payments, so the common case
    // needs no extra call. Fall back to fetching the order directly only if
    // that didn't happen (older orders, or Razorpay account/API quirks).
    let notes = paymentEntity.notes as Record<string, unknown> | null | undefined;
    if (!notes || Object.keys(notes).length === 0) {
      try {
        const order = await razorpay.orders.fetch(orderId);
        notes = (order.notes as Record<string, unknown> | null) ?? null;
      } catch (e) {
        console.error("[razorpay-webhook] could not fetch order for notes:", e);
        notes = null;
      }
    }

    await recordFailureFromRazorpay(
      {
        id: String(paymentEntity.id ?? ""),
        order_id: orderId,
        amount: Number(paymentEntity.amount ?? 0),
        method: (paymentEntity.method as string | undefined) ?? null,
        contact: (paymentEntity.contact as string | undefined) ?? null,
        email: (paymentEntity.email as string | undefined) ?? null,
        error_code: (paymentEntity.error_code as string | undefined) ?? null,
        error_description: (paymentEntity.error_description as string | undefined) ?? null,
        error_reason: (paymentEntity.error_reason as string | undefined) ?? null,
        error_source: (paymentEntity.error_source as string | undefined) ?? null,
        error_step: (paymentEntity.error_step as string | undefined) ?? null,
        created_at: paymentEntity.created_at as number | undefined,
      },
      { id: orderId, notes },
      "razorpay_webhook",
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[razorpay-webhook] unhandled error:", e);
    return NextResponse.json({ ok: false, error: "logged, not retried" });
  }
}
