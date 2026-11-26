/**
 * Server-only product data layer for SEO SSR pages (/products, /category).
 *
 * Uses the same server-safe Firebase access pattern as the brand pages
 * (getClientDb() + firebase/firestore/lite over HTTP REST). This module is
 * READ-ONLY: it never writes, and it deliberately does NOT reuse the client
 * fetchMarketplaceProducts() dedup/merge logic — SEO pages render the single
 * canonical product document directly, which is simpler and cannot drift from
 * or affect marketplace behavior.
 *
 * Public read access is permitted by firestore.rules:
 *   match /products/{productId} { allow read: if true; }
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore/lite";
import { getClientDb } from "../firebase-client-server";
import { staleWhileErrorCache } from "./stale-cache";
import { matchDeletedProduct, nameTokens, type MatchCandidate } from "./product-match";

// Per-seller copies — never indexed; only the canonical product gets a page.
const COPY_SOURCES = new Set([
  "retailer_inventory_copy",
  "manufacturer_assigned",
  "admin_assigned",
]);

export interface ProductReel {
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  title: string;
  caption: string;
  shopName: string;
  viewsCount: number;
}

export interface SeoProduct {
  id: string;
  name: string;
  fullName?: string;
  description: string;
  category: string;
  price: number;
  oldPrice?: number;
  image: string;
  images: string[];
  averageRating?: number;
  totalReviews?: number;
  lowestPrice?: number;
  lowestFinalPrice?: number;
  /** Just the per-seller pricing — lets cards strike each offer against its own seller's price. */
  /**
   * Per-seller pricing — lets cards strike each offer against its own seller's
   * price, and price it delivered (lib/delivered-price-client): online flag,
   * GST and the seller's delivery offers ride along.
   */
  availability?: {
    storeId: string; storePhone?: string; stockLevel: string; sellingPrice?: number; discountPct?: number;
    isOnline?: boolean; gstApplicable?: boolean; gstRate?: number; gstIncluded?: boolean;
    extraDeliveryCharge?: number; freeDelivery?: boolean; sellerDeliveryPct?: number;
  }[];
  /** Product-level defaults for the above, the maker, base pack and sell mode. */
  gstApplicable?: boolean;
  gstRate?: number;
  gstIncluded?: boolean;
  extraDeliveryCharge?: number;
  freeDelivery?: boolean;
  sellerDeliveryPct?: number;
  manufacturerPhone?: string;
  unit?: string;
  sellMode?: "online_delivery" | "offline_store_only";
  variants: { unit: string; price: number; stock?: number }[];
  categoryInfo: Record<string, string | string[]>;
  /** Seller-defined spec rows ("Formulation: WG"). The app shows them; the page now does too. */
  customFields: { title: string; value: string }[];
  benefits: string[];
  inStock: boolean;
}

function str(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}

