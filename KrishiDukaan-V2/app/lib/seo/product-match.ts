/**
 * Where should the URL of a product that no longer exists go?
 *
 * Products are often deleted and created again under a new document id, and
 * duplicates are merged into one. Each time, the old /products/{name}--{id}
 * URL starts to return 404 even though the same product is still on sale.
 * Search Console showed ~200 of these on 23 Nov 2026.
 *
 * The URL still carries the old product's NAME. This module compares that
 * name with the products that have a page now and returns one only when the
 * match is confident. Otherwise it returns null and the page stays a 404,
 * which is correct for a product that is really gone. A wrong redirect is
 * worse than a 404: Google would index an unrelated product under the old URL.
 *
 * Pure (no Firestore import) so scripts/tests/product-match.test.ts can run it
 * directly. The caller supplies the candidates (products-server.ts reads them
 * from the marketplace cards).
 */

export interface MatchCandidate {
  /** Product doc id that has a /products page (passes isListable). */
  id: string;
  name: string;
  /** Card group (canonicalId when an admin linked it, else the name key). */
  groupKey?: string;
  /** The page the group's canonical tag points at. Redirects go here. */
  primaryId?: string;
}

/**
 * Words that say what KIND of product it is, packs and formulation codes.
 * They appear in many names, so on their own they never identify a product.
 */
const GENERIC = new Set([
  "herbicide", "herbicides", "insecticide", "insecticides", "fungicide", "fungicides",
  "pesticide", "pesticides", "fertilizer", "fertilizers", "fertiliser", "fertilisers",
  "seed", "seeds", "biostimulant", "biostimulants", "bio", "stimulant", "organic",
  "effective", "solution", "control", "best", "price", "buy", "online", "new",
  "for", "the", "and", "of", "with", "in", "to", "a", "an",
  "ml", "l", "ltr", "litre", "liter", "kg", "g", "gm", "gms", "gram", "std", "pack",
  "sc", "ec", "wg", "wp", "sl", "gl", "wdg", "od", "cs", "gr", "sp", "zc", "se",
  "pump", "sprayer", "spray", "battery", "motor", "kit", "tool", "tools",
  "karanarjun",
]);

/** An anchor must be this rare among the current products (products containing it). */
const MAX_ANCHOR_DF = 3;
/** The best match must beat the runner-up by this factor, unless both are one product. */
const MIN_MARGIN = 1.25;

/**
 * Lowercase ASCII word tokens, generic words removed. Punctuation is DELETED
 * first, exactly as buildProductSlug does, so a name and the URL made from it
 * agree: "Fertistar 16:16:12" and "fertistar-161612" both give "161612", and
 * "Abamectin 1.9 EC" and "abamectin-19-ec" both give "19". Non-Latin script
 * is dropped, as in the slug.
 */
export function nameTokens(text: string): string[] {
  return Array.from(new Set(orderedWords(text)));
}

/** nameTokens in name order, repeats kept: the input for two-word phrases. */
function orderedWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !GENERIC.has(w));
}

/** Adjacent word pairs: "karan arjun power plus" → "karan arjun", "arjun power", "power plus". */
function phrases(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < words.length; i++) out.push(`${words[i]} ${words[i + 1]}`);
  return out;
}

