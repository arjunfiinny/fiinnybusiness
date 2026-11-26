import { createHash } from "node:crypto";
import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { firstPhone, notifyOnce } from "../notify";

const db = (): admin.firestore.Firestore => admin.firestore();
const DAY_MS = 24 * 60 * 60 * 1000;

function eventId(kind: string, ...parts: string[]): string {
  const hash = createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
  return `${kind}_${hash}`;
}

/** Signed-in carts are shared by web and app in carts/{phone}. Remind once for
 * each nonempty cart after 24 hours without a change. Limit to carts touched
 * in the past week so deploying this job does not message years-old carts. */
export const remindAbandonedCarts = onSchedule(
  { schedule: "30 11 * * *", timeZone: "Asia/Kolkata", region: "asia-south1", timeoutSeconds: 540 },
  async () => {
    const now = Date.now();
    const oldest = admin.firestore.Timestamp.fromMillis(now - 7 * DAY_MS);
    const cutoff = admin.firestore.Timestamp.fromMillis(now - DAY_MS);
    let cursor: admin.firestore.QueryDocumentSnapshot | undefined;
    let scanned = 0;
    let reminded = 0;

    while (scanned < 500) {
      let query = db().collection("carts")
        .where("updatedAt", ">=", oldest)
        .where("updatedAt", "<=", cutoff)
        // Favor recently active carts when there are more than the daily cap.
        .orderBy("updatedAt", "desc")
        .limit(Math.min(100, 500 - scanned));
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      cursor = page.docs[page.docs.length - 1];
      scanned += page.size;

      for (const candidate of page.docs) {
        // Cart may have been cleared or changed since this query started.
        const fresh = await candidate.ref.get();
        const d = fresh.data();
        const updatedAt = d?.updatedAt;
        if (!(updatedAt instanceof admin.firestore.Timestamp) ||
            updatedAt.toMillis() !== candidate.get("updatedAt")?.toMillis()) continue;
        const items = Array.isArray(d?.items) ? d.items : [];
        if (items.length === 0) continue;
        const phone = firstPhone(d?.phone, candidate.id);
        if (!phone) continue;
        const count = items.length;
        try {
          const created = await notifyOnce(
            eventId("cart_reminder", candidate.id, String(updatedAt.toMillis())),
            phone,
            "cart_reminder",
            "Your cart is waiting 🛒",
            `You have ${count} ${count === 1 ? "product" : "products"} in your cart. Open it whenever you're ready to order.`,
          );
          if (created) reminded++;
        } catch (err) {
          logger.error("[remindAbandonedCarts] notification failed", { cartId: candidate.id, err });
        }
      }
      if (page.size < 100) break;
    }
    logger.info("[remindAbandonedCarts] complete", { scanned, reminded });
  },
);

/** Razorpay's processed state means it sent the refund onward; the customer's
 * bank can still take time to credit it. Order updates come from refundOrder,
 * Razorpay webhooks and the customer's refund-status refresh. */
export const notifyCustomerRefundProcessed = onDocumentUpdated(
  { document: "orders/{orderId}", region: "asia-south1" },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || before?.payment?.refundStatus === "processed" ||
        after.payment?.refundStatus !== "processed") return;
    const phone = firstPhone(after.customerPhone, after.customerId);
    if (!phone) return;
    const refundId = String(after.payment?.refundId ?? "").trim();
    const amount = Number(after.payment?.refundedAmount);
    const amountText = Number.isFinite(amount) && amount > 0
      ? ` of ₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
      : "";
    await notifyOnce(
      eventId("refund_processed", event.params.orderId, refundId),
      phone,
      "payment_refunded",
      "Refund processed ✅",
      `Your refund${amountText} for order ${event.params.orderId} has been processed. Your bank may take more time to show the credit.`,
      { orderId: event.params.orderId, ...(refundId ? { refundId } : {}) },
    );
  },
);