function mapProduct(id: string, data: Record<string, unknown>): SeoProduct {
  const stockText = str(data.stock, "In Stock").toLowerCase();
  const inStock =
    stockText === "in stock" ||
    stockText === "fast selling" ||
    stockText === "trending" ||
    stockText === "";

  return {
    id,
    name: str(data.name),
    fullName: data.fullName ? str(data.fullName) : undefined,
    description: str(data.description),
    category: str(data.category, "Other"),
    price: Number(data.price || 0),
    oldPrice: data.oldPrice ? Number(data.oldPrice) : undefined,
    image: str(data.image),
    images: Array.isArray(data.images) ? (data.images as string[]) : [],
    averageRating:
      typeof data.averageRating === "number" ? data.averageRating : undefined,
    totalReviews:
      typeof data.totalReviews === "number" ? data.totalReviews : undefined,
    lowestPrice:
      typeof data.lowestPrice === "number" ? data.lowestPrice : undefined,
    lowestFinalPrice:
      typeof data.lowestFinalPrice === "number"
        ? data.lowestFinalPrice
        : undefined,
    availability: Array.isArray(data.availability)
      ? (data.availability as Record<string, unknown>[]).map((a) => ({
          storeId: str(a.storeId),
          storePhone: a.storePhone ? str(a.storePhone) : undefined,
          stockLevel: str(a.stockLevel),
          sellingPrice: typeof a.sellingPrice === "number" ? a.sellingPrice : undefined,
          discountPct: typeof a.discountPct === "number" ? a.discountPct : undefined,
          ...(typeof a.isOnline === "boolean" ? { isOnline: a.isOnline } : {}),
          ...(typeof a.gstApplicable === "boolean" ? { gstApplicable: a.gstApplicable } : {}),
          ...(typeof a.gstRate === "number" ? { gstRate: a.gstRate } : {}),
          ...(typeof a.gstIncluded === "boolean" ? { gstIncluded: a.gstIncluded } : {}),
          ...(typeof a.extraDeliveryCharge === "number" ? { extraDeliveryCharge: a.extraDeliveryCharge } : {}),
          ...(typeof a.freeDelivery === "boolean" ? { freeDelivery: a.freeDelivery } : {}),
          ...(typeof a.sellerDeliveryPct === "number" ? { sellerDeliveryPct: a.sellerDeliveryPct } : {}),
        }))
      : undefined,
    ...(typeof data.gstApplicable === "boolean" ? { gstApplicable: data.gstApplicable } : {}),
    ...(typeof data.gstRate === "number" ? { gstRate: data.gstRate } : {}),
    ...(typeof data.gstIncluded === "boolean" ? { gstIncluded: data.gstIncluded } : {}),
    ...(typeof data.extraDeliveryCharge === "number" ? { extraDeliveryCharge: data.extraDeliveryCharge } : {}),
    ...(typeof data.freeDelivery === "boolean" ? { freeDelivery: data.freeDelivery } : {}),
    ...(typeof data.sellerDeliveryPct === "number" ? { sellerDeliveryPct: data.sellerDeliveryPct } : {}),
    ...(data.manufacturerPhone ? { manufacturerPhone: str(data.manufacturerPhone) } : {}),
    ...(data.unit ? { unit: str(data.unit) } : {}),
    ...(data.sellMode === "offline_store_only" || data.sellMode === "online_delivery" ? { sellMode: data.sellMode } : {}),
    variants: Array.isArray(data.variants)
      ? (data.variants as { unit: string; price: number; stock?: number }[])
      : [],
    categoryInfo:
      data.categoryInfo &&
      typeof data.categoryInfo === "object" &&
      !Array.isArray(data.categoryInfo)
        ? (data.categoryInfo as Record<string, string | string[]>)
        : {},
    customFields: Array.isArray(data.customFields)
      ? (data.customFields as Record<string, unknown>[])
          .map((f) => ({ title: str(f?.title).trim(), value: str(f?.value).trim() }))
          .filter((f) => f.title && f.value)
      : [],
    benefits: Array.isArray(data.benefits) ? (data.benefits as string[]) : [],
    inStock,
  };
}

/**
 * True if the doc is a public, canonical, listable product (not a copy/inactive).
 *
 * THE SINGLE DEFINITION OF "has a product page". getProductById() gates the
 * /products/[slug] route on this, and the sitemap emits exactly the docs that
 * pass it — so any surface that renders a /products/… link must agree with it,
 * or it links to a guaranteed 404. Exported for exactly that reason: the brand,
 * store and reel surfaces each grew their own near-miss copy of this rule and
 * each drifted (see isProductPageServable below).
 */
export function isListable(data: Record<string, unknown>): boolean {
  if (data.isActive === false) return false;
  if (COPY_SOURCES.has(str(data.source))) return false;
  if (!data.name || !data.image) return false;
  if (!Number.isFinite(Number(data.price))) return false;
  return true;
}

