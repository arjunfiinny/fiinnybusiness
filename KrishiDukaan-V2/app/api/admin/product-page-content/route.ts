import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireSection } from "../../../lib/admin-auth";
import {
  PAGE_CONTENT_COLLECTION,
  pageContentWords,
  readPageContent,
  validatePageContent,
} from "../../../lib/seo/page-content";
import { buildProductSlug, listOnlineDeliveryProducts } from "../../../lib/seo/products-server";
import { getAiContent } from "../../../lib/seo/page-content-server";

/**
 * Team-added product page content (app/lib/seo/page-content.ts).
 *
 *   GET  ?list=1          online-delivery products, with what content each has
 *   GET  ?productId=…     one product's content
 *   POST { productId, description, faqs, images }   save
 *   DELETE ?productId=…   remove: the page goes back to the seller's listing only
 *
 * Admin, or team with the "products" section. Writes go to
 * productPageContent/{productId} only; the product doc is never written.
 */

const col = () => getAdminDb().collection(PAGE_CONTENT_COLLECTION);

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
      const [products, docs] = await Promise.all([listOnlineDeliveryProducts(), col().get()]);
      const byId = new Map(docs.docs.map((d) => [d.id, d]));
      return NextResponse.json({
        products: products.map((p) => {
          const d = byId.get(p.id);
          const c = d ? readPageContent(d.data()) : null;
          return {
            ...p,
            hasContent: !!c,
            hasAiContent: !!getAiContent(p.id),
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
  const snap = await col().doc(productId).get();
  return NextResponse.json({
    productId,
    content: snap.exists ? readPageContent(snap.data()) : null,
    // KrishiDukan-written text the page shows while the team has saved nothing.
    aiDraft: getAiContent(productId),
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
