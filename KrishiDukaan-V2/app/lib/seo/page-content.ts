/**
 * Extra content the KrishiDukan team adds to a product page: a longer
 * description, FAQs and more photos.
 *
 * WHY A SEPARATE LAYER
 * It lives in productPageContent/{productId}, never on the product doc. The
 * seller's listing (name, price, their own description) is untouched, and
 * deleting the document returns the page to exactly what it was. Only the
 * server reads or writes it (firebase-admin), so firestore.rules need no
 * change: clients have no access at all.
 *
 * Pure (no Firebase import) so scripts/tests/page-content.test.ts can check
 * the limits directly.
 */

export const PAGE_CONTENT_COLLECTION = "productPageContent";

export const LIMITS = {
  description: 8000,
  faqs: 12,
  question: 200,
  answer: 1500,
  images: 8,
} as const;

export interface PageFaq {
  q: string;
  a: string;
}

export interface PageContent {
  /** Paragraphs separated by blank lines. Shown under the seller's own description. */
  description: string;
  faqs: PageFaq[];
  /** Extra photo URLs (Firebase Storage), shown after the listing's own image. */
  images: string[];
}

/** Exactly one of content / error is set. (Plain fields: this project does not compile with strict narrowing.) */
export type PageContentResult = { ok: boolean; content: PageContent | null; error: string };

function clean(v: unknown): string {
  return String(v ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

/** Our own storage only: an admin pasting any URL would put a third-party image on the page. */
export function isAllowedImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "firebasestorage.googleapis.com" || u.hostname === "storage.googleapis.com") &&
      u.pathname.includes("krishidukan-e8315")
    );
  } catch {
    return false;
  }
}

/** Validates what the admin screen sends. Errors say what to change. */
export function validatePageContent(input: unknown): PageContentResult {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const description = clean(body.description);
  if (description.length > LIMITS.description) {
    return { ok: false, content: null, error: `The description is ${description.length} characters; keep it under ${LIMITS.description}.` };
  }

  const rawFaqs = Array.isArray(body.faqs) ? body.faqs : [];
  const faqs: PageFaq[] = [];
  for (let i = 0; i < rawFaqs.length; i++) {
    const f = rawFaqs[i] as Record<string, unknown> | null;
    const q = clean(f?.q);
    const a = clean(f?.a);
    if (!q && !a) continue; // an empty row the admin added and left blank
    if (!q || !a) return { ok: false, content: null, error: `FAQ ${i + 1} needs both a question and an answer.` };
    if (q.length > LIMITS.question) return { ok: false, content: null, error: `FAQ ${i + 1}: keep the question under ${LIMITS.question} characters.` };
    if (a.length > LIMITS.answer) return { ok: false, content: null, error: `FAQ ${i + 1}: keep the answer under ${LIMITS.answer} characters.` };
    faqs.push({ q, a });
  }
  if (faqs.length > LIMITS.faqs) return { ok: false, content: null, error: `Use at most ${LIMITS.faqs} FAQs.` };

  const rawImages = Array.isArray(body.images) ? body.images : [];
  const images = Array.from(new Set(rawImages.map((u) => clean(u)).filter(Boolean)));
  const bad = images.find((u) => !isAllowedImageUrl(u));
  if (bad) return { ok: false, content: null, error: "Photos must be uploaded here; links to other websites are not allowed." };
  if (images.length > LIMITS.images) return { ok: false, content: null, error: `Use at most ${LIMITS.images} photos.` };

  if (!description && faqs.length === 0 && images.length === 0) {
    return { ok: false, content: null, error: "Nothing to save. To take the content off the page, use Remove." };
  }
  return { ok: true, content: { description, faqs, images }, error: "" };
}

/** Reads a stored document defensively: bad or partial data never breaks a product page. */
export function readPageContent(data: Record<string, unknown> | undefined | null): PageContent | null {
  if (!data) return null;
  const description = clean(data.description).slice(0, LIMITS.description);
  const faqs = (Array.isArray(data.faqs) ? data.faqs : [])
    .map((f) => ({ q: clean((f as Record<string, unknown>)?.q), a: clean((f as Record<string, unknown>)?.a) }))
    .filter((f) => f.q && f.a)
    .slice(0, LIMITS.faqs);
  const images = (Array.isArray(data.images) ? data.images : [])
    .map((u) => clean(u))
    .filter(isAllowedImageUrl)
    .slice(0, LIMITS.images);
  if (!description && faqs.length === 0 && images.length === 0) return null;
  return { description, faqs, images };
}

/** Word count of everything the layer adds to the page, for the editor's progress hint. */
export function pageContentWords(c: PageContent): number {
  const text = [c.description, ...c.faqs.flatMap((f) => [f.q, f.a])].join(" ");
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9ऀ-ॿ]/.test(w)).length;
}
