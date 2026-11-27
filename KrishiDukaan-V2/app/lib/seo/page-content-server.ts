import { doc, getDoc } from "firebase/firestore/lite";
import { getAdminDb } from "../firebase-admin";
import { getClientDb } from "../firebase-client-server";
import { staleWhileErrorCache } from "./stale-cache";
import {
  PAGE_CONTENT_COLLECTION,
  pickPageContent,
  readAiSettings,
  readPageContent,
  type AiContentSettings,
  type PageContent,
} from "./page-content";
import aiContent from "./ai-content/products.json";

/**
 * What a product page shows on top of the seller's listing, in order:
 *
 *  1. Content a team member saved in admin → Product page content
 *     (productPageContent/{id}, read with the admin SDK: clients have no
 *     access to it).
 *  2. Otherwise the KrishiDukan-written text in ai-content/products.json,
 *     unless settings/pageContent turns it off everywhere (aiContent: false,
 *     one click for an admin) or hides it on this product (aiHidden, any team
 *     member with the products section).
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

// settings/ is public-read, so it is read with the same REST client as the
// product itself and works even where admin credentials do not. A failed read
// keeps the last answer; before any answer it counts as the default (on
// everywhere, hidden nowhere).
//
// Kept only 5 seconds: the admin routes revalidate the page right after a
// change, and ISR then keeps whatever the re-render read for an hour, so a
// longer cache could bake the old setting in. 5 s still lets the pages a
// build renders together share one read.
const readSettings: () => Promise<AiContentSettings> = staleWhileErrorCache(
  async () => {
    const snap = await getDoc(doc(getClientDb(), PAGE_CONTENT_SETTINGS.collection, PAGE_CONTENT_SETTINGS.doc));
    return readAiSettings(snap.exists() ? snap.data() : null);
  },
  5 * 1000,
);

export async function getAiSettings(): Promise<AiContentSettings> {
  try {
    return await readSettings();
  } catch {
    return readAiSettings(null);
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
  return pickPageContent(productId, null, ai, await getAiSettings());
}
