import { getAdminDb } from './firebase-admin';

/**
 * Payment attempt tracking.
 *
 * Every Razorpay order this app creates gets a `paymentAttempts/{razorpayOrderId}`
 * document written server-side at creation time, before the customer ever sees
 * the checkout sheet. The status is then moved to 'paid' or 'failed' as the
 * payment resolves.
 *
 * Why server-side, when the clients already logged failures to `failedPayments`:
 *
 *  1. The client cannot be relied on to report. A killed app, a closed browser
 *     tab, a dropped connection mid-UPI — all produce a real lost sale that the
 *     old client-side logging never recorded at all.
 *  2. An abandoned checkout (customer dismisses the Razorpay sheet) was never
 *     recorded by anything. Those attempts simply stay 'created' here, which is
 *     how the admin view surfaces them.
 *  3. Only the server knows what was in the basket. `create-cart-order` already
 *     resolves every item's real price from Firestore to build the charge; that
 *     same resolved list is stored here, so admin can see WHICH products and at
 *     what price a failed payment was for. The old failedPayments record had
 *     only an amount and a Razorpay order id.
 *
 * Written exclusively through the Admin SDK, which bypasses Firestore rules —
 * the matching rule denies all client writes so a customer cannot forge or
 * tamper with the record of what they tried to buy.
 */

/** One line of a cart attempt, priced by the server. */
export type AttemptItem = {
  productId: string;
  name: string;
  qty: number;
  /** Rupees, after any active discount — the price actually charged. */
  unitPrice: number;
  lineTotal: number;
  sellerId: string;
  sellerPhone: string | null;
  sellerName: string | null;
  /**
   * How the price was resolved. A value other than 'inventory' means the
   * primary lookup missed, which is worth seeing when a charge looks wrong.
   */
  priceSource: 'inventory' | 'seller-copy' | 'availability' | 'canonical' | 'none';
};

export type AttemptKind = 'cart' | 'subscription';

export type AttemptStatus = 'created' | 'paid' | 'failed';

export type RecordAttemptInput = {
  razorpayOrderId: string;
  kind: AttemptKind;
  userId: string;
  /** Rupees. */
  amount: number;
  source: 'web' | 'mobile' | 'unknown';
  items?: AttemptItem[];
  subtotal?: number;
  deliveryCharge?: number;
  /** Subscription attempts only. */
  seatCount?: number;
  durationMonths?: number;
  promoCode?: string | null;
  discountPercent?: number;
  note?: string;
};

/**
 * Resolves a buyer's phone and display name so admin can contact them without a
 * second lookup per row. Best-effort: a missing user doc must never stop an
 * order being created, so every failure here degrades to nulls.
 */
async function resolveBuyer(
  userId: string,
): Promise<{ phone: string | null; name: string | null }> {
  const db = getAdminDb();
  try {
    // Phone-keyed accounts reach their doc through uidIndex; email-keyed ones
    // live at users/{uid} directly. Try both, same as the sales-role lookup.
    const idx = await db.collection('uidIndex').doc(userId).get();
    const phone = idx.exists ? String(idx.data()?.phone ?? '') : '';

    const userSnap = phone
      ? await db.collection('users').doc(phone).get()
      : await db.collection('users').doc(userId).get();

    const data = userSnap.exists ? userSnap.data() ?? {} : {};
    return {
      phone: phone || (data.phone ? String(data.phone) : null),
      name:
        (data.name && String(data.name)) ||
        (data.businessName && String(data.businessName)) ||
        (data.ownerName && String(data.ownerName)) ||
        null,
    };
  } catch {
    return { phone: null, name: null };
  }
}

/**
 * Writes the attempt record. Never throws — a logging failure must not stop a
 * customer from paying, so the caller can await this without a try/catch and
 * still be sure the checkout proceeds.
 */
export async function recordAttempt(input: RecordAttemptInput): Promise<void> {
  try {
    const buyer = await resolveBuyer(input.userId);
    await getAdminDb()
      .collection('paymentAttempts')
      .doc(input.razorpayOrderId)
      .set(
        {
          razorpayOrderId: input.razorpayOrderId,
          kind: input.kind,
          status: 'created' as AttemptStatus,

          userId: input.userId,
          userPhone: buyer.phone,
          userName: buyer.name,

          amount: input.amount,
          subtotal: input.subtotal ?? null,
          deliveryCharge: input.deliveryCharge ?? null,

          items: input.items ?? [],
          itemCount: input.items?.length ?? 0,

          seatCount: input.seatCount ?? null,
          durationMonths: input.durationMonths ?? null,
          promoCode: input.promoCode ?? null,
          discountPercent: input.discountPercent ?? null,

          note: input.note ?? null,
          source: input.source,

          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true },
      );
  } catch (e) {
    console.error('[paymentAttempts] could not record attempt:', e);
  }
}

/**
 * Marks an attempt paid. Called from both the signature-verify path and the
 * order-status reconciliation path, so an attempt is closed out no matter which
 * one confirmed the money — including the mobile late-UPI case, where the SDK
 * reported failure but Razorpay had in fact captured.
 */
export async function markAttemptPaid(
  razorpayOrderId: string,
  razorpayPaymentId: string | null,
): Promise<void> {
  try {
    await getAdminDb()
      .collection('paymentAttempts')
      .doc(razorpayOrderId)
      .set(
        {
          status: 'paid' as AttemptStatus,
          razorpayPaymentId: razorpayPaymentId ?? null,
          paidAt: new Date(),
          updatedAt: new Date(),
          // A late capture can arrive after a failure was already recorded, so
          // clear the error rather than leaving a paid row showing one.
          error: null,
        },
        { merge: true },
      );
  } catch (e) {
    console.error('[paymentAttempts] could not mark paid:', e);
  }
}

export type AttemptError = {
  code?: string | null;
  description?: string | null;
  reason?: string | null;
  source?: string | null;
  step?: string | null;
};

/**
 * Marks an attempt failed with whatever Razorpay told the client.
 *
 * Deliberately refuses to overwrite an attempt already marked 'paid': the
 * client's failure signal is not authoritative (see /api/payment/order-status),
 * so a late-arriving failure callback must not bury a confirmed payment.
 */
export async function markAttemptFailed(
  razorpayOrderId: string,
  error: AttemptError,
): Promise<void> {
  try {
    const ref = getAdminDb().collection('paymentAttempts').doc(razorpayOrderId);
    const snap = await ref.get();
    if (snap.exists && snap.data()?.status === 'paid') return;

    await ref.set(
      {
        status: 'failed' as AttemptStatus,
        error: {
          code: error.code ?? null,
          description: error.description ?? null,
          reason: error.reason ?? null,
          source: error.source ?? null,
          step: error.step ?? null,
        },
        failedAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    );
  } catch (e) {
    console.error('[paymentAttempts] could not mark failed:', e);
  }
}
