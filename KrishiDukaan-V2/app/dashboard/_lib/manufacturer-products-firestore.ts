import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { CARDS_COLLECTION, SEARCH_COLLECTION, searchTerms } from "../../lib/marketplace-cards";
import type { RetailerSeatListing } from "../_types/subscriptions";
import {
  addSeatListingToBatch,
  canAssignSeat,
  fetchSeatListingsForOwner,
  fetchSubscriptions,
  getSubscriptionExpiryDate,
  isListingActive,
} from "./subscriptions-firestore";

export type ProductVariant = {
  unit: string;
  price: number;
  stock?: number;
};

export type ManufacturerProductInput = {
  name: string;
  category: string;
  unit: string;
  price: number;
  variants: ProductVariant[];
  stockQuantity?: number;
  description: string;
  image?: string;
  images?: string[];
  /** Category-specific structured info (new schema). */
  categoryInfo?: Record<string, string | string[]>;
  /** GST configuration for this product. */
  gstApplicable?: boolean;
  /** Predefined (0/5/12/18/28) or a custom seller-entered rate. */
  gstRate?: number;
  /** When true, gstRate is already included in `price` (extract, don't add again). */
  gstIncluded?: boolean;
  /** Per-product delivery surcharge (₹), added on top of the seller's weight-slab charge. */
  extraDeliveryCharge?: number;
  /** When true, this product ships free — it adds no weight/charge to the seller's delivery fee. */
  freeDelivery?: boolean;
  /** Whether this product is available for online home delivery. Defaults to online_delivery. */
  sellMode?: "online_delivery" | "offline_store_only";
  /** Optional YouTube video URL for product demonstration. Stored as-is; never upload to Storage. */
  videoUrl?: string;
  /** Ingredient / nutrient composition (Fertilizers, Pesticides, Herbicides, Bio-Stimulants). */
  composition?: { name: string; value: string }[];
  /** Free-form additional fields entered by the seller — stored as-is, displayed on the product detail page. */
  customFields?: { title: string; value: string }[];
  /** @deprecated Legacy fertilizer fields — still accepted for backward compat. */
  nitrogen?: string;
  phosphorus?: string;
  potassium?: string;
  applicationDesc?: string;
  dosage?: string;
  bestForCrops?: string[];
};

/**
 * Creates a manufacturer's own product.
 * Validates seat availability then atomically creates the product + seat listing.
 * 1 product = 1 seat consumed (listingType: "own").
 */
