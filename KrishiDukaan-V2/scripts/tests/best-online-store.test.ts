import assert from 'node:assert/strict';
import { bestOnlineStore, onlineStoreChoices } from '../../app/lib/best-online-store';
import type { MarketplaceProduct } from '../../types/product';
import type { StoreWithDistance } from '../../app/utils/nearby';

const store = (id: string, distanceKm: number, onlineDelivery = true) => ({
  id, name: id, phone: id, onlineDelivery, distanceKm, distanceLabel: `${distanceKm} km`,
}) as StoreWithDistance;
const product = (availability: MarketplaceProduct['availability'], extra: Partial<MarketplaceProduct> = {}) => ({
  id: 'p', name: 'Product', price: 100, category: 'Inputs', description: '', image: '', availability, ...extra,
}) as MarketplaceProduct;

const near = store('near', 2);
const far = store('far', 30);

const cheaperFar = product([
  { storeId: 'near', stockLevel: 'In Stock', sellingPrice: 100 },
  { storeId: 'far', stockLevel: 'In Stock', sellingPrice: 80 },
]);
assert.equal(bestOnlineStore(cheaperFar, [near, far])?.store.id, 'far');
assert.equal(bestOnlineStore(cheaperFar, [near, store('far', 30, false)])?.store.id, 'near');
assert.equal(bestOnlineStore(cheaperFar, [near])?.store.id, 'near');

const discountWins = product([
  { storeId: 'near', stockLevel: 'In Stock', sellingPrice: 100 },
  { storeId: 'far', stockLevel: 'In Stock', sellingPrice: 110, discountPct: 20 },
]);
assert.equal(bestOnlineStore(discountWins, [near, far])?.store.id, 'far');

const samePrice = product([
  { storeId: 'near', stockLevel: 'In Stock', sellingPrice: 90 },
  { storeId: 'far', stockLevel: 'In Stock', sellingPrice: 90 },
]);
assert.equal(bestOnlineStore(samePrice, [far, near])?.store.id, 'near');

const sizes = product([
  { storeId: 'near', stockLevel: 'In Stock', sellingPrice: 100, variants: [{ unit: '1L', price: 100 }, { unit: '5L', price: 400 }] },
  { storeId: 'far', stockLevel: 'In Stock', sellingPrice: 80, variants: [{ unit: '1L', price: 80 }] },
], { variants: [{ unit: '1L', price: 100 }, { unit: '5L', price: 450 }] });
assert.deepEqual(onlineStoreChoices(sizes, [near, far], '5L').map((choice) => choice.store.id), ['near']);
assert.equal(bestOnlineStore(product([{ storeId: 'near', stockLevel: 'Out of Stock', sellingPrice: 100 }]), [near]), null);

console.log('best-online-store: 6 checks passed');
