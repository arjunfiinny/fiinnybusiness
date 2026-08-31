import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { grossFor, type OrderLike } from "../../../dashboard/_lib/seller-earnings";

/**
 * Refunds an order, reversing the seller's Route transfer first when one has
 * already been made.
 *
 * ORDER OF OPERATIONS MATTERS
 * If money has already been transferred to the seller's linked account, it is
 * no longer in the platform's balance — refunding the customer first would
 * either fail for insufficient balance or leave the platform out of pocket by
 * the full order value. So: reverse the transfer, THEN refund. If the reversal
 * fails, the refund is not attempted and the caller is told why, rather than
 * half-completing a two-legged money movement.
 *
 * A refund is recorded on the order regardless of the seller leg, so the order
 * never ends up marked refunded without a matching Razorpay refund id.
 *
 * Partial refunds are supported (`amount`), which is the common case for a
 * damaged item in a multi-item order. Reversal is capped at what was actually
 * transferred for that order.
 */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

type AdminAuthResult =
  | { ok: true; uid: string; response?: undefined }
  | { ok: false; uid?: undefined; response: NextResponse };

async function requireAdmin(req: NextRequest): Promise<AdminAuthResult> {
  const header = req.headers.get("Authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) {
    return { ok: false, response: NextResponse.json({ error: "Missing authorization token" }, { status: 401 }) };
  }
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid authorization token" }, { status: 401 }) };
  }

  const db = getAdminDb();
  const [byUid, idx] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("uidIndex").doc(uid).get(),
  ]);
  let isAdmin = byUid.exists && byUid.data()?.role === "admin";
  if (!isAdmin && idx.exists) {
    const phone = idx.data()?.phone;
    if (phone) {
      const byPhone = await db.collection("users").doc(String(phone)).get();
      isAdmin = byPhone.exists && byPhone.data()?.role === "admin";
    }
  }
  if (!isAdmin) return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true, uid };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const db = getAdminDb();

  try {
    const { orderId, amount, reason, dryRun } = (await req.json()) as {
      orderId?: string;
      /** Rupees. Omitted means a full refund of the order total. */
      amount?: number;
      reason?: string;
      dryRun?: boolean;
    };

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }
    const refundReason = (reason ?? "").trim();
    if (!refundReason) {
      // Recorded on the order and surfaced to support — a refund with no
      // stated reason is unauditable later.
      return NextResponse.json({ error: "A refund reason is required" }, { status: 400 });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = snap.data() as FirebaseFirestore.DocumentData;
    const payment = (order.payment ?? {}) as {
      razorpayPaymentId?: string;
      transferId?: string;
      refundId?: string;
      refundedAmount?: number;
    };

    if (payment.refundId) {
      return NextResponse.json(
        { error: `Already refunded (${payment.refundId}).` },
        { status: 409 },
      );
    }
    if (!payment.razorpayPaymentId) {
      return NextResponse.json(
        { error: "This order has no Razorpay payment to refund." },
        { status: 400 },
      );
    }

    const orderTotal = grossFor({ id: orderId, ...(order as object) } as OrderLike);
    const refundAmount =
      typeof amount === "number" && amount > 0
        ? Math.round(Math.min(amount, orderTotal) * 100) / 100
        : orderTotal;

    if (refundAmount <= 0) {
      return NextResponse.json({ error: "Nothing to refund on this order." }, { status: 400 });
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        orderId,
        orderTotal,
        refundAmount,
        willReverseTransfer: Boolean(payment.transferId),
        transferId: payment.transferId ?? null,
      });
    }

    // ── 1. Reverse the seller's transfer, if money already went out ───────
    let reversalId: string | null = null;
    if (payment.transferId) {
      try {
        const reversal = (await razorpay.transfers.reverse(payment.transferId, {
          amount: Math.round(refundAmount * 100),
        } as never)) as { id: string };
        reversalId = reversal.id;
      } catch (e) {
        // Deliberately NOT falling through to the refund: refunding while the
        // seller still holds the money would leave the platform short by the
        // full amount, with no automated way to recover it.
        return NextResponse.json(
          {
            error:
              "Could not reverse the seller transfer, so no refund was issued. " +
              (e instanceof Error ? e.message : "Reversal failed.") +
              " Resolve this in the Razorpay Dashboard before retrying.",
          },
          { status: 502 },
        );
      }
    }

    // ── 2. Refund the customer ───────────────────────────────────────────
    let refundId: string;
    try {
      const refund = (await razorpay.payments.refund(payment.razorpayPaymentId, {
        amount: Math.round(refundAmount * 100),
        notes: { orderId, reason: refundReason },
      } as never)) as { id: string };
      refundId = refund.id;
    } catch (e) {
      // The seller leg already reversed. Surfaced explicitly because the money
      // is now back with the platform but the customer has not been refunded —
      // someone has to finish this by hand.
      return NextResponse.json(
        {
          error:
            "The seller transfer was reversed but the customer refund failed" +
            (reversalId ? ` (reversal ${reversalId})` : "") +
            ": " +
            (e instanceof Error ? e.message : "Refund failed.") +
            " Complete the refund in the Razorpay Dashboard.",
        },
        { status: 502 },
      );
    }

    // ── 3. Record it ─────────────────────────────────────────────────────
    const isFull = refundAmount >= orderTotal - 0.009;
    const now = new Date().toISOString();
    await orderRef.update({
      // Only a full refund closes the order; a partial one leaves it in its
      // current state so the rest of the order still behaves normally.
      ...(isFull ? { status: "refunded" } : {}),
      "payment.refundId": refundId,
      "payment.refundedAmount": refundAmount,
      "payment.refundedAt": now,
      "payment.refundReason": refundReason,
      ...(reversalId ? { "payment.transferReversalId": reversalId } : {}),
      statusHistory: [
        ...(Array.isArray(order.statusHistory) ? order.statusHistory : []),
        { status: isFull ? "refunded" : "partially_refunded", at: now },
      ],
      updatedAt: now,
    });

    return NextResponse.json({
      ok: true,
      orderId,
      refundId,
      refundAmount,
      full: isFull,
      transferReversalId: reversalId,
    });
  } catch (error) {
    console.error("[order-refund] failed:", error);
    return NextResponse.json({ error: "Refund failed" }, { status: 500 });
  }
}