export async function createManufacturerProduct(
  manufacturerId: string,
  input: ManufacturerProductInput,
): Promise<{ productId: string; inventoryId: string; seatListingId: string }> {
  const [subs, listings] = await Promise.all([
    fetchSubscriptions(manufacturerId),
    fetchSeatListingsForOwner(manufacturerId),
  ]);
  if (!canAssignSeat(subs, listings)) {
    throw new Error(
      "No seats available. Purchase a subscription to add products to your catalogue.",
    );
  }
  const subExpiry = getSubscriptionExpiryDate(subs);
  if (!subExpiry) throw new Error("No active subscription found.");

  // Resolve phone first, then read profile from the phone-keyed doc (new schema)
  const idxSnap = await getDoc(doc(db, "uidIndex", manufacturerId));
  const manufacturerPhone = idxSnap.exists() ? String(idxSnap.data().phone ?? "") : null;

  // Read manufacturer profile using phone as doc ID; fall back to uid for legacy accounts
  const mfgSnap = await getDoc(
    doc(db, "manufacturers", manufacturerPhone || manufacturerId),
  );
  const storeName = mfgSnap.exists()
    ? String(mfgSnap.data().businessName ?? mfgSnap.data().ownerName ?? "")
    : "";

  const now = serverTimestamp();
  const stockQty = input.stockQuantity ?? 0;
  const batch = writeBatch(db);

  const productRef = doc(collection(db, "products"));
  batch.set(productRef, {
    id: productRef.id,
    name: input.name.trim(),
    category: input.category.trim(),
    unit: input.unit.trim(),
    price: input.price,
    variants: input.variants,
    description: input.description.trim(),
    image: (input.image ?? "").trim(),
    images: input.images ?? [],
    isActive: true,
    sellMode: input.sellMode ?? "offline_store_only",
    isOnline: (input.sellMode ?? "offline_store_only") === "online_delivery",
    ownerId: manufacturerId,
    ownerPhone: manufacturerPhone ?? null,
    ownerType: "manufacturer",
    createdBy: manufacturerId,
    manufacturerId,
    manufacturerPhone: manufacturerPhone ?? null,
    store: storeName,
    source: "manufacturer_inventory",
    createdAt: now,
    updatedAt: now,
    categoryInfo: input.categoryInfo ?? null,
    videoUrl: input.videoUrl?.trim() || null,
    composition: input.composition?.length ? input.composition : null,
    customFields: input.customFields?.length ? input.customFields : null,
    // GST fields
    gstApplicable: input.gstApplicable ?? false,
    gstRate: input.gstApplicable ? (input.gstRate ?? 0) : 0,
    // Business default is INCLUDED — only exclusive when the seller explicitly set it.
    gstIncluded: input.gstApplicable ? (input.gstIncluded ?? true) : false,
    // Delivery — per-product surcharge on top of the global weight-slab charge
    extraDeliveryCharge: input.extraDeliveryCharge ?? 0,
    freeDelivery: input.freeDelivery ?? false,
    // Note: legacy fertilizer flat fields (nitrogen, phosphorus, etc.) are no longer
    // written here — category-specific data lives in categoryInfo only.
  });

  // Inventory record for the manufacturer's own stock
  const inventoryRef = doc(collection(db, "inventory"));
  batch.set(inventoryRef, {
    id: inventoryRef.id,
    ownerId: manufacturerId,
    ownerPhone: manufacturerPhone ?? null,
    ownerType: "manufacturer",
    manufacturerId,
    manufacturerPhone: manufacturerPhone ?? null,
    productId: productRef.id,
    stockQuantity: stockQty,
    sellingPrice: input.price,
    reorderThreshold: 0,
    isAvailable: stockQty > 0,
    updatedAt: now,
  });

  const seatListingId = addSeatListingToBatch(batch, {
    ownerId: manufacturerId,
    ownerType: "manufacturer",
    manufacturerId,
    retailerDocId: null,
    retailerId: null,
    productId: productRef.id,
    manufacturerProductId: null,
    listingType: "own",
    expiresAt: subExpiry,
  });

  if (manufacturerPhone) {
    batch.set(
      doc(db, "users", manufacturerPhone),
      { productCount: increment(1), updatedAt: now },
      { merge: true },
    );
  }

  await batch.commit();

  // Subcollection mirrors (fire-and-forget)
  if (manufacturerPhone) {
    setDoc(
      doc(db, `manufacturers/${manufacturerPhone}/products/${productRef.id}`),
      {
        productId: productRef.id,
        name: input.name.trim(),
        category: input.category.trim(),
        isActive: true,
        addedAt: now
      },
      { merge: true }
    ).catch(() => {});

    setDoc(
      doc(db, `manufacturers/${manufacturerPhone}/inventory/${inventoryRef.id}`),
      {
        id: inventoryRef.id,
        productId: productRef.id,
        stockQuantity: stockQty,
        sellingPrice: input.price,
        reorderThreshold: 0,
        isAvailable: stockQty > 0,
        updatedAt: now,
      },
      { merge: true }
    ).catch(() => {});
  }

  return { productId: productRef.id, inventoryId: inventoryRef.id, seatListingId };
}

/** Fetches all seat listings belonging to this manufacturer (own + assigned). */
export async function fetchManufacturerSeatListings(
  manufacturerId: string,
): Promise<RetailerSeatListing[]> {
  return fetchSeatListingsForOwner(manufacturerId);
}

/** Fetches only own-product listings (listingType: "own"). */
export async function fetchOwnProductListings(
  ownerId: string,
): Promise<RetailerSeatListing[]> {
  const q = query(
    collection(db, "retailerSeatListings"),
    where("ownerId", "==", ownerId),
    where("listingType", "==", "own"),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const raw = d.data() as Record<string, unknown>;
      const status = raw.status;
      return {
        id: d.id,
        ownerId: String(raw.ownerId ?? ""),
        ownerType: (raw.ownerType === "retailer" ? "retailer" : "manufacturer") as "manufacturer" | "retailer",
        manufacturerId: raw.manufacturerId ? String(raw.manufacturerId) : null,
        retailerDocId: raw.retailerDocId ? String(raw.retailerDocId) : null,
        retailerId: raw.retailerId ? String(raw.retailerId) : null,
        productId: String(raw.productId ?? ""),
        manufacturerProductId: null,
        listingType: "own" as const,
        status: (status === "released" || status === "expired" ? status : "active") as RetailerSeatListing["status"],
        assignedAt: raw.assignedAt as RetailerSeatListing["assignedAt"],
        expiresAt: raw.expiresAt as RetailerSeatListing["expiresAt"],
        releasedAt: raw.releasedAt ? (raw.releasedAt as RetailerSeatListing["releasedAt"]) : null,
      } satisfies RetailerSeatListing;
    })
    .filter(isListingActive)
    .sort((a, b) => (b.assignedAt?.toMillis?.() ?? 0) - (a.assignedAt?.toMillis?.() ?? 0));
}