/** The kebab name part of a slug, as buildProductSlug would have produced it. */
export function slugBase(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

/**
 * The name part of a product URL slug, given the id extractIdFromSlug found.
 * `name--id` and legacy `name-id` both work; a bare id has no name part.
 * A "karanarjun-<name>-<pack>" id carries the name itself, so it counts too.
 */
export function slugNamePart(slug: string, id: string): string {
  const decoded = decodeURIComponent(slug).trim();
  let name = "";
  if (decoded.endsWith(`--${id}`)) name = decoded.slice(0, -(id.length + 2));
  else if (decoded.endsWith(`-${id}`)) name = decoded.slice(0, -(id.length + 1));
  else if (decoded !== id) name = decoded;
  if (id.startsWith("karanarjun-")) name = `${name} ${id}`;
  return name.trim();
}

/** Grades and model numbers: "161612", "05535", "5402", "771". */
function isModelNumber(token: string): boolean {
  return /^\d{3,}$/.test(token);
}

/** A product word ("tynzer") or a model number ("6802"), not a pack size or code. */
function isAnchorShape(token: string): boolean {
  return (token.length >= 4 && /^[a-z]+$/.test(token)) || isModelNumber(token);
}

function sameWords(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && Array.from(a).every((t) => b.has(t));
}

/**
 * The product doc id the old URL should 308 to, or null to keep the 404.
 *
 * 1. Words of the old name that at most 3 current products contain are its
 *    anchors: a product word like "tynzer" or a model number like "6802",
 *    never "herbicide". No anchor: no redirect.
 * 2. Only products that share an anchor compete, and never one whose model
 *    number differs from the old name's ("Fertistar 161612" is not
 *    "Fertistar 05535"). Each gets an IDF-weighted word-overlap score.
 * 3. A clear winner wins. A near-tie between two different products returns
 *    null. Pages on one card (pack sizes of one product) do not compete with
 *    each other, and the redirect goes to the card's primary page.
 */
export function matchDeletedProduct(
  slug: string,
  missingId: string,
  candidates: MatchCandidate[],
): string | null {
  const query = nameTokens(slugNamePart(slug, missingId));
  if (query.length === 0 || candidates.length === 0) return null;
  // Model numbers come from the URL's NAME part only. A karanarjun-… id ends
  // in a pack size ("…-14000-ml"), which says nothing about the product.
  const nameOnly = slugNamePart(slug, missingId).replace(/\bkaranarjun-.*$/, "");
  const queryNumbers = new Set(nameTokens(nameOnly).filter(isModelNumber));

  // Rarity is counted in PRODUCTS (card groups), not pages: "Kazoo" has four
  // pack-size pages on one card and is still one product.
  const candidateWords = candidates.map((c) => orderedWords(c.name));
  const tokenSets = candidateWords.map((w) => new Set(w));
  const keySets = candidateWords.map((w, i) => new Set([...Array.from(tokenSets[i]!), ...phrases(w)]));
  const groupsWith = new Map<string, Set<string>>();
  candidates.forEach((c, i) => {
    const group = c.groupKey || c.id;
    for (const k of Array.from(keySets[i]!)) {
      if (!groupsWith.has(k)) groupsWith.set(k, new Set());
      groupsWith.get(k)!.add(group);
    }
  });
  const df = (k: string) => groupsWith.get(k)?.size ?? 0;
  const n = new Set(candidates.map((c) => c.groupKey || c.id)).size;
  const weight = (t: string) => Math.log(1 + n / Math.max(1, df(t)));
  const isRare = (k: string) => df(k) >= 1 && df(k) <= MAX_ANCHOR_DF;

  // The anchor is the EARLIEST rare word, or rare two-word phrase, in the old
  // name. Product names lead with the product ("Abacin Insecticide Abamectin
  // 1.9 EC Broad Spectrum Mite Control"); the marketing tail comes later and
  // can match some other product ("broad spectrum"). A phrase anchors a name
  // whose words are each common: "arjun power" in "Karan Arjun Power Plus".
  const queryWords = orderedWords(slugNamePart(slug, missingId));
  let anchor: string | null = null;
  for (let i = 0; i < queryWords.length && !anchor; i++) {
    const w = queryWords[i]!;
    const wordOk = isAnchorShape(w) && (!isModelNumber(w) || queryNumbers.has(w)) && isRare(w);
    if (wordOk) anchor = w;
    else if (i + 1 < queryWords.length && isRare(`${w} ${queryWords[i + 1]}`)) {
      anchor = `${w} ${queryWords[i + 1]}`;
    }
  }
  if (!anchor) return null;

  const querySet = new Set(query);
  const queryBase = slugBase(nameOnly);
  const scored: { c: MatchCandidate; score: number; exact: boolean; tokens: Set<string> }[] = [];
  candidates.forEach((c, i) => {
    const set = tokenSets[i]!;
    if (!keySets[i]!.has(anchor!)) return;
    // Different model numbers are different products, however similar the
    // rest: "Hytech 5402" is not "Hytech 5101".
    const numbers = Array.from(set).filter(isModelNumber);
    if (queryNumbers.size > 0 && numbers.length > 0 && !numbers.some((x) => queryNumbers.has(x))) return;
    let shared = 0;
    let union = 0;
    for (const t of Array.from(new Set([...query, ...Array.from(set)]))) {
      const w = weight(t);
      union += w;
      if (querySet.has(t) && set.has(t)) shared += w;
    }
    scored.push({
      c,
      score: union > 0 ? shared / union : 0,
      exact: !!queryBase && slugBase(c.name) === queryBase,
      tokens: set,
    });
  });
  if (scored.length === 0) return null;

  // Ties fall to the exact current name, then to the lower id, so one URL
  // always redirects to the same page.
  scored.sort(
    (a, b) => b.score - a.score || Number(b.exact) - Number(a.exact) || (a.c.id < b.c.id ? -1 : 1),
  );
  const best = scored[0]!;
  const target = (c: MatchCandidate) => c.primaryId || c.id;
  // The runner-up is the best-scoring DIFFERENT product.
  const sameGroup = (a: MatchCandidate, b: MatchCandidate) =>
    a.id === b.id || (!!a.groupKey && a.groupKey === b.groupKey);
  const second = scored.slice(1).find((s) => !sameGroup(best.c, s.c));
  if (!second) return target(best.c);

  // The old name is exactly this product's current name.
  if (best.exact && !second.exact) return target(best.c);
  // Two cards whose names read the same ("Excel Mera 71 Herbicide" and the
  // Hindi-titled "एक्सेल मेरा ७१ - Excel Mera 71") are one product listed
  // twice; either page is right until an admin links them in
  // /admin/product-identity.
  if (sameWords(best.tokens, second.tokens)) return target(best.c);
  if (best.score >= second.score * MIN_MARGIN) return target(best.c);
  return null;
}
