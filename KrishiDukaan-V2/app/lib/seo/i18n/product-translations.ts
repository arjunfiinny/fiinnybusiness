import {
  ENGLISH_HREFLANG,
  PRODUCT_LANGUAGES,
  getProductLanguage,
  type ProductLanguage,
} from "./languages";
import { getUiStrings } from "./ui-strings";
import { LIMITS, type PageFaq } from "../page-content";
import mr from "../ai-content/i18n/mr.json";
import hi from "../ai-content/i18n/hi.json";

/**
 * Translated product page text, one JSON file per language, keyed by product id
 * (the card's primary id, the same id the English page's canonical points at).
 *
 * To add a language: write ai-content/i18n/{code}.json, import it here and add
 * it to FILES, and add the language's strings in ui-strings.ts.
 */

export interface ProductTranslation {
  /** Product name in the language, usually with the Latin brand in brackets. */
  name: string;
  /** <title> without " | KrishiDukan" (the layout template appends it). */
  title: string;
  metaDescription: string;
  description: string;
  faqs: PageFaq[];
}

const FILES: Record<string, Record<string, unknown>> = { mr, hi };

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** A translation that is complete enough to publish, or null. */
function readTranslation(raw: unknown): ProductTranslation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 200);
  const description = str(r.description, LIMITS.description);
  if (!name || !description) return null;
  const faqs = (Array.isArray(r.faqs) ? r.faqs : [])
    .map((f) => ({
      q: str((f as Record<string, unknown>)?.q, LIMITS.question),
      a: str((f as Record<string, unknown>)?.a, LIMITS.answer),
    }))
    .filter((f) => f.q && f.a)
    .slice(0, LIMITS.faqs);
  return {
    name,
    title: str(r.title, 120),
    metaDescription: str(r.metaDescription, 320),
    description,
    faqs,
  };
}

/** The translation of one product into one language, or null when there is none to publish. */
export function getProductTranslation(code: string, productId: string): ProductTranslation | null {
  if (!getProductLanguage(code) || !getUiStrings(code)) return null;
  return readTranslation(FILES[code]?.[productId]);
}

/** Languages this product has a publishable page in, in PRODUCT_LANGUAGES order. */
export function translatedLanguagesFor(productId: string): ProductLanguage[] {
  return PRODUCT_LANGUAGES.filter((l) => getProductTranslation(l.code, productId) !== null);
}

/** Every product id with at least one translated page, for the sitemap. */
export function translatedProductIds(): Set<string> {
  const ids = new Set<string>();
  for (const [code, file] of Object.entries(FILES)) {
    for (const id of Object.keys(file)) {
      if (getProductTranslation(code, id)) ids.add(id);
    }
  }
  return ids;
}

export function localizedProductPath(code: string, slug: string): string {
  return `/${code}/products/${slug}`;
}

/**
 * hreflang alternates for a product, the same set on the English page and on
 * every translated page (Google ignores annotations that are not reciprocal).
 * English is also x-default. Languages without an ISO 639-1 code are left out
 * (see languages.ts). Paths are relative; metadataBase makes them absolute.
 */
export function productLanguageAlternates(productId: string, slug: string): Record<string, string> {
  const english = `/products/${slug}`;
  const out: Record<string, string> = { [ENGLISH_HREFLANG]: english };
  for (const lang of translatedLanguagesFor(productId)) {
    if (lang.hreflang) out[lang.hreflang] = localizedProductPath(lang.code, slug);
  }
  // Only worth emitting when there is at least one other language.
  if (Object.keys(out).length === 1) return {};
  out["x-default"] = english;
  return out;
}
