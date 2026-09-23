import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { finalizeReassignmentRefund } from "../../../lib/order-reassignment";

/**
 * POST /api/cron/order-reassignment-expiry
 *
 * Refunds every order whose 24h reassignment window has passed with no seller
 * taking it. Pinged every 15 minutes by the expireOrderReassignments Cloud
 * Function; secured by CRON_SECRET like the other cron routes.
 *
 * Also retries a close that crashed mid-refund (its lock goes stale after 15
 * minutes — see finalizeReassignmentRefund).
 *
 * Queried on status alone (single-field index) and filtered in memory, so no
 * composite index has to be deployed for this to run.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const snap = await getAdminDb()
    .collection("orders")
    .where("status", "==", "reassigning")
    .limit(200)
    .get();

  const now = Timestamp.now().toMillis();
  const results = { examined: snap.size, refunded: 0, closed: 0, failed: 0, errors: [] as string[] };

  for (const doc of snap.docs) {
    const r = (doc.data().reassignment ?? {}) as { expiresAt?: Timestamp; status?: string };
    const expiresMs = r.expiresAt?.toMillis?.() ?? 0;
    if (r.status === "open" && now < expiresMs) continue; // window still open
    if (r.status !== "open" && r.status !== "refunding") continue;

    const res = await finalizeReassignmentRefund(doc.id, {
      finalStatus: "rejected",
      reason: "No other seller accepted this order within 24 hours",
      trigger: "expired",
      requireExpired: true,
    });
    if (res.ok === true) {
      results.closed++;
      if (res.refunded) results.refunded++;
    } else if (res.status !== 409) {
      // 409 is a benign race (accepted or already closing) — not a failure.
      results.failed++;
      results.errors.push(`${doc.id}: ${res.error}`);
    }
  }

  if (results.failed) console.error("[cron/order-reassignment-expiry]", results);
  return NextResponse.json({ ok: true, ...results });
}
