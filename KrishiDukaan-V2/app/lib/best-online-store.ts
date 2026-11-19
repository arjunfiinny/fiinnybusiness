import type { MarketplaceProduct } from '../../types/product';
import type { StoreWithDistance } from '../utils/nearby';
import { calcDiscount } from '../utils/discount';
import { resolveVariant } from './cart-pricing';

export type OnlineStoreChoice = {
  store: StoreWithDistance;
  entry?: NonNullable<MarketplaceProduct['availability']>[number];
  price: number;
  finalPrice: number;
};

/** Orderable sellers ranked by item price, with nearer stores breaking ties. */
export function onlineStoreChoices(
  product: MarketplaceProduct,
  stores: StoreWithDistance[],
  unit?: string,
): OnlineStoreChoice[] {
  const choices: OnlineStoreChoice[] = [];

  for (const store of stores) {
    if (store.onlineDelivery !== true) continue;
    const ids = [store.id, (store as any).userId, (store as any).retailerId, store.phone].filter(Boolean);
    const entry = product.availability?.find((a) =>
      ids.includes(a.storeId) || (a.storePhone && ids.includes(a.storePhone))
    );
    const isOwner = [product.ownerId, product.retailerId, product.retailerPhone, product.manufacturerId, product.manufacturerPhone]
      .some((id) => !!id && ids.includes(id));
    const legacyOwner = !product.availability?.length && !!product.store &&
      (store.name === product.store || (store as any).shopName === product.store);
    if (!entry && !isOwner && !legacyOwner) continue;
    if (entry?.isOnline === false || entry?.stockLevel?.toLowerCase() === 'out of stock') continue;

    const resolved = resolveVariant({
      variantUnit: unit ?? '',
      sellerVariants: entry?.variants,
      sellerBasePrice: entry?.sellingPrice,
      hasSellerSource: !!entry,
      canonicalVariants: product.variants,
      canonicalBasePrice: product.price,
    });
    if (!resolved.ok) continue;
    const price = resolved.price;
    if (!Number.isFinite(price) || price <= 0) continue;
    const discount = product.sellerDiscounts?.[store.phone || '']
      ?? ids.map((id) => product.sellerDiscounts?.[id]).find((value) => value !== undefined)
      ?? entry?.discountPct ?? 0;
    const finalPrice = discount > 0 ? calcDiscount(price, discount).finalPrice : price;
    choices.push({ store, entry, price, finalPrice });
  }
  return choices.sort((a, b) =>
    a.finalPrice - b.finalPrice || a.store.distanceKm - b.store.distanceKm
  );
}

export function bestOnlineStore(
  product: MarketplaceProduct,
  stores: StoreWithDistance[],
  unit?: string,
): OnlineStoreChoice | null {
  return onlineStoreChoices(product, stores, unit)[0] ?? null;
}
