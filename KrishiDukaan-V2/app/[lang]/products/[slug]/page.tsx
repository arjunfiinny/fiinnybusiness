import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getProductById,
  extractIdFromSlug,
  buildProductSlug,
  getCanonicalProduct,
  getRelatedProducts,
  getSellerPhonesForProduct,
  type SeoProduct,
} from "../../../lib/seo/products-server";
import { getStoresForPhones } from "../../../lib/seo/stores-server";
import {
  categoryMetaForStoredName,
  categoryNameToSlug,
  categoryStoredNames,
} from "../../../lib/seo/category-meta";
import { getProductLanguage, type ProductLanguage } from "../../../lib/seo/i18n/languages";
import { getUiStrings, type ProductUiStrings } from "../../../lib/seo/i18n/ui-strings";
import {
  getProductTranslation,
  localizedProductPath,
  productLanguageAlternates,
  translatedLanguagesFor,
  type ProductTranslation,
} from "../../../lib/seo/i18n/product-translations";
import { displayPrice } from "../../../lib/price-display";
import { PriceTag } from "../../../../components/shared/price-tag";
import { ProductLanguageLinks } from "../../../components/shared/product-language-links";

/**
 * A product page in an Indian language: /{lang}/products/{slug}.
 *
 * Same URL slug as the English page (Latin, stable when text is edited), its
 * own canonical, and hreflang links to every other language version. A page
 * exists only for a language with page strings AND a written translation of
 * this product; anything else is a 404, never English text under a language
 * URL. The seller's listing fields (description, specification table) are
 * English and are left out here, so the page reads in one language.
 */

export const revalidate = 3600;
export const dynamicParams = true;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

interface PageProps {
  params: Promise<{ lang: string; slug: string }>;
}

interface Resolved {
  lang: ProductLanguage;
  ui: ProductUiStrings;
  product: SeoProduct;
  t: ProductTranslation;
  slug: string;
}

function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function priceValue(p: SeoProduct): number {
  return p.lowestFinalPrice ?? p.lowestPrice ?? p.price;
}

function metaDescription(t: ProductTranslation): string {
  if (t.metaDescription) return t.metaDescription;
  const flat = t.description.replace(/\s+/g, " ").trim();
  return flat.length > 155 ? `${flat.slice(0, 152)}…` : flat;
}

/**
 * The language, product and translation behind a URL, or null for a 404.
 * With `redirect`, a duplicate product or an outdated slug 308s to the one URL
 * this translation lives at.
 */