/** Update editable fields of a manufacturer's own product. */
export async function updateManufacturerProduct(
  productId: string,
  input: Partial<ManufacturerProductInput>,
): Promise<void> {
  // ── OWNERSHIP AUDIT ──────────────────────────────────────────────────────
  console.log("[updateManufacturerProduct] Saving to products/" + productId, {
    fields: Object.keys(input).filter(k => (input as any)[k] !== undefined),
    price: input.price,
    name: input.name,
  });
  // ────────────────────────────────────────────────────────────────────────
  const ref = doc(db, "products", productId);
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (input.name !== undefined)        patch.name        = input.name.trim();
  if (input.category !== undefined)    patch.category    = input.category.trim();
  if (input.unit !== undefined)        patch.unit        = input.unit.trim();
  if (input.price !== undefined)       patch.price       = input.price;
  if (input.variants !== undefined)       patch.variants       = input.variants;
  if (input.stockQuantity !== undefined)  patch.stockQuantity  = input.stockQuantity;
  if (input.description !== undefined) patch.description = input.description.trim();
  if (input.image !== undefined)       patch.image       = (input.image ?? "").trim();
  if (input.images !== undefined)      patch.images      = input.images;
  if (input.categoryInfo !== undefined)    patch.categoryInfo    = input.categoryInfo ?? null;
  if (input.videoUrl !== undefined)        patch.videoUrl        = input.videoUrl.trim() || null;
  if (input.composition !== undefined)  patch.composition  = input.composition?.length ? input.composition : null;
  if (input.customFields !== undefined) patch.customFields = input.customFields?.length ? input.customFields : null;
  if (input.gstApplicable !== undefined) {
    patch.gstApplicable = input.gstApplicable;
    patch.gstRate = input.gstApplicable ? (input.gstRate ?? 0) : 0;
    // Business default is INCLUDED — only exclusive when the seller explicitly set it.
    patch.gstIncluded = input.gstApplicable ? (input.gstIncluded ?? true) : false;
  }
  if (input.extraDeliveryCharge !== undefined) {
    patch.extraDeliveryCharge = Number.isFinite(input.extraDeliveryCharge)
      ? Math.max(0, input.extraDeliveryCharge)
      : 0;
  }
  if (input.freeDelivery !== undefined) {
    patch.freeDelivery = input.freeDelivery;
  }
  // Legacy fertilizer flat fields omitted — categoryInfo is the source of truth.
  await updateDoc(ref, patch);
}

/**
 * Syncs the manufacturer's updated price/variants to all active retailer product
 * copies. Skips any copy that has `hasCustomPrice: true` (retailer opted into
 * their own pricing). The `syncSellerProductToCanonical` Firebase Function
 * automatically cascades each copy update to the manufacturer product's
 * availability[] entry.
 */
export async function syncPriceToRetailers(
  manufacturerProductId: string,
  price: number,
  variants: { unit: string; price: number; stock?: number }[],
): Promise<{ updated: number; skipped: number }> {
  const listingsSnap = await getDocs(
    query(
      collection(db, "retailerSeatListings"),
      where("manufacturerProductId", "==", manufacturerProductId),
      where("status", "==", "active"),
    ),
  );

  if (listingsSnap.empty) return { updated: 0, skipped: 0 };

  const copyIds = listingsSnap.docs
    .map((d) => String(d.data().productId ?? ""))
    .filter(Boolean);

  const copySnaps = await Promise.all(
    copyIds.map((id) => getDoc(doc(db, "products", id))),
  );

  const batch = writeBatch(db);
  let updated = 0;
  let skipped = 0;

  for (const snap of copySnaps) {
    if (!snap.exists()) continue;
    if (snap.data().hasCustomPrice === true) { skipped++; continue; }
    batch.update(snap.ref, { price, variants, updatedAt: serverTimestamp() });
    updated++;
  }

  if (updated > 0) await batch.commit();
  return { updated, skipped };
}

/** Toggle a product's isActive flag. */
export async function toggleProductActive(productId: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(db, "products", productId), { isActive, updatedAt: serverTimestamp() });
}

export type ProductSearchResult = {
  id: string; name: string; category: string; unit: string; price: number;
  description: string; image: string; images: string[]; variants: { unit: string; price: number }[];
  categoryInfo?: Record<string, string | string[]>;
  nitrogen?: string; phosphorus?: string; potassium?: string; applicationDesc?: string; dosage?: string; bestForCrops?: string[];
};

