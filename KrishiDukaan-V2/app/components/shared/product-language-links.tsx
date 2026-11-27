import Link from "next/link";
import type { ProductLanguage } from "../../lib/seo/i18n/languages";
import { localizedProductPath } from "../../lib/seo/i18n/product-translations";

/**
 * Plain links between a product's language versions. Real <a href>s, not a
 * client-side switch, so a crawler can reach every version from every other
 * one (hreflang alone does not make Google crawl a page).
 */
export function ProductLanguageLinks({
  heading,
  slug,
  languages,
  current,
}: {
  heading: string;
  slug: string;
  /** Translated versions of this product (English is always added first). */
  languages: ProductLanguage[];
  /** Code of the page being shown, or "en". */
  current: string;
}) {
  if (languages.length === 0) return null;
  const items = [
    { code: "en", label: "English", href: `/products/${slug}`, hreflang: "en" },
    ...languages.map((l) => ({
      code: l.code,
      label: l.native,
      href: localizedProductPath(l.code, slug),
      hreflang: l.code,
    })),
  ];
  return (
    <nav aria-label={heading} className="mt-10">
      <h2 className="text-sm font-bold text-on-surface-variant mb-2">{heading}</h2>
      <ul className="flex flex-wrap gap-2">
        {items.map((it) =>
          it.code === current ? (
            <li
              key={it.code}
              aria-current="page"
              className="rounded-full bg-primary px-3 py-1 text-sm font-bold text-white"
            >
              {it.label}
            </li>
          ) : (
            <li key={it.code}>
              <Link
                href={it.href}
                hrefLang={it.hreflang}
                lang={it.hreflang}
                className="block rounded-full border border-surface-container px-3 py-1 text-sm font-semibold text-on-surface hover:border-primary hover:text-primary"
              >
                {it.label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
