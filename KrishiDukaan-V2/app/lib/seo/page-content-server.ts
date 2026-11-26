import { getAdminDb } from "../firebase-admin";
import { PAGE_CONTENT_COLLECTION, readPageContent, type PageContent } from "./page-content";

/**
 * The team-added content for a product page (see page-content.ts), read with
 * the admin SDK because clients have no access to the collection.
 *
 * Returns null on any failure: a product page always renders, with or
 * without the extra content.
 */
export async function getPageContent(productId: string): Promise<PageContent | null> {
  if (!productId) return null;
  try {
    const snap = await getAdminDb().collection(PAGE_CONTENT_COLLECTION).doc(productId).get();
    return snap.exists ? readPageContent(snap.data()) : null;
  } catch (err) {
    console.warn("[seo/page-content] read failed:", err);
    return null;
  }
}
