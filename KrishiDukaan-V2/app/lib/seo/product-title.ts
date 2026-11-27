/**
 * The <title> of a product page, kept to the ~60 characters Google shows.
 *
 * The old template, "{name} — Price, Uses & Buy Online | KrishiDukan", ran to
 * 80–100 characters for most products, so Google cut the title itself, and
 * often rewrote it. Rules, in order:
 *
 *  1. The product name always comes first.
 *  2. The longest suffix that still fits is added: " — Price & Buy Online",
 *     then " — Buy Online", then none.
 *  3. A name too long to fit alone drops trailing bracketed detail such as
 *     "(Topramezone 336 g/L SC)", then whole trailing words.
 *
 * Returns the title WITHOUT the brand. app/layout.tsx's "%s | KrishiDukan"
 * template appends it, and the length budget counts it.
 */

export const TITLE_MAX = 60;
const BRAND_SUFFIX = " | KrishiDukan";
const SUFFIXES = [" — Price & Buy Online", " — Buy Online", ""];

function fits(title: string): boolean {
  return title.length + BRAND_SUFFIX.length <= TITLE_MAX;
}

/** Cut a name to `max` characters: trailing brackets first, then whole words. */
function shortenName(name: string, max: number): string {
  let s = name.replace(/\s+/g, " ").trim();
  while (s.length > max && /\s*[([][^()[\]]*[)\]]\s*$/.test(s)) {
    s = s.replace(/\s*[([][^()[\]]*[)\]]\s*$/, "").trim();
  }
  if (s.length <= max) return s;
  const words = s.split(" ");
  while (words.length > 1 && words.join(" ").length > max) words.pop();
  s = words.join(" ");
  if (s.length > max) s = s.slice(0, max);
  // A cut can leave a dangling separator ("Syngenta Rosentra –").
  return s.replace(/[\s\-–—:,(/]+$/, "");
}

export function productPageTitle(name: string): string {
  const clean = name.replace(/\s+/g, " ").trim();
  for (const suffix of SUFFIXES) {
    if (fits(clean + suffix)) return clean + suffix;
  }
  return shortenName(clean, TITLE_MAX - BRAND_SUFFIX.length);
}

/** The same title with the brand, for openGraph/twitter (the template does not apply there). */
export function productShareTitle(name: string): string {
  return `${productPageTitle(name)}${BRAND_SUFFIX}`;
}
