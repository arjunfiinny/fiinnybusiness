import { doc, getDoc } from "firebase/firestore/lite";
import { getAdminDb } from "../firebase-admin";
import { getClientDb } from "../firebase-client-server";
import { staleWhileErrorCache } from "./stale-cache";
import { PAGE_CONTENT_COLLECTION, readPageContent, type PageContent } from "./page-content";
import aiContent from "./ai-content/products.json";

/**
 * What a product page shows on top of the seller's listing, in order:
 *
 *  1. Content a team member saved in admin → Product page content
 *     (productPageContent/{id}, read with the admin SDK: clients have no
 *     access to it).
 *  2. Otherwise the KrishiDukan-written text in ai-content/products.json,
 *     while the switch settings/pageContent.aiContent is on. One click in
 *     the admin turns it off for every product.
 *
 * Every failure returns null: a product page always renders, with or without
 * the extra content.
 */

export const PAGE_CONTENT_SETTINGS = { collection: "settings", doc: "pageContent" } as const;

const AI = aiContent as Record<string, unknown>;

/** Ids with KrishiDukan-written content, for the admin's counts. */
export function aiContentIds(): string[] {
  return Object.keys(AI).filter((id) => readPageContent(AI[id] as Record<string, unknown>));
}

export function getAiContent(productId: string): PageContent | null {
  return readPageContent(AI[productId] as Record<string, unknown> | undefined);
}

// settings/ is public-read, so the switch is read with the same REST client
// as the product itself and works even where admin credentials do not.
// Cached a minute per server instance; a failed read keeps the last answer.
// Before any answer, a failed read counts as ON (the default).
const readSwitch: () => Promise<boolean> = staleWhileErrorCache(
  async () => {
    const snap = await getDoc(doc(getClientDb(), PAGE_CONTENT_SETTINGS.collection, PAGE_CONTENT_SETTINGS.doc));
    return snap.exists() ? snap.get("aiContent") !== false : true;
  },
  60 * 1000,
);

export async function isAiContentOn(): Promise<boolean> {
  try {
    return await readSwitch();
  } catch {
    return true;
  }
}

async function getTeamContent(productId: string): Promise<PageContent | null> {
  try {
    const snap = await getAdminDb().collection(PAGE_CONTENT_COLLECTION).doc(productId).get();
    return snap.exists ? readPageContent(snap.data()) : null;
  } catch (err) {
    console.warn("[seo/page-content] team content read failed:", err);
    return null;
  }
}

export async function getPageContent(productId: string): Promise<PageContent | null> {
  if (!productId) return null;
  const team = await getTeamContent(productId);
  if (team) return team;
  const ai = getAiContent(productId);
  if (!ai) return null;
  return (await isAiContentOn()) ? ai : null;
}
