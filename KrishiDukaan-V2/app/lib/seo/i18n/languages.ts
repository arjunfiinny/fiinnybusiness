/**
 * The Indian languages a product page can be published in, besides English.
 *
 * A language here is only a possibility. A page /{code}/products/{slug} exists
 * only when BOTH are true:
 *   1. the language has page text (ui-strings.ts), and
 *   2. that product has written text in ai-content/i18n/{code}.json.
 * Everything else 404s, so no page ever ships in English under a language URL
 * (that would be a duplicate of the English page, not a translation).
 *
 * `hreflang` is what goes in <link rel="alternate" hreflang>. Google accepts
 * only ISO 639-1 language codes there, and Konkani, Maithili, Manipuri and
 * Santali have none, so those are null: their pages are still published and
 * indexed (Google detects the language from the text), they just carry no
 * hreflang annotation.
 */

export interface ProductLanguage {
  /** URL prefix and content file name. */
  code: string;
  /** hreflang value, or null where no ISO 639-1 code exists. */
  hreflang: string | null;
  /** Name in its own script, for the language links. */
  native: string;
  english: string;
  dir: "ltr" | "rtl";
}

export const PRODUCT_LANGUAGES: readonly ProductLanguage[] = [
  { code: "hi", hreflang: "hi-IN", native: "हिन्दी", english: "Hindi", dir: "ltr" },
  { code: "mr", hreflang: "mr-IN", native: "मराठी", english: "Marathi", dir: "ltr" },
  { code: "gu", hreflang: "gu-IN", native: "ગુજરાતી", english: "Gujarati", dir: "ltr" },
  { code: "te", hreflang: "te-IN", native: "తెలుగు", english: "Telugu", dir: "ltr" },
  { code: "kn", hreflang: "kn-IN", native: "ಕನ್ನಡ", english: "Kannada", dir: "ltr" },
  { code: "ta", hreflang: "ta-IN", native: "தமிழ்", english: "Tamil", dir: "ltr" },
  { code: "pa", hreflang: "pa-IN", native: "ਪੰਜਾਬੀ", english: "Punjabi", dir: "ltr" },
  { code: "bn", hreflang: "bn-IN", native: "বাংলা", english: "Bengali", dir: "ltr" },
  { code: "or", hreflang: "or-IN", native: "ଓଡ଼ିଆ", english: "Odia", dir: "ltr" },
  { code: "ml", hreflang: "ml-IN", native: "മലയാളം", english: "Malayalam", dir: "ltr" },
  { code: "as", hreflang: "as-IN", native: "অসমীয়া", english: "Assamese", dir: "ltr" },
  { code: "ur", hreflang: "ur-IN", native: "اردو", english: "Urdu", dir: "rtl" },
  { code: "ne", hreflang: "ne-IN", native: "नेपाली", english: "Nepali", dir: "ltr" },
  { code: "ks", hreflang: "ks-IN", native: "کٲشُر", english: "Kashmiri", dir: "rtl" },
  { code: "kok", hreflang: null, native: "कोंकणी", english: "Konkani", dir: "ltr" },
  { code: "mai", hreflang: null, native: "मैथिली", english: "Maithili", dir: "ltr" },
  { code: "mni", hreflang: null, native: "মৈতৈলোন্", english: "Manipuri", dir: "ltr" },
  { code: "sat", hreflang: null, native: "ᱥᱟᱱᱛᱟᱲᱤ", english: "Santali", dir: "ltr" },
];

/** hreflang for the English page, which is also x-default. */
export const ENGLISH_HREFLANG = "en-IN";

const BY_CODE = new Map(PRODUCT_LANGUAGES.map((l) => [l.code, l]));

export function getProductLanguage(code: string): ProductLanguage | null {
  return BY_CODE.get(code) ?? null;
}