/**
 * Does /products/{buildProductSlug(name, id)} actually resolve for this id?
 *
 * The link-time counterpart to isListable: surfaces that hold only a product
 * *id* (a reel's linkedProductId, a store's canonicalId) cannot evaluate the
 * predicate themselves, because they never read the product doc. One batched
 * lookup answers it for a whole page's worth of links.
 *
 * Returns the subset of `ids` that will render a 200. Fails OPEN on error —
 * an unreachable Firestore degrades to "show the links" rather than silently
 * emptying a brand or store page of its entire product grid.
 */
export async function filterServableProductIds(
  ids: string[],
): Promise<Set<string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Set();
  try {
    const db = getClientDb();
    const results = await Promise.all(
      unique.map(async (id) => {
        try {
          const snap = await getDoc(doc(db, "products", id));
          if (!snap.exists()) return null;
          return isListable(snap.data() as Record<string, unknown>) ? id : null;
        } catch {
          return id; // fail open for this id
        }
      }),
    );
    return new Set(results.filter((id): id is string => id !== null));
  } catch (err) {
    console.warn("[seo/products-server] filterServableProductIds failed:", err);
    return new Set(unique); // fail open
  }
}

// ─── Slug helpers ─────────────────────────────────────────────────────────
// URL slug format: `{kebab-name}--{docId}` (double-hyphen separator).
// The double hyphen is used because both the kebab name and the Firestore doc
// id can contain single hyphens (e.g. doc id "karanarjun-humi-gold-250-g"),
// making a single-hyphen separator ambiguous at extraction time.
//
// Legacy slugs built before this fix used a single hyphen and only worked
// correctly for auto-generated (no-hyphen) doc ids. The extractor below
// handles both formats so existing indexed URLs continue to resolve.

export function buildProductSlug(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return base ? `${base}--${id}` : id;
}

// The only hyphenated doc ids are the KaranArjun catalogue imports, all of the
// form "karanarjun-<name>-<pack>" (35 listable products as of 2026-10-25).
const LEGACY_HYPHENATED_ID_PREFIX = "karanarjun-";

/** Extract the Firestore doc id from a product slug.
 *  New format:    `{kebab-name}--{docId}`  → split on first "--"
 *  Legacy format: `{kebab-name}-{docId}`   → the "karanarjun-…" id if present,
 *                                            else the last hyphen segment
 *  Bare id (no name prefix):               → returned as-is
 */
export function extractIdFromSlug(slug: string): string {
  const decoded = decodeURIComponent(slug).trim();
  const sep = decoded.indexOf("--");
  if (sep !== -1) return decoded.slice(sep + 2);
  // Legacy single-hyphen URLs of hyphenated ids, e.g.
  // "builder-karanarjun-builder-3000-ml": the last-segment rule below would
  // look up "ml" and 404 a live product, so take the id from its prefix.
  const legacy = decoded.lastIndexOf(LEGACY_HYPHENATED_ID_PREFIX);
  if (legacy !== -1) return decoded.slice(legacy);
  const idx = decoded.lastIndexOf("-");
  return idx === -1 ? decoded : decoded.slice(idx + 1);
}

// ─── Fetchers (each returns null/[] on failure — never throws) ──────────────

export async function getProductById(id: string): Promise<SeoProduct | null> {
  try {
    if (!id) return null;
    const db = getClientDb();
    const snap = await getDoc(doc(db, "products", id));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    if (!isListable(data)) return null;
    return mapProduct(snap.id, data);
  } catch (err) {
    console.warn("[seo/products-server] getProductById failed:", err);
    return null;
  }
}

