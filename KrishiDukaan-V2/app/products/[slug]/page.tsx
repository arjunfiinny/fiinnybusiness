import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getProductById,
  extractIdFromSlug,
  buildProductSlug,
  getReelsForProduct,
  findReplacementProduct,
  getCanonicalProduct,
  getRelatedProducts,
  getSellerPhonesForProduct,
  type SeoProduct,
} from "../../lib/seo/products-server";
import { getStoresForPhones } from "../../lib/seo/stores-server";
import { getPageContent } from "../../lib/seo/page-content-server";
import { productPageTitle, productShareTitle } from "../../lib/seo/product-title";
import {
  CATEGORY_FIELDS,
  isStandardCategory,
} from "../../dashboard/_lib/category-info";
import {
  categoryMetaForStoredName,
  categoryNameToSlug,
  categoryStoredNames,
} from "../../lib/seo/category-meta";
import { buildReelSlug } from "../../lib/seo/reels-server";
import { displayPrice } from "../../lib/price-display";
import { PriceTag } from "../../../components/shared/price-tag";

// Incremental Static Regeneration — cached at the edge, refreshed hourly.
export const revalidate = 3600;
export const dynamicParams = true;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Human-readable label for a categoryInfo key, using the dashboard field schema.
function labelForKey(category: string, key: string): string {
  if (isStandardCategory(category)) {
    const field = CATEGORY_FIELDS[category].find((f) => f.key === key);
    if (field) return field.label;
  }
  // Fallback: turn camelCase / snake into Title Case.
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function specRows(p: SeoProduct): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(p.categoryInfo)) {
    const value = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "");
    if (value.trim()) rows.push({ label: labelForKey(p.category, key), value });
  }
  // Seller-added rows (Formulation, Pack type…). The app always showed these;
  // the page did not, so ~76 products hid real text from search engines.
  const seen = new Set(rows.map((r) => r.label.toLowerCase()));
  for (const f of p.customFields) {
    if (!seen.has(f.title.toLowerCase())) rows.push({ label: f.title, value: f.value });
  }
  return rows;
}

function priceValue(p: SeoProduct): number {
  return p.lowestFinalPrice ?? p.lowestPrice ?? p.price;
}

/**
 * The product behind a slug, or a redirect / 404 when it has no page.
 *
 * A deleted product's URL 308s to the live product with the same name when
 * the match is confident (product-match.ts); otherwise it 404s, as before.
 * The replacement comes from the cached card index, which can be up to 30
 * minutes old, so a replacement that is this same id is a 404, never a
 * redirect to itself.
 */
