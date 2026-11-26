import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { initializeApp, getApps } from "firebase-admin/app";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
if (getApps().length === 0)
    initializeApp();
const db = getFirestore();
const fcm = getMessaging();
/**
 * 1. FRIEND MIRROR NOTIFICATION
 * Triggers when a 'shared' expense is mirrored to a friend's feed (creating a debt).
 * Listens to: users/{friendId}/expenses/{expenseId}
 * Metadata to look for: 'mirroredFrom' to distinguish from user's own expenses.
 */
export const onFriendExpenseMirrored = onDocumentCreated({
    document: "users/{friendPhone}/expenses/{expenseId}",
    region: "asia-south1",
    retry: false,
}, async (event) => {
    const friendPhone = event.params.friendPhone;
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data();
    // Only trigger if this expense was Mirrored (created by someone else)
    const fromPhone = typeof data.mirroredFrom === "string" ? data.mirroredFrom.trim() : "";
    if (!fromPhone || fromPhone === friendPhone)
        return;
    // Recipient: token lives on users/{phone} (the app saves it there).
    const friendDoc = await db.collection("users").doc(friendPhone).get();
    const token = friendDoc.data()?.fcmToken;
    if (!token)
        return;
    // Respect the recipient's notification settings.
    const prefsDoc = await db.doc(`users/${friendPhone}/prefs/notifications`).get();
    if (prefsDoc.exists && prefsDoc.get("push_enabled") === false)
        return;
    // Sender's display name (previously used `createdBy`, which the app
    // never sets, so the title read "New Expense from undefined").
    const fromDoc = await db.collection("users").doc(fromPhone).get();
    const fromName = String(fromDoc.get("name") || "").trim() || "A friend";
    const amountNum = Math.round(Number(data.amount || 0));
    const amount = `₹${amountNum.toLocaleString("en-IN")}`;
    const label = String(data.title || data.label || data.note || "").trim();
    const isSettlement = String(data.type || "").toLowerCase() === "settlement";
    const title = isSettlement
        ? `${fromName} recorded a settlement`
        : `${fromName} added a shared expense`;
    const body = isSettlement
        ? `${amount} settled with you. Tap to see your balance.`
        : `${label ? `"${label}" · ` : ""}${amount}. Tap to see what you owe.`;
    try {
        await fcm.send({
            token: token,
            notification: { title, body },
            android: {
                priority: "high",
                notification: {
                    // Must be a channel the app creates (fiinny_social never existed).
                    channelId: "fiinny_default",
                    tag: `friend_expense_${event.params.expenseId}`,
                },
            },
            data: {
                type: isSettlement ? "friend_settlement" : "friend_expense",
                expenseId: event.params.expenseId,
                deeplink: "app://friends", // Opens the Friends screen
            },
        });
        logger.info(`Sent friend mirror notif to ${friendPhone}`);
    }
    catch (e) {
        logger.error("Failed to send friend mirror notif", e);
    }
});
/**
 * 2. MONTHLY SETTLEMENT NUDGE
 * Runs on 1st of every month at 10 AM.
 * Checks if user owes money > ₹500 across all friends.
 */
export const scheduledSettlementNudge = onSchedule({
    schedule: "0 10 1 * *", // 1st of month 10 AM
    timeZone: "Asia/Kolkata",
    retryCount: 3,
}, async (event) => {
    logger.info("Starting monthly settlement check");
    const snapshot = await db.collection("users").get();
    const promises = snapshot.docs.map(async (doc) => {
        const userPhone = doc.id;
        const data = doc.data();
        const token = data.fcmToken;
        if (!token)
            return;
        // Calculate Net Balance (Naive Check from 'friends' subcollection)
        // Real implementation might need aggregating expenses, but let's check 'friends' metadata if available
        // OR checks for 'debts' summary if we maintain it. 
        // For MVP: Let's assume we check 'recent' shared expenses or just send a generic "Check your balances" nudge.
        // Allow checking a 'friends' collection summary if it exists
        const friendsSnap = await db.collection(`users/${userPhone}/friends`).get();
        let totalOwed = 0;
        friendsSnap.docs.forEach(fDoc => {
            const fData = fDoc.data();
            // If 'netBalance' < 0 means I owe money (assuming negative is debt)
            if ((fData.netBalance || 0) < -500) {
                totalOwed += Math.abs(fData.netBalance);
            }
        });
        if (totalOwed > 500) {
            try {
                await fcm.send({
                    token: token,
                    notification: {
                        title: "Time to Settle Up? 💸",
                        body: `It's the 1st of the month! You have pending settlements. Clear them to start fresh.`,
                    },
                    data: {
                        type: "settle_nudge",
                        deeplink: "app://friends"
                    }
                });
            }
            catch (e) {
                logger.error(`Failed settlement nudge for ${userPhone}`, e);
            }
        }
    });
    await Promise.all(promises);
});
//# sourceMappingURL=social_notifications.js.map