export async function getReelsForProduct(productId: string): Promise<ProductReel[]> {
  try {
    if (!productId) return [];
    const db = getClientDb();
    const snap = await getDocs(
      query(
        collection(db, "reels"),
        where("linkedProductId", "==", productId),
        limit(50),
      ),
    );
    const reels = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        videoUrl: str(data.videoUrl),
        thumbnailUrl: data.thumbnailUrl ? str(data.thumbnailUrl) : undefined,
        title: str(data.title),
        caption: str(data.caption),
        shopName: str(data.shopName),
        viewsCount: Number(data.viewsCount) || 0,
        createdAt: data.createdAt?.toMillis?.() || 0,
      };
    });
    // Sort manually as Firestore requires composite index for query sorting
    reels.sort((a, b) => {
      const byViews = b.viewsCount - a.viewsCount;
      if (byViews !== 0) return byViews;
      return b.createdAt - a.createdAt;
    });
    return reels.slice(0, 5).map(({ createdAt, ...rest }) => rest);
  } catch (err) {
    console.warn("[seo/products-server] getReelsForProduct failed:", err);
    return [];
  }
}

/**
 * The old per-category query: products docs whose category matches, filtered
 * by isListable. Kept only as the fallback for getProductsByCategory. It reads
 * at most 300 docs, most of them seller copies, which is why /category pages
 * used to show a handful of products (Fertilizers: 4 links).
 */
