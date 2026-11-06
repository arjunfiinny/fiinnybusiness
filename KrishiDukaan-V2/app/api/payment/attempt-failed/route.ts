import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getAdminAuth } from '../../../lib/firebase-admin';
import {
  markAttemptFailed,
  markAttemptPaid,
  type AttemptClientDiagnostics,
} from '../../../lib/payment-attempts';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

type AttemptFailedBody = {
  razorpay_order_id?: string;
  /** Razorpay's error object as the checkout gave it. App builds also send
   *  sdkCode / sdkCodeName / rawDescription / metadata inside it. */
  error?: Record<string, unknown> | null;
  /** App builds: ms between opening the checkout sheet and the error. */
  sheetOpenMs?: unknown;
  /** App builds: 'android' | 'iOS' | 'web'. */
  platform?: unknown;
};

/** Fields of a Razorpay payment entity this route reads. */
type RzpPayment = {
  id: string;
  status: string;
  created_at?: number;
  error_code?: string | null;
  error_description?: string | null;
  error_reason?: string | null;
  error_source?: string | null;
  error_step?: string | null;
};

/** A string worth storing, or null. The checkout sheet often sends the
 *  literal text "undefined" (or "NA" from Razorpay itself) in place of a
 *  reason; storing that made every admin row read "undefined". */
function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === 'undefined' || lower === 'null' || lower === 'na') return null;
  return s.slice(0, 500);
}

/** What the client said about the failure, size-capped: this is
 *  client-supplied, so it is diagnostics only and never drives status. */
function clientDiagnostics(
  err: Record<string, unknown>,
  body: AttemptFailedBody,
): AttemptClientDiagnostics {
  const sdkCode = typeof err.sdkCode === 'number' && Number.isFinite(err.sdkCode) ? err.sdkCode : null;
  const ms = typeof body.sheetOpenMs === 'number' && Number.isFinite(body.sheetOpenMs)
    ? Math.max(0, Math.min(Math.round(body.sheetOpenMs), 24 * 60 * 60 * 1000))
    : null;
  let metadata: Record<string, unknown> | null = null;
  if (err.metadata && typeof err.metadata === 'object' && !Array.isArray(err.metadata)) {
    try {
      if (JSON.stringify(err.metadata).length <= 2000) metadata = err.metadata as Record<string, unknown>;
    } catch { /* unserialisable — drop */ }
  }
  const raw = err.rawDescription ?? err.description;
  return {
    sdkCode,
    sdkCodeName: typeof err.sdkCodeName === 'string' ? err.sdkCodeName.slice(0, 40) : null,
    rawDescription: raw === undefined || raw === null ? null : String(raw).slice(0, 500),
    metadata,
    sheetOpenMs: ms,
    platform: typeof body.platform === 'string' ? body.platform.slice(0, 20) : null,
  };
}

/**
 * POST /api/payment/attempt-failed
 *
 * Records that a checkout failed, against the attempt row the create-order
 * routes wrote. Body: { razorpay_order_id, error? }
 *
 * The client's word is NOT taken as final. The native Razorpay SDK reports
 * failure when its own wait for the payment elapses, which is not the same as
 * Razorpay having no payment on record — a UPI collect approved slightly late
 * is captured after the SDK has given up (see /api/payment/order-status for the
 * full explanation). So this endpoint asks Razorpay first, and if the money is
 * actually captured it marks the attempt PAID and tells the caller, instead of
 * filing a failure that never happened.
 *
 * Only when Razorpay agrees there is no capture is the attempt marked failed.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }
    let uid: string;
    try {
      uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: 'Invalid authorization token' }, { status: 401 });
    }

    const body = (await request.json()) as AttemptFailedBody;
    const orderId = body.razorpay_order_id;
    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'razorpay_order_id is required' }, { status: 400 });
    }

    // Same ownership guard as order-status: both create routes stamp
    // notes.userId, so a caller cannot write a failure onto someone else's order.
    let order;
    try {
      order = await razorpay.orders.fetch(orderId);
    } catch {
      return NextResponse.json({ error: 'Unknown order' }, { status: 404 });
    }
    const ownerUid = (order.notes as Record<string, unknown> | undefined)?.userId;
    if (ownerUid && ownerUid !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Ask Razorpay before believing the client. The payment list also tells
    // us whether the customer ever submitted a payment at all: an order with
    // zero payments means the checkout sheet was closed (or broke) before any
    // method was tried, which is a different problem from a declined payment.
    let razorpayPaymentCount: number | null = null;
    let lastFailed: RzpPayment | undefined;
    try {
      const paymentsRes = await razorpay.orders.fetchPayments(orderId);
      const payments = (paymentsRes.items ?? []) as RzpPayment[];
      const captured = payments.find((p) => p.status === 'captured');
      if (captured) {
        await markAttemptPaid(orderId, captured.id);
        return NextResponse.json({
          status: 'captured',
          paymentId: captured.id,
          note: 'Payment was actually captured — attempt recorded as paid, not failed.',
        });
      }
      razorpayPaymentCount = payments.length;
      lastFailed = payments
        .filter((p) => p.status === 'failed')
        .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
    } catch (e) {
      // Razorpay unreachable. Record the failure the client reported rather
      // than losing the signal entirely; a later order-status check can still
      // flip it to paid, since markAttemptPaid clears the error.
      console.error('[attempt-failed] could not reach Razorpay, trusting client:', e);
    }

    const err = body.error ?? {};
    const paymentAttempted = razorpayPaymentCount === null ? null : razorpayPaymentCount > 0;
    // Razorpay's own record of a failed payment beats the checkout sheet's
    // text, which is often just "undefined".
    await markAttemptFailed(
      orderId,
      {
        code:        clean(lastFailed?.error_code)        ?? clean(err.code),
        description: clean(lastFailed?.error_description) ?? clean(err.description),
        reason:      clean(lastFailed?.error_reason)      ?? clean(err.reason),
        source:      clean(lastFailed?.error_source)      ?? clean(err.source),
        step:        clean(lastFailed?.error_step)        ?? clean(err.step),
      },
      {
        failureKind:
          paymentAttempted === null ? 'unknown'
          : paymentAttempted ? 'payment_failed'
          : 'closed_without_paying',
        paymentAttempted,
        razorpayPaymentCount,
        client: clientDiagnostics(err, body),
      },
    );
    return NextResponse.json({ status: 'failed' });
  } catch (error) {
    console.error('[attempt-failed] unhandled error:', error);
    return NextResponse.json({ error: 'Could not record the failure' }, { status: 500 });
  }
}
