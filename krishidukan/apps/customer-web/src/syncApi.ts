/**
 * Fetches live retailer + stock data from the sync-server (port 3999).
 * Falls back to empty array if sync-server is not running.
 */

const SYNC_API = 'http://localhost:3999';

export interface LiveRetailer {
  id: string;
  businessName: string;
  ownerName: string;
  phone: string;
  whatsapp?: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  rating: number;
  totalRatings: number;
  openHours: string;
  type: 'dealer' | 'retailer' | 'erp_retailer';
  erpLinked: boolean;
  stock: LiveStock[];
}

export interface LiveStock {
  retailerId: string;
  productId: string;
  price: number;
  mrp: number;
  inStock: boolean;
  quantity: number;
  source: string;
}

let cache: { data: LiveRetailer[]; ts: number } | null = null;
const CACHE_TTL = 8000; // 8 seconds — fast enough for demo

export async function fetchLiveRetailers(): Promise<LiveRetailer[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;
  try {
    const data: LiveRetailer[] = await fetch(`${SYNC_API}/retailers`, { signal: AbortSignal.timeout(2000) }).then((r) => r.json());
    cache = { data, ts: Date.now() };
    return data;
  } catch {
    return cache?.data ?? [];
  }
}

export async function fetchLiveProductStock(productId: string): Promise<{ retailer: LiveRetailer; stock: LiveStock }[]> {
  try {
    return await fetch(`${SYNC_API}/product-stock/${productId}`, { signal: AbortSignal.timeout(2000) }).then((r) => r.json());
  } catch {
    return [];
  }
}

export function isSyncAvailable(): Promise<boolean> {
  return fetch(`${SYNC_API}/health`, { signal: AbortSignal.timeout(1500) })
    .then((r) => r.ok)
    .catch(() => false);
}