async function resolve(params: PageProps["params"], redirect: boolean): Promise<Resolved | null> {
  const { lang: code, slug: rawSlug } = await params;
  const lang = getProductLanguage(code);
  const ui = getUiStrings(code);
  if (!lang || !ui) return null;

  const product = await getProductById(extractIdFromSlug(rawSlug));
  if (!product) return null;

  // Translations are keyed by the card's primary product, the page the English
  // canonical points at. A second listing of the same product has no page of
  // its own here: send it to the primary's page in this language.
  const canonical = await getCanonicalProduct(product);
  if (canonical.id !== product.id) {
    if (redirect && getProductTranslation(code, canonical.id)) {
      permanentRedirect(localizedProductPath(code, buildProductSlug(canonical.name, canonical.id)));
    }
    return null;
  }

  const t = getProductTranslation(code, product.id);
  if (!t) return null;

  const slug = buildProductSlug(product.name, product.id);
  if (redirect && decodeURIComponent(rawSlug) !== slug) {
    permanentRedirect(localizedProductPath(code, slug));
  }
  return { lang, ui, product, t, slug };
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const r = await resolve(params, false);
  if (!r) return { title: "Product Not Found", robots: { index: false } };
  const { lang, ui, product, t, slug } = r;

  const title = t.title || `${t.name}${ui.titleSuffix}`;
  const description = metaDescription(t);
  const path = localizedProductPath(lang.code, slug);
  const images = (product.images.length ? product.images : [product.image]).filter(Boolean);

  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: productLanguageAlternates(product.id, slug),
    },
    openGraph: {
      type: "website",
      locale: `${lang.code}_IN`,
      title: `${title} | KrishiDukan`,
      description,
      url: `${SITE_URL}${path}`,
      images: images.map((url) => ({ url })),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | KrishiDukan`,
      description: description.slice(0, 200),
      images,
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LocalizedProductPage({ params }: PageProps) {
  const r = await resolve(params, true);
  if (!r) notFound();
  const { lang, ui, product, t, slug } = r;

  const path = localizedProductPath(lang.code, slug);
  const pageUrl = `${SITE_URL}${path}`;
  const price = priceValue(product);
  const categorySlug = categoryNameToSlug(product.category);
  const categoryLabel = ui.categories[product.category] ?? product.category;
  const images = (product.images.length ? product.images : [product.image]).filter(Boolean);
  const categoryMeta = categoryMetaForStoredName(product.category);

  const [related, sellerPhones] = await Promise.all([
    getRelatedProducts(
      product,
      categoryMeta ? categoryStoredNames(categoryMeta) : [product.category],
    ),
    getSellerPhonesForProduct(product.id),
  ]);
  const stores = await getStoresForPhones(sellerPhones);
  const languages = translatedLanguagesFor(product.id);

  // ── JSON-LD ──
  const productLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: t.name,
    description: metaDescription(t),
    category: categoryLabel,
    ...(images.length ? { image: images } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: String(price),
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: pageUrl,
    },
  };
  if (product.totalReviews && product.averageRating) {
    productLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: String(product.averageRating),
      reviewCount: String(product.totalReviews),
    };
  }
  const faqLd =
    t.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          inLanguage: lang.code,
          mainEntity: t.faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : null;
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      ...(categorySlug
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: categoryLabel,
              item: `${SITE_URL}/category/${categorySlug}`,
            },
          ]
        : []),
      { "@type": "ListItem", position: categorySlug ? 3 : 2, name: t.name },
    ],
  };

  return (
    <main lang={lang.code} dir={lang.dir} className="min-h-screen bg-surface">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(productLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd) }} />
      {faqLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd) }} />
      ) : null}

      <div className="max-w-4xl mx-auto px-4 py-8">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant mb-6 flex-wrap"
        >
          <Link href="/" className="hover:text-primary">
            KrishiDukan
          </Link>
          <span>›</span>
          {categorySlug ? (
            <>
              <Link href={`/category/${categorySlug}`} className="hover:text-primary">
                {categoryLabel}
              </Link>
              <span>›</span>
            </>
          ) : null}
          <span className="text-primary truncate max-w-[220px]">{t.name}</span>
        </nav>

        <div className="grid md:grid-cols-2 gap-8">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image}
              alt={t.name}
              className="w-full rounded-2xl border border-surface-container object-cover bg-white"
            />
          ) : null}

          <div>
            <h1 className="text-3xl font-black text-on-surface leading-tight">{t.name}</h1>
            {!t.name.includes(product.name) ? (
              <p lang="en" className="text-base text-on-surface-variant mt-1">
                {product.name}
              </p>
            ) : null}

            <PriceTag value={displayPrice(product)} size="lg" className="mt-4" />

            {product.totalReviews && product.averageRating ? (
              <p className="mt-2 text-sm text-on-surface-variant">
                ★ {product.averageRating.toFixed(1)} ({ui.reviews(product.totalReviews)})
              </p>
            ) : null}

            <p className="mt-2 text-sm font-semibold">
              {product.inStock ? (
                <span className="text-green-700">{ui.inStock}</span>
              ) : (
                <span className="text-on-surface-variant">{ui.checkAvailability}</span>
              )}
            </p>

            <Link
              href={`/?view=product&product=${encodeURIComponent(product.id)}`}
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 font-bold text-white hover:opacity-90 transition-opacity"
            >
              {ui.buyCta}
            </Link>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-black text-on-surface mb-3">{ui.about(t.name)}</h2>
          {t.description.split(/\n\s*\n/).map((para, i) => (
            <p key={i} className="mt-4 first:mt-0 text-on-surface leading-relaxed whitespace-pre-line">
              {para}
            </p>
          ))}
        </section>

        {product.variants.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">{ui.packSizes}</h2>
            <ul className="flex flex-wrap gap-3">
              {product.variants.map((v) => (
                <li
                  key={v.unit}
                  className="rounded-xl border border-surface-container px-4 py-2 text-sm font-semibold text-on-surface"
                >
                  {v.unit} — ₹{Number(v.price).toLocaleString("en-IN")}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {t.faqs.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">{ui.faqHeading(t.name)}</h2>
            <div className="divide-y divide-surface-container rounded-2xl border border-surface-container bg-white">
              {t.faqs.map((f) => (
                <details key={f.q} className="group px-4 py-3">
                  <summary className="cursor-pointer list-none font-bold text-on-surface">{f.q}</summary>
                  <p className="mt-2 text-sm leading-relaxed text-on-surface-variant whitespace-pre-line">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {stores.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">{ui.shopsSelling(t.name)}</h2>
            <ul className="grid sm:grid-cols-2 gap-2">
              {stores.map((s) => (
                <li key={s.path}>
                  <Link
                    href={s.path}
                    className="block rounded-xl border border-surface-container px-4 py-2 text-sm hover:border-primary"
                  >
                    <span className="font-bold text-on-surface">{s.name}</span>
                    {s.city ? <span className="text-on-surface-variant"> · {s.city}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {related.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">{ui.related}</h2>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {related.map((p) => {
                const relSlug = buildProductSlug(p.name, p.id);
                const relT = getProductTranslation(lang.code, p.id);
                return (
                  <li key={p.id}>
                    <Link
                      href={relT ? localizedProductPath(lang.code, relSlug) : `/products/${relSlug}`}
                      className="block h-full rounded-xl border border-surface-container px-3 py-2 text-sm font-semibold text-on-surface hover:border-primary hover:text-primary"
                    >
                      {relT ? relT.name : p.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <ProductLanguageLinks
          heading={ui.otherLanguages}
          slug={slug}
          languages={languages}
          current={lang.code}
        />

        {categorySlug ? (
          <div className="mt-12 pt-8 border-t border-surface-container">
            <Link href={`/category/${categorySlug}`} className="text-sm font-bold text-primary hover:underline">
              {ui.browseMore}
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
