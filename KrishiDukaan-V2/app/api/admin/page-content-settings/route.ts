import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireAdmin, requireSection } from "../../../lib/admin-auth";
import { PAGE_CONTENT_SETTINGS, aiContentIds } from "../../../lib/seo/page-content-server";

/**
 * The one switch for KrishiDukan-written product content
 * (settings/pageContent.aiContent; see lib/seo/page-content-server.ts).
 *
 * GET: admin or team with "products". POST { aiContent: boolean }: full
 * admins only, because it changes every product page at once.
 */

const REF = () => getAdminDb().collection(PAGE_CONTENT_SETTINGS.collection).doc(PAGE_CONTENT_SETTINGS.doc);

async function view() {
  const snap = await REF().get();
  const at = snap.get("updatedAt");
  return {
    aiContent: snap.exists ? snap.get("aiContent") !== false : true,
    products: aiContentIds().length,
    updatedBy: snap.exists ? String(snap.get("updatedBy") ?? "") || null : null,
    updatedAt: at && typeof at.toMillis === "function" ? at.toMillis() : null,
  };
}

export async function GET(request: Request) {
  const caller = await requireSection(request, "products");
  if (caller instanceof NextResponse) return caller;
  return NextResponse.json(await view());
}

export async function POST(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.aiContent !== "boolean") {
    return NextResponse.json({ error: "Send aiContent as true or false." }, { status: 400 });
  }
  await REF().set(
    { aiContent: body.aiContent, updatedBy: caller.phone ?? caller.uid, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  // Every product page re-renders on its next visit instead of at its hourly refresh.
  try {
    revalidatePath("/products/[slug]", "page");
  } catch (err) {
    console.warn("[page-content-settings] revalidate failed:", err);
  }
  return NextResponse.json(await view());
}
