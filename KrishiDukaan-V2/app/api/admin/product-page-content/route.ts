import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireSection } from "../../../lib/admin-auth";
import {
  PAGE_CONTENT_COLLECTION,
  pageContentWords,
  readAiSettings,
  readPageContent,
  validatePageContent,
} from "../../../lib/seo/page-content";
import { buildProductSlug, listOnlineDeliveryProducts } from "../../../lib/seo/products-server";
import { PAGE_CONTENT_SETTINGS, getAiContent } from "../../../lib/seo/page-content-server";

/**
 * Team-added product page content (app/lib/seo/page-content.ts).
 *
 *   GET  ?list=1          online-delivery products, with what content each has
 *   GET  ?productId=…     one product's content
 *   POST { productId, description, faqs, images }   save
 *   DELETE ?productId=…   remove the team's text for that product
 *   PATCH { productId, hideAi }   hide or show the KrishiDukan-written text
 *                                 on that one product (settings/pageContent.aiHidden)
 *
 * Admin, or team with the "products" section. Writes go to
 * productPageContent/{productId} and settings/pageContent.aiHidden only; the
 * product doc is never written.
 */

const col = () => getAdminDb().collection(PAGE_CONTENT_COLLECTION);
const settingsRef = () => getAdminDb().collection(PAGE_CONTENT_SETTINGS.collection).doc(PAGE_CONTENT_SETTINGS.doc);

/** Read fresh (not the product page's one-minute cache): the admin screen must show what it just changed. */
async function hiddenIds(): Promise<Set<string>> {
  const snap = await settingsRef().get();
  return new Set(readAiSettings(snap.exists ? snap.data() : null).hidden);
}

function millis(v: unknown): number | null {
  return v && typeof (v as { toMillis?: () => number }).toMillis === "function"
    ? (v as { toMillis: () => number }).toMillis()
    : null;
}

/** Re-render the product page now instead of at its next hourly refresh. */
async function refreshPage(productId: string) {
  try {
    const snap = await getAdminDb().collection("products").doc(productId).get();
    const name = String(snap.get("name") ?? "");
    if (name) revalidatePath(`/products/${buildProductSlug(name, productId)}`);
  } catch (err) {
    console.warn("[product-page-content] revalidate failed:", err);
  }
}

export async function GET(request: Request) {
  const caller = await requireSection(request, "products");
  if (caller instanceof NextResponse) return caller;
  const url = new URL(request.url);

  if (url.searchParams.get("list")) {
    try {
      const [products, docs, hidden] = await Promise.all([listOnlineDeliveryProducts(), col().get(), hiddenIds()]);
      const byId = new Map(docs.docs.map((d) => [d.id, d]));
      return NextResponse.json({
        products: products.map((p) => {
          const d = byId.get(p.id);
          const c = d ? readPageContent(d.data()) : null;
          return {
            ...p,
            hasContent: !!c,
            hasAiContent: !!getAiContent(p.id),
            aiHidden: hidden.has(p.id),
            addedWords: c ? pageContentWords(c) : 0,
            faqCount: c?.faqs.length ?? 0,
            photoCount: c?.images.length ?? 0,
            updatedAt: d ? millis(d.get("updatedAt")) : null,
          };
        }),
      });
    } catch (err) {
      console.error("[product-page-content] list failed:", err);
      return NextResponse.json({ error: "Could not load the product list. Try again in a minute." }, { status: 502 });
    }
  }

  const productId = url.searchParams.get("productId") ?? "";
  if (!productId) return NextResponse.json({ error: "Missing productId." }, { status: 400 });
  const [snap, hidden] = await Promise.all([col().doc(productId).get(), hiddenIds()]);
  return NextResponse.json({
    productId,
    content: snap.exists ? readPageContent(snap.data()) : null,
    // KrishiDukan-written text the page shows while the team has saved nothing.
    aiDraft: getAiContent(productId),
    aiHidden: hidden.has(productId),
    updatedAt: snap.exists ? millis(snap.get("updatedAt")) : null,
    updatedBy: snap.exists ? String(snap.get("updatedBy") ?? "") || null : null,
  });
}

export async function POST(request: Request) {
  const caller = await requireSection(request, "products");
  if (caller instanceof NextResponse) return caller;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const productId = String(body?.productId ?? "").trim();
  if (!productId) return NextResponse.json({ error: "Missing productId." }, { status: 400 });

  const product = await getAdminDb().collection("products").doc(productId).get();
  if (!product.exists) return NextResponse.json({ error: "That product no longer exists." }, { status: 404 });

  const result = validatePageContent(body);
  const content = result.content;
  if (!result.ok || !content) return NextResponse.json({ error: result.error }, { status: 400 });

  await col().doc(productId).set({
    ...content,
    productName: String(product.get("name") ?? ""),
    updatedBy: caller.phone ?? caller.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await refreshPage(productId);
  return NextResponse.json({ ok: true, content, addedWords: pageContentWords(content) });
}

export async function DELETE(request: Request) {
  const caller = await requireSection(request, "products");
  if (caller instanceof NextResponse) return caller;
  const productId = new URL(request.url).searchParams.get("productId") ?? "";
  if (!productId) return NextResponse.json({ error: "Missing productId." }, { status: 400 });
  await col().doc(productId).delete();
  await refreshPage(productId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const caller = await requireSection(request, "products");
  if (caller instanceof NextResponse) return caller;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const productId = String(body?.productId ?? "").trim();
  if (!productId) return NextResponse.json({ error: "Missing productId." }, { status: 400 });
  if (typeof body?.hideAi !== "boolean") {
    return NextResponse.json({ error: "Send hideAi as true or false." }, { status: 400 });
  }
  if (!getAiContent(productId)) {
    return NextResponse.json({ error: "This product has no KrishiDukan-written text." }, { status: 400 });
  }
  await settingsRef().set(
    {
      aiHidden: body.hideAi ? FieldValue.arrayUnion(productId) : FieldValue.arrayRemove(productId),
      aiHiddenUpdatedBy: caller.phone ?? caller.uid,
      aiHiddenUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await refreshPage(productId);
  return NextResponse.json({ ok: true, aiHidden: body.hideAi });
}
