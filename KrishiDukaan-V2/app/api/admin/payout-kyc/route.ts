import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, getAdminStorage } from "../../../lib/firebase-admin";

/**
 * Admin-only access to seller payout KYC.
 *
 * Two operations, both requiring an admin:
 *   GET  ?phone=...            → short-lived signed URLs for that seller's documents
 *   POST { phone, action, ... } → approve / reject, and attach a Razorpay
 *                                 linked-account id
 *
 * Why a server route rather than direct client access:
 *
 * storage.rules grants a seller access to their own `kyc/{phone}/` folder and
 * nobody else. Admins are deliberately NOT matched there — Storage rules
 * cannot read Firestore to check a role, and this project sets no custom auth
 * claims (nothing calls setCustomUserClaims), so a `token.admin` check would
 * silently never match. The Admin SDK bypasses rules entirely and can check
 * the role properly against Firestore.
 *
 * It also means a document is exposed as a URL that expires in minutes rather
 * than a permanent public link, which is the right handling for a PAN card.
 */

/** Minutes a generated document URL stays valid. Long enough to open and read,
 *  short enough that a copied link is not a lasting leak. */
const SIGNED_URL_MINUTES = 10;

/** Verifies the bearer token belongs to an admin. Mirrors the role resolution
 *  used elsewhere: the caller may be keyed by uid OR by phone (uidIndex). */
type AdminAuthResult =
  | { ok: true; uid: string; response?: undefined }
  | { ok: false; uid?: undefined; response: NextResponse };

async function requireAdmin(req: NextRequest): Promise<AdminAuthResult> {
  const header = req.headers.get("Authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing authorization token" }, { status: 401 }),
    };
  }

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid authorization token" }, { status: 401 }),
    };
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
  if (!isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, uid };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  try {
    const snap = await getAdminDb().collection("payoutAccounts").doc(phone).get();
    if (!snap.exists) {
      return NextResponse.json({ documents: [] });
    }

    const documents = (snap.data()?.documents ?? {}) as Record<
      string,
      { storagePath?: string; fileName?: string; contentType?: string }
    >;
    const bucket = getAdminStorage().bucket();
    const expires = Date.now() + SIGNED_URL_MINUTES * 60 * 1000;

    const results = await Promise.all(
      Object.entries(documents).map(async ([type, meta]) => {
        if (!meta?.storagePath) return null;
        try {
          const [url] = await bucket
            .file(meta.storagePath)
            .getSignedUrl({ action: "read", expires });
          return { type, url, fileName: meta.fileName, contentType: meta.contentType };
        } catch {
          // Metadata exists but the file is gone — report it as unavailable
          // rather than failing the whole request and hiding the others.
          return { type, url: null, fileName: meta.fileName, contentType: meta.contentType };
        }
      }),
    );

    return NextResponse.json({ documents: results.filter(Boolean), expiresInMinutes: SIGNED_URL_MINUTES });
  } catch (error) {
    console.error("[payout-kyc] GET failed:", error);
    return NextResponse.json({ error: "Could not load documents" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { phone, action, razorpayLinkedAccountId, rejectionReason } = (await req.json()) as {
      phone?: string;
      action?: "verify" | "reject";
      razorpayLinkedAccountId?: string;
      rejectionReason?: string;
    };

    if (!phone) return NextResponse.json({ error: "phone is required" }, { status: 400 });
    if (action !== "verify" && action !== "reject") {
      return NextResponse.json({ error: "action must be verify or reject" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("payoutAccounts").doc(phone);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "No payout account for this seller" }, { status: 404 });
    }

    if (action === "reject") {
      const reason = (rejectionReason ?? "").trim();
      if (!reason) {
        // A bare rejection leaves the seller with nothing to act on.
        return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
      }
      await ref.update({
        status: "rejected",
        rejectionReason: reason,
        verifiedAt: null,
        verifiedBy: auth.uid,
        updatedAt: new Date(),
      });
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // ── verify ───────────────────────────────────────────────────────────
    const linkedId = (razorpayLinkedAccountId ?? "").trim();
    // Razorpay linked account ids are `acc_` + 14 chars. Checked here because
    // a malformed id fails only later, at transfer time, with money involved.
    if (!/^acc_[A-Za-z0-9]{14}$/.test(linkedId)) {
      return NextResponse.json(
        {
          error:
            "Enter the Razorpay linked account id (acc_ followed by 14 characters). " +
            "Create it in the Razorpay Dashboard under Route → Linked Accounts.",
        },
        { status: 400 },
      );
    }

    const data = snap.data() ?? {};
    // Verifying an account with no bank details would green-light a payout
    // that cannot land anywhere.
    if (!data.accountNumber || !data.ifsc) {
      return NextResponse.json(
        { error: "This seller has not submitted bank details yet." },
        { status: 400 },
      );
    }

    await ref.update({
      status: "verified",
      razorpayLinkedAccountId: linkedId,
      rejectionReason: null,
      verifiedAt: new Date(),
      verifiedBy: auth.uid,
      updatedAt: new Date(),
    });

    return NextResponse.json({ ok: true, status: "verified" });
  } catch (error) {
    console.error("[payout-kyc] POST failed:", error);
    return NextResponse.json({ error: "Could not update payout account" }, { status: 500 });
  }
}
