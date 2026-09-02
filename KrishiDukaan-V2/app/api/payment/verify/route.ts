import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { markAttemptPaid } from '../../../lib/payment-attempts';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(request: Request) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = await request.json();

    const body = razorpay_order_id + '|' + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      // Fetch order to get verified seatCount from notes
      const order = await razorpay.orders.fetch(razorpay_order_id);
      const verifiedSeatCount = order.notes?.seatCount ? Number(order.notes.seatCount) : 1;

      // Closes out the attempt record. A valid signature is proof Razorpay
      // completed this payment, so this is the primary success path for both
      // web and mobile.
      await markAttemptPaid(razorpay_order_id, razorpay_payment_id ?? null);

      return NextResponse.json({ 
        status: 'ok', 
        seatCount: verifiedSeatCount 
      });
    } else {
      return NextResponse.json({ status: 'failed' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