/** The fields the add-product form autofills, from a product doc or a marketplace card. */
function toSearchResult(id: string, r: Record<string, unknown>): ProductSearchResult {
  return {
    id,
    name: String(r.name ?? ""),
    category: String(r.category ?? ""),
    unit: String(r.unit ?? ""),
    price: Number(r.price ?? 0),
    description: String(r.description ?? ""),
    image: String(r.image ?? ""),
    images: Array.isArray(r.images) ? r.images.filter((v): v is string => typeof v === "string") : [],
    variants: Array.isArray(r.variants) ? r.variants : [],
    categoryInfo: (r.categoryInfo && typeof r.categoryInfo === "object" && !Array.isArray(r.categoryInfo))
      ? r.categoryInfo as Record<string, string | string[]>
      : undefined,
    nitrogen: r.nitrogen ? String(r.nitrogen) : "",
    phosphorus: r.phosphorus ? String(r.phosphorus) : "",
    potassium: r.potassium ? String(r.potassium) : "",
    applicationDesc: r.applicationDesc ? String(r.applicationDesc) : "",
    dosage: r.dosage ? String(r.dosage) : "",
    bestForCrops: Array.isArray(r.bestForCrops) ? r.bestForCrops : [],
  };
}

const NAME_SEARCH_LIMIT = 10;
// Search docs whose name has the query's longest word; the whole query is
// then checked against the name here.
const NAME_SEARCH_TOKEN_SCAN = 25;

/**
 * Existing products whose name contains `term`, for the add-product form's
 * suggestions: at most 10, sorted by name.
 *
 * Reads the marketplace cards (one per product name, built by Cloud
 * Functions) instead of the products collection: a name prefix query on
 * marketplaceCards plus the name tokens on the Market search's docs
 * (marketplaceSearch.nameKeywords), at most ~45 reads (usually ~10-20)
 * instead of every product. A card's id is the
 * product its merge chose as canonical, which is the manufacturer_inventory
 * product when one exists, so the chosen id (the new copy's
 * originalProductId) follows the same source ranking as before.
 *
 * Cards merge variants across sellers; call fetchProductForAutofill with the
 * chosen id to autofill from that product's own doc.
 */
export async function searchProductsByName(term: string): Promise<ProductSearchResult[]> {
  const lower = term.trim().toLowerCase();
  if (!lower) return [];
  const cardsCol = collection(db, CARDS_COLLECTION);
  const [primary] = searchTerms(lower);

  const [prefixSnap, tokenSnap] = await Promise.all([
    getDocs(query(
      cardsCol,
      where("nameKey", ">=", lower),
      where("nameKey", "<", `${lower}\uf8ff`),
      orderBy("nameKey"),
      limit(NAME_SEARCH_LIMIT),
    )),
    primary
      ? getDocs(query(
        collection(db, SEARCH_COLLECTION),
        where("nameKeywords", "array-contains", primary),
        orderBy("nameKey"),
        limit(NAME_SEARCH_TOKEN_SCAN),
      ))
      : Promise.resolve(null),
  ]);

  const nameById = new Map<string, string>();
  const cardData = new Map<string, Record<string, unknown>>();
  for (const d of prefixSnap.docs) {
    nameById.set(d.id, String(d.get("nameKey") ?? ""));
    cardData.set(d.id, d.data());
  }
  for (const d of tokenSnap?.docs ?? []) {
    const nameKey = String(d.get("nameKey") ?? "");
    if (nameKey.includes(lower)) nameById.set(d.id, nameKey);
  }

  const ids = Array.from(nameById.keys())
    .sort((a, b) => nameById.get(a)!.localeCompare(nameById.get(b)!))
    .slice(0, NAME_SEARCH_LIMIT);
  const missing = ids.filter((id) => !cardData.has(id));
  if (missing.length > 0) {
    const snap = await getDocs(query(cardsCol, where(documentId(), "in", missing)));
    for (const d of snap.docs) cardData.set(d.id, d.data());
  }

  return ids
    .filter((id) => cardData.has(id))
    .map((id) => {
      const card = cardData.get(id)!;
      // The card's `id` field is the canonical product's id; the card doc's
      // own id is a hash of the name.
      return toSearchResult(String(card.id ?? ""), card);
    })
    .filter((p) => p.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The chosen suggestion's own product doc (1 read, once per pick), for the
 * exact variants and fields to autofill. Null if it no longer exists.
 */
export async function fetchProductForAutofill(productId: string): Promise<ProductSearchResult | null> {
  const snap = await getDoc(doc(db, "products", productId));
  return snap.exists() ? toSearchResult(snap.id, snap.data()) : null;
}