async function loadProductOrRedirect(slug: string): Promise<SeoProduct> {
  const id = extractIdFromSlug(slug);
  const product = await getProductById(id);
  if (product) return product;
  const replacement = await findReplacementProduct(slug, id);
  if (replacement && replacement.id !== id) {
    permanentRedirect(`/products/${buildProductSlug(replacement.name, replacement.id)}`);
  }
  notFound();
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductById(extractIdFromSlug(slug));
  if (!product) return { title: "Product Not Found" };

  const crops = [
    ...(Array.isArray(product.categoryInfo.bestForCrops)
      ? product.categoryInfo.bestForCrops
      : []),
  ].join(", ");
  const dosage = product.categoryInfo.dosage
    ? `Dosage: ${product.categoryInfo.dosage}. `
    : "";

  // `title` omits the brand — the "%s | KrishiDukan" template in app/layout.tsx
  // appends it. `shareTitle` carries it explicitly because the template does not
  // apply to openGraph/twitter, and those titles appear standalone when shared.
  // Kept within ~60 characters, product name first (product-title.ts).
  const title = productPageTitle(product.name);
  const shareTitle = productShareTitle(product.name);
  const description =
    `Buy ${product.name} (${product.category}) online at KrishiDukan. ${dosage}` +
    `${crops ? `Best for ${crops}. ` : ""}` +
    `Price ₹${priceValue(product)}. Compare nearby sellers and order with doorstep delivery.`;

  // A second page of the same product (another pack size or a same-name
  // upload on one marketplace card) points its canonical at the card's
  // primary page, so Google indexes one URL per product.
  const canonical = await getCanonicalProduct(product);
  const canonicalPath = `/products/${buildProductSlug(canonical.name, canonical.id)}`;
  const images = (product.images.length ? product.images : [product.image]).filter(
    Boolean,
  );

  return {
    title,
    description: description.slice(0, 320),
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "website",
      title: shareTitle,
      description: description.slice(0, 320),
      url: `${SITE_URL}${canonicalPath}`,
      images: images.map((url) => ({ url })),
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: description.slice(0, 200),
      images,
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await loadProductOrRedirect(slug);

  // One URL per product. Legacy single-hyphen slugs and renamed products used to
  // render a duplicate page with a canonical tag (Search Console's "Alternative
  // page with proper canonical tag"); a 308 consolidates them onto the real URL.
  const canonicalSlug = buildProductSlug(product.name, product.id);
  if (decodeURIComponent(slug) !== canonicalSlug) {
    permanentRedirect(`/products/${canonicalSlug}`);
  }

  const rows = specRows(product);
  const price = priceValue(product);
  const categorySlug = categoryNameToSlug(product.category);
  const images = (product.images.length ? product.images : [product.image]).filter(
    Boolean,
  );
  const categoryMeta = categoryMetaForStoredName(product.category);
  const [reels, related, sellerPhones, canonical, extra] = await Promise.all([
    getReelsForProduct(product.id),
    getRelatedProducts(
      product,
      categoryMeta ? categoryStoredNames(categoryMeta) : [product.category],
    ),
    getSellerPhonesForProduct(product.id),
    getCanonicalProduct(product),
    // Team-added description, FAQs and photos (admin → Product page content).
    getPageContent(product.id),
  ]);
  const stores = await getStoresForPhones(sellerPhones);
  const canonicalUrl = `${SITE_URL}/products/${buildProductSlug(canonical.name, canonical.id)}`;

  // ── JSON-LD: Product + Offer (+ AggregateRating) ──
  const productLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || product.fullName || product.name,
    category: product.category,
    ...(images.length ? { image: images } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: String(price),
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: canonicalUrl,
    },
  };
  if (product.totalReviews && product.averageRating) {
    productLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: String(product.averageRating),
      reviewCount: String(product.totalReviews),
    };
  }

  // ── JSON-LD: FAQPage, only from the team-added FAQs ──
  const faqLd =
    extra && extra.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: extra.faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : null;
  if (extra?.images.length) productLd.image = [...images, ...extra.images];

  // ── JSON-LD: BreadcrumbList ──
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
              name: product.category,
              item: `${SITE_URL}/category/${categorySlug}`,
            },
          ]
        : []),
      {
        "@type": "ListItem",
        position: categorySlug ? 3 : 2,
        name: product.name,
      },
    ],
  };

  return (
    <main className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {faqLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      ) : null}

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
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
                {product.category}
              </Link>
              <span>›</span>
            </>
          ) : null}
          <span className="text-primary truncate max-w-[220px]">{product.name}</span>
        </nav>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Image (plain img to match existing marketplace rendering; no next/image config change) */}
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image}
              alt={product.name}
              className="w-full rounded-2xl border border-surface-container object-cover bg-white"
            />
          ) : null}

          <div>
            <h1 className="text-3xl font-black text-on-surface leading-tight">
              {product.name}
            </h1>
            {product.fullName && product.fullName !== product.name ? (
              <p className="text-base text-on-surface-variant mt-1">{product.fullName}</p>
            ) : null}

            <PriceTag value={displayPrice(product)} size="lg" className="mt-4" />

            {product.totalReviews && product.averageRating ? (
              <p className="mt-2 text-sm text-on-surface-variant">
                ★ {product.averageRating.toFixed(1)} ({product.totalReviews} reviews)
              </p>
            ) : null}

            <p className="mt-2 text-sm font-semibold">
              {product.inStock ? (
                <span className="text-green-700">In stock</span>
              ) : (
                <span className="text-on-surface-variant">Check availability</span>
              )}
            </p>

            {/* Deep-link into the interactive marketplace SPA for ordering. */}
            <Link
              href={`/?view=product&product=${encodeURIComponent(product.id)}`}
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 font-bold text-white hover:opacity-90 transition-opacity"
            >
              View sellers &amp; buy →
            </Link>
          </div>
        </div>

        {/* Description: the seller's own, then the team-added text (removable
            in admin → Product page content without touching the listing). */}
        {product.description || extra?.description ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">
              About {product.name}
            </h2>
            {product.description ? (
              <p className="text-on-surface leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            ) : null}
            {extra?.description
              ? extra.description.split(/\n\s*\n/).map((para, i) => (
                  <p key={i} className="mt-4 text-on-surface leading-relaxed whitespace-pre-line">
                    {para}
                  </p>
                ))
              : null}
          </section>
        ) : null}

        {extra && extra.images.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">{product.name} photos</h2>
            <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {extra.images.map((src, i) => (
                <li key={src}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`${product.name} photo ${i + 2}`}
                    loading="lazy"
                    className="aspect-square w-full rounded-xl border border-surface-container object-cover bg-white"
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Specifications — crawlable spec table from categoryInfo */}
        {rows.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">
              {product.name} — Specifications &amp; Usage
            </h2>
            <table className="w-full text-sm border border-surface-container rounded-xl overflow-hidden">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-surface-container last:border-0">
                    <th className="text-left align-top font-bold text-on-surface-variant px-4 py-3 w-1/3 bg-surface-container-low">
                      {r.label}
                    </th>
                    <td className="px-4 py-3 text-on-surface">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {/* Variants / pack sizes */}
        {product.variants.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">Available Pack Sizes</h2>
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

        {/* Benefits */}
        {product.benefits.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">Key Benefits</h2>
            <div className="flex flex-wrap gap-2">
              {product.benefits.map((b, i) => (
                <span key={i} className="bg-surface-container px-3 py-1.5 rounded-full text-sm font-semibold text-on-surface-variant border border-surface-container-highest">
                  {b}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {/* Product Videos / Reels */}
        {reels.length > 0 ? (
          <section className="mt-10">
            {/* ItemList of links to the reels' watch pages — deliberately NOT
                VideoObject entries, which is what this used to emit.

                A VideoObject is attributed to the page carrying it. Each of
                these videos has its own watch page at /reels/[slug], which
                already declares it with a thumbnailUrl; declaring them again
                here told Google about videos that are not on a watch page and
                Search Console rejected them with exactly that reason. Some
                also shipped without thumbnailUrl (it is required), which fails
                a second way. This is the same fix already applied to the feed
                at app/reels/page.tsx — an ItemList says the true thing: these
                are links to pages, and each of those pages carries one video. */}
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "ItemList",
                  name: `${product.name} — product videos`,
                  itemListElement: reels.map((reel, i) => ({
                    "@type": "ListItem",
                    position: i + 1,
                    url: `${SITE_URL}/reels/${buildReelSlug(reel.title, reel.id)}`,
                    name: reel.title || `${product.name} video by ${reel.shopName}`,
                  })),
                }),
              }}
            />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-black text-on-surface">Product Videos</h2>
              <Link href="/reels" className="text-sm font-bold text-primary hover:underline">
                All AgriReels →
              </Link>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
              {reels.map((reel) => (
                <div key={reel.id} className="min-w-[280px] max-w-[280px] snap-center rounded-2xl overflow-hidden bg-black flex-shrink-0 relative">
                  <video
                    src={reel.videoUrl}
                    poster={reel.thumbnailUrl}
                    controls
                    className="w-full aspect-[9/16] object-cover"
                    preload="metadata"
                  />
                  <Link
                    href={`/reels/${buildReelSlug(reel.title, reel.id)}`}
                    className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/60 to-transparent"
                  >
                    <p className="text-white font-bold text-sm truncate drop-shadow-md">{reel.title}</p>
                    <p className="text-white/90 text-xs truncate drop-shadow-md">by {reel.shopName}</p>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {extra && extra.faqs.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">
              {product.name}: questions farmers ask
            </h2>
            <div className="divide-y divide-surface-container rounded-2xl border border-surface-container bg-white">
              {extra.faqs.map((f) => (
                <details key={f.q} className="group px-4 py-3">
                  <summary className="cursor-pointer list-none font-bold text-on-surface">{f.q}</summary>
                  <p className="mt-2 text-sm leading-relaxed text-on-surface-variant whitespace-pre-line">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {/* Shops that sell it — server-rendered links to their store pages. */}
        {stores.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">
              Shops selling {product.name}
            </h2>
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

        {/* Related products — server-rendered links to other product pages. */}
        {related.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">
              Related {categoryMeta?.heading ?? product.category}
            </h2>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {related.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/products/${buildProductSlug(r.name, r.id)}`}
                    className="block h-full rounded-xl border border-surface-container px-3 py-2 text-sm font-semibold text-on-surface hover:border-primary hover:text-primary"
                  >
                    {r.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {categorySlug ? (
          <div className="mt-12 pt-8 border-t border-surface-container">
            <Link
              href={`/category/${categorySlug}`}
              className="text-sm font-bold text-primary hover:underline"
            >
              ← Browse more {product.category}
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