async function getProductsByCategoryQuery(
  categoryName: string,
  max: number,
): Promise<SeoProduct[]> {
  try {
    const db = getClientDb();
    const snap = await getDocs(
      query(
        collection(db, "products"),
        where("category", "==", categoryName),
        limit(Math.min(max * 3, 300)),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
      .filter(({ data }) => isListable(data))
      .map(({ id, data }) => mapProduct(id, data))
      .slice(0, max);
  } catch (err) {
    console.warn("[seo/products-server] getProductsByCategory failed:", err);
    return [];
  }
}

/**
 * Every product with a page in these categories, one per marketplace card
 * (the card's primary page; see primaryListable). `categoryNames` are stored
 * category names, compared case-insensitively. Busiest products first.
 */
export async function getProductsByCategory(
  categoryNames: string | string[],
  max = 200,
): Promise<SeoProduct[]> {
  const raw = Array.isArray(categoryNames) ? categoryNames : [categoryNames];
  const names = raw.map((n) => n.trim().toLowerCase());
  try {
    const index = await getProductIndex();
    return index.cards
      .filter((c) => names.includes(c.product.category.trim().toLowerCase()))
      .slice(0, max)
      .map((c) => c.product);
  } catch (err) {
    console.warn("[seo/products-server] product index unavailable, using the category query:", err);
    const lists = await Promise.all(raw.map((n) => getProductsByCategoryQuery(n, max)));
    return lists.flat().slice(0, max);
  }
}

// ─── Product index (from marketplaceCards) ──────────────────────────────────
//
// A marketplace card is one real product: every doc of a name group, or of an
// admin-linked canonicalId group. card.listable lists the member docs that
// pass isListable(), and each of those has its own /products page. When a
// card has several (pack-size imports like "karanarjun-kazoo-250-ml" next to
// the main "Kazoo" doc, or two same-name uploads), they are the SAME product,
// and Search Console reported them as "Duplicate without user-selected
// canonical". The index picks one primary page per card. The others keep a
// 200 but carry a canonical tag that points at the primary, and only the
// primary goes in the sitemap and in link lists.

type ListableRow = { id: string; name: string; updatedAtMs?: number };

/** The card's primary page: its merged canonical product when that has a page, else its first listable doc. */
export function primaryListable(card: Record<string, unknown>): ListableRow | null {
  const listable = (Array.isArray(card.listable) ? card.listable : []) as ListableRow[];
  if (listable.length === 0) return null;
  return listable.find((l) => l.id === card.id) ?? listable[0]!;
}

export interface IndexedCard {
  /** The primary page's product, priced from the card (cross-seller lowest price). */
  product: SeoProduct;
  groupKey: string;
  listableIds: string[];
  /** Phones of the shops that sell it (card availability). */
  storePhones: string[];
  sellerCount: number;
  /** Sellers whose offer can be ordered online with delivery (availability isOnline). */
  onlineSellerCount: number;
}

export interface ProductIndex {
  cards: IndexedCard[];
  /** Any listable doc id → its card. */
  byId: Map<string, IndexedCard>;
  candidates: MatchCandidate[];
}

/** Pure: the index from raw marketplaceCards docs. Exported for scripts/tests. */
export function buildProductIndex(cards: { data: Record<string, unknown> }[]): ProductIndex {
  const out: IndexedCard[] = [];
  const byId = new Map<string, IndexedCard>();
  const candidates: MatchCandidate[] = [];
  for (const { data } of cards) {
    const primary = primaryListable(data);
    if (!primary) continue;
    const listable = (data.listable as ListableRow[]).filter((l) => l && l.id);
    const availability = Array.isArray(data.availability)
      ? (data.availability as Record<string, unknown>[])
      : [];
    const storePhones = Array.from(
      new Set(availability.map((a) => str(a.storePhone || a.storeId)).filter(Boolean)),
    );
    const groupKey = str(data.groupKey || data.nameKey);
    const entry: IndexedCard = {
      // The card is the merged product; the primary doc's own name keeps its slug.
      product: mapProduct(primary.id, { ...data, name: primary.name }),
      groupKey,
      listableIds: listable.map((l) => l.id),
      storePhones,
      sellerCount: Number(data.sellerCount) || storePhones.length,
      onlineSellerCount: new Set(
        availability.filter((a) => a.isOnline === true).map((a) => str(a.storePhone || a.storeId)).filter(Boolean),
      ).size,
    };
    out.push(entry);
    for (const l of listable) {
      byId.set(l.id, entry);
      candidates.push({ id: l.id, name: l.name, groupKey, primaryId: primary.id });
    }
  }
  out.sort((a, b) => b.sellerCount - a.sellerCount || a.product.name.localeCompare(b.product.name));
  return { cards: out, byId, candidates };
}

// One read of every card (~220 docs, ~7 MB) per 30 minutes per server
// instance, not per request. Same caching rules as the store list.
const getProductIndex: () => Promise<ProductIndex> = staleWhileErrorCache(
  async () => {
    const snap = await getDocs(collection(getClientDb(), "marketplaceCards"));
    return buildProductIndex(snap.docs.map((d) => ({ data: d.data() as Record<string, unknown> })));
  },
  30 * 60 * 1000,
  { onStaleServe: (err) => console.warn("[seo/products-server] serving the last product index:", err) },
);

export type ProductLink = { id: string; name: string };

/**
 * For a product URL whose doc is gone (or no longer has a page): the live
 * product it should 308 to, or null to keep the 404. See product-match.ts.
 */
export async function findReplacementProduct(slug: string, missingId: string): Promise<ProductLink | null> {
  try {
    const index = await getProductIndex();
    const id = matchDeletedProduct(slug, missingId, index.candidates);
    if (!id) return null;
    const card = index.byId.get(id);
    return card ? { id: card.product.id, name: card.product.name } : null;
  } catch (err) {
    console.warn("[seo/products-server] findReplacementProduct failed:", err);
    return null;
  }
}

/** The page a product's canonical tag should point at: its card's primary page (itself when it is the primary). */
export async function getCanonicalProduct(product: Pick<SeoProduct, "id" | "name">): Promise<ProductLink> {
  try {
    const card = (await getProductIndex()).byId.get(product.id);
    if (card) return { id: card.product.id, name: card.product.name };
  } catch (err) {
    console.warn("[seo/products-server] getCanonicalProduct failed:", err);
  }
  return { id: product.id, name: product.name };
}

/**
 * Other products for a product page: same categories first, ranked by shared
 * name words (same brand or active ingredient), then by seller count. Never
 * the product's own card. [] on failure.
 */
export async function getRelatedProducts(
  product: Pick<SeoProduct, "id" | "name">,
  categoryNames: string[],
  max = 12,
): Promise<SeoProduct[]> {
  try {
    const index = await getProductIndex();
    const own = index.byId.get(product.id);
    const cats = categoryNames.map((c) => c.trim().toLowerCase());
    const words = new Set(nameTokens(product.name));
    return index.cards
      .filter((c) => c !== own && c.product.id !== product.id && cats.includes(c.product.category.trim().toLowerCase()))
      .map((c, order) => ({
        c,
        order,
        shared: nameTokens(c.product.name).filter((t) => words.has(t)).length,
      }))
      .sort((a, b) => b.shared - a.shared || a.order - b.order)
      .slice(0, max)
      .map((x) => x.c.product);
  } catch (err) {
    console.warn("[seo/products-server] getRelatedProducts failed:", err);
    return [];
  }
}

/** Phones of the shops selling a product (all pages of its card). [] on failure. */
export async function getSellerPhonesForProduct(productId: string): Promise<string[]> {
  try {
    return (await getProductIndex()).byId.get(productId)?.storePhones ?? [];
  } catch {
    return [];
  }
}

export type OnlineProductRow = {
  id: string;
  name: string;
  category: string;
  slug: string;
  image: string;
  onlineSellers: number;
  /** Words the seller's own listing puts on the page (description + spec fields). */
  listingWords: number;
};

/**
 * Products that can be ordered online with delivery, one per card (its
 * primary page), busiest first: the list the admin page-content editor works
 * from. Throws when the index cannot be read, so the admin sees an error
 * instead of an empty list.
 */
export async function listOnlineDeliveryProducts(): Promise<OnlineProductRow[]> {
  const index = await getProductIndex();
  const words = (v: unknown) => String(v ?? "").split(/\s+/).filter((w) => /[A-Za-z0-9ऀ-ॿ]/.test(w)).length;
  return index.cards
    .filter((c) => c.onlineSellerCount > 0)
    .map((c) => ({
      id: c.product.id,
      name: c.product.name,
      category: c.product.category,
      slug: buildProductSlug(c.product.name, c.product.id),
      image: c.product.image,
      onlineSellers: c.onlineSellerCount,
      listingWords:
        words(c.product.description) +
        Object.values(c.product.categoryInfo).reduce<number>((s, v) => s + words(Array.isArray(v) ? v.join(" ") : v), 0),
    }));
}

/** The busiest products across the market, one per card, for site-wide link lists. [] on failure. */
export async function getPopularProducts(max = 60): Promise<SeoProduct[]> {
  try {
    return (await getProductIndex()).cards.slice(0, max).map((c) => c.product);
  } catch (err) {
    console.warn("[seo/products-server] getPopularProducts failed:", err);
    return [];
  }
}

/**
 * Product pages for the sitemap: each card's primary page only. Returns [] on
 * failure.
 *
 * Read from marketplaceCards rather than every products doc: each card lists
 * the member docs that pass isListable() (functions/src/marketplace/cards.ts
 * mirrors it), so this reads one doc per product name instead of ~32. The
 * card's other listable pages canonicalize to the primary, and a sitemap
 * should list canonical URLs only.
 */
export async function getAllListableProductsForSitemap(
  max = 5000,
): Promise<{ id: string; name: string; updatedAt: unknown }[]> {
  try {
    const db = getClientDb();
    const snap = await getDocs(collection(db, "marketplaceCards"));
    const out: { id: string; name: string; updatedAt: unknown }[] = [];
    for (const card of snap.docs) {
      const p = primaryListable(card.data() as Record<string, unknown>);
      if (p) out.push({ id: p.id, name: p.name, updatedAt: p.updatedAtMs || null });
    }
    return out.slice(0, max);
  } catch (err) {
    console.warn("[seo/products-server] sitemap products failed:", err);
    return [];
  }
}
