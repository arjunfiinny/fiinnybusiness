import {
  arrayUnion,
  collection,
  doc,
  GeoPoint,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { DEALER_STATUSES, normalizeDealerStatus } from "../../sales/dealers/dealer-status";
import type { Dealer, DealerInput } from "../../sales/dealers/dealers-service";

export const DEALER_TYPES: Record<string, string> = {
  retailer: "Retailer", distributor: "Distributor", manufacturer: "Manufacturer",
};
export const DEALER_INTERESTS: Record<string, string> = {
  low: "Low Interest", considering: "Considering", veryInterested: "Very Interested",
};

export type AdminDealerInput = DealerInput & { type: string; interest: string; status: string; note: string };

export async function saveDealer(actorId: string, execId: string, input: AdminDealerInput, original?: Dealer) {
  const status = normalizeDealerStatus(input.status);
  const now = serverTimestamp();
  const fields = {
    shopName: input.shopName.trim(),
    ownerName: input.ownerName.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    type: input.type,
    interest: input.interest || null,
    geo: input.geo ? new GeoPoint(input.geo.lat, input.geo.lng) : null,
    status: status || null,
    updatedAt: now,
  };
  const dealers = collection(db, "dealers");
  const dealer = original ? doc(dealers, original.id) : doc(dealers);
  const history = doc(collection(db, "dealerStatusHistory"));
  const note = doc(collection(db, "dealerNotes"));

  await runTransaction(db, async (transaction) => {
    const current = original
      ? (await transaction.get(dealer)).data()
      : undefined;
    if (original) {
      if (!current || current.createdBy !== execId || current.active === false) {
        throw new Error("This dealer is no longer available.");
      }
      const initial = original.updatedAt as { isEqual?: (value: unknown) => boolean } | undefined;
      const sameVersion = initial?.isEqual ? current.updatedAt && initial.isEqual(current.updatedAt) : initial === current.updatedAt;
      if (!sameVersion) throw new Error("This dealer changed while you were editing. Reopen the form for the latest details.");
      transaction.update(dealer, fields);
    } else {
      transaction.set(dealer, { ...fields, active: true, createdBy: execId, createdAt: now });
      if (input.note.trim()) {
        transaction.set(note, { dealerId: dealer.id, salesExecutiveId: execId, note: input.note.trim(), createdAt: now });
      }
    }

    const previous = normalizeDealerStatus(current?.status);
    if (status && status !== previous) {
      transaction.set(history, {
        dealerId: dealer.id, salesExecutiveId: execId, fromStatus: previous || null,
        toStatus: status, source: original ? "ADMIN_EDIT" : "CREATED", changedBy: actorId, changedAt: now,
      });
      if (!(DEALER_STATUSES as readonly string[]).includes(status)) {
        transaction.set(doc(db, "dealerStatusOptions", execId), {
          statuses: arrayUnion(status), updatedAt: now,
        }, { merge: true });
      }
    }
  });

  return dealer.id;
}

export async function removeDealer(dealer: Dealer, actorId: string) {
  const ref = doc(db, "dealers", dealer.id);
  await runTransaction(db, async (transaction) => {
    const current = (await transaction.get(ref)).data();
    if (!current || current.createdBy !== dealer.createdBy || current.active === false) return;
    transaction.update(ref, {
      active: false, deletedBy: actorId, deletedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  });
}

export type DealerStatusChange = {
  id: string;
  from: string;
  to: string;
  source: string;
  changedAt: unknown;
};

export function watchStatusHistory(dealerId: string, onChange: (events: DealerStatusChange[]) => void, onError: () => void) {
  return onSnapshot(query(
    collection(db, "dealerStatusHistory"), where("dealerId", "==", dealerId), orderBy("changedAt", "desc"),
  ), (snapshot) => onChange(snapshot.docs.map((entry) => {
    const data = entry.data();
    return {
      id: entry.id, from: normalizeDealerStatus(data.fromStatus), to: normalizeDealerStatus(data.toStatus),
      source: String(data.source ?? ""), changedAt: data.changedAt,
    };
  })), onError);
}
