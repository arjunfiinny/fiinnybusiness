import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireAdmin, requireSection } from "../../../lib/admin-auth";
import { PAGE_CONTENT_SETTINGS, aiContentIds } from "../../../lib/seo/page-content-server";
import { readAiSettings } from "../../../lib/seo/page-content";

/**
 * The one switch for KrishiDukan-written product content
 * (settings/pageContent.aiContent; see lib/seo/page-content-server.ts).
 *
 * GET: admin or team with "products". POST { aiContent: boolean }: full
 * admins only, because it changes every product page at once.
 */

const REF = () => getAdminDb().collection(PAGE_CONTENT_SETTINGS.collection).doc(PAGE_CONTENT_SETTINGS.doc);
// settings/ is public-read, so who changed it (a phone number) lives in this
// server-only doc instead.
const AUDIT = () => getAdminDb().collection("_serverConfig").doc("pageContentAudit");

async function view() {
  const [snap, audit] = await Promise.all([REF().get(), AUDIT().get()]);
  const at = audit.get("switchUpdatedAt");
  const settings = readAiSettings(snap.exists ? snap.data() : null);
  const ids = new Set(aiContentIds());
  return {
    aiContent: settings.on,
    products: ids.size,
    /** Products the team hid it on one at a time (still hidden after the switch goes back on). */
    hidden: settings.hidden.filter((id) => ids.has(id)).length,
    updatedBy: audit.exists ? String(audit.get("switchUpdatedBy") ?? "") || null : null,
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
  await REF().set({ aiContent: body.aiContent }, { merge: true });
  await AUDIT().set(
    { switchUpdatedBy: caller.phone ?? caller.uid, switchUpdatedAt: FieldValue.serverTimestamp(), switchValue: body.aiContent },
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
