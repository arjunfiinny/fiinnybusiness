import {
  collection,
  doc,
  addDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  query,
  where,
  GeoPoint,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizeDealerStatus } from './dealer-status';

/**
 * Shared dealer record. Older records may omit type, interest or status.
 */
export type Dealer = {
  id: string;
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  type: string;
  geo: { latitude: number; longitude: number } | null;
  active: boolean;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
  imageUrl?: string;
  imagePath?: string;

  /**
   * How interested the dealer seemed, as the rep's own assessment — written
   * only by the Flutter Sales App (DealerInterest enum: 'low' | 'considering'
   * | 'veryInterested'). Optional with no fallback: unlike `type`, a missing
   * value means "not assessed", not a default to assume.
   */
  interest?: string;
  status?: string;
};

export type DealerInput = {
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  geo: { lat: number; lng: number } | null;
};

function mapDealerDoc(d: { id: string; data: () => Record<string, unknown> }): Dealer {
  const data = d.data();
  const rawGeo = data.geo as any;
  return {
    id: d.id,
    shopName: String(data.shopName ?? ''),
    ownerName: String(data.ownerName ?? ''),
    phone: String(data.phone ?? ''),
    address: String(data.address ?? ''),
    type: String(data.type ?? 'retailer'),
    geo: rawGeo ? { latitude: rawGeo.latitude, longitude: rawGeo.longitude } : null,
    active: data.active !== false,
    createdBy: String(data.createdBy ?? ''),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    imageUrl: data.imageUrl ? String(data.imageUrl) : undefined,
    imagePath: data.imagePath ? String(data.imagePath) : undefined,
    interest: data.interest ? String(data.interest) : undefined,
    status: normalizeDealerStatus(data.status) || undefined,
  };
}

export async function fetchDealers(): Promise<Dealer[]> {
  const q = query(
    collection(db, 'dealers'),
    where('active', '==', true),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDealerDoc(d as any));
}

/** Active dealers created by one sales executive — used by the admin Sales Team detail page. */
export function watchDealersByExec(
  uid: string,
  onChange: (dealers: Dealer[]) => void,
  onError: (error: Error) => void,
): () => void {
  const q = query(
    collection(db, 'dealers'),
    where('createdBy', '==', uid),
    where('active', '==', true),
  );
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map(mapDealerDoc).sort((a, b) => a.shopName.localeCompare(b.shopName)));
  }, onError);
}

/** A single dealer by id, or null if it doesn't exist — used by the admin Dealer Detail page. */
export function watchDealer(
  dealerId: string,
  onChange: (dealer: Dealer | null) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(doc(db, 'dealers', dealerId), (snap) => {
    onChange(snap.exists() ? mapDealerDoc(snap) : null);
  }, onError);
}

export async function createDealer(uid: string, input: DealerInput): Promise<string> {
  const now = serverTimestamp();
  const ref = await addDoc(collection(db, 'dealers'), {
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    geo: input.geo ? new GeoPoint(input.geo.lat, input.geo.lng) : null,
    active: true,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateDealer(dealerId: string, input: DealerInput): Promise<void> {
  await updateDoc(doc(db, 'dealers', dealerId), {
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    geo: input.geo ? new GeoPoint(input.geo.lat, input.geo.lng) : null,
    updatedAt: serverTimestamp(),
  });
}

export async function deactivateDealer(dealerId: string): Promise<void> {
  await updateDoc(doc(db, 'dealers', dealerId), {
    active: false,
    updatedAt: serverTimestamp(),
  });
}
