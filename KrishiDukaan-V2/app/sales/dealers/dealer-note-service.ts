import { collection, doc, getDocs, onSnapshot, query, where, orderBy, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * A free-text note a rep leaves against a dealer. Same collection and field
 * shape the Flutter Sales App writes
 * (sales_app/lib/features/dealers/data/dealer_note.dart).
 */
export type DealerNote = {
  id: string;
  dealerId: string;
  salesExecutiveId: string;
  note: string;
  createdAt: unknown;
};

function mapNoteDoc(d: { id: string; data: () => Record<string, unknown> }): DealerNote {
  const data = d.data();
  return {
    id: d.id,
    dealerId: String(data.dealerId ?? ''),
    salesExecutiveId: String(data.salesExecutiveId ?? ''),
    note: String(data.note ?? ''),
    createdAt: data.createdAt,
  };
}

/** A dealer's notes, oldest first — used by the admin Dealer Detail page. */
export function watchNotesForDealer(dealerId: string, onChange: (notes: DealerNote[]) => void, onError: () => void) {
  const q = query(
    collection(db, 'dealerNotes'),
    where('dealerId', '==', dealerId),
    orderBy('createdAt'),
  );
  return onSnapshot(q, (snap) => onChange(snap.docs.map(mapNoteDoc)), onError);
}

export async function fetchNotesByExec(uid: string): Promise<DealerNote[]> {
  const snap = await getDocs(query(collection(db, 'dealerNotes'), where('salesExecutiveId', '==', uid)));
  return snap.docs.map(mapNoteDoc);
}

/** A null note deletes an existing record. An omitted ID creates a new note. */
export async function writeDealerNote(execId: string, dealerId: string, note: string | null, noteId?: string) {
  const dealerRef = doc(db, 'dealers', dealerId);
  const notes = collection(db, 'dealerNotes');
  const noteRef = noteId ? doc(notes, noteId) : doc(notes);
  await runTransaction(db, async (transaction) => {
    const dealer = (await transaction.get(dealerRef)).data();
    if (!dealer || dealer.active === false || dealer.createdBy !== execId) {
      throw new Error('This dealer is no longer available.');
    }
    if (noteId) {
      const saved = (await transaction.get(noteRef)).data();
      if (!saved || saved.dealerId !== dealerId || saved.salesExecutiveId !== execId) {
        throw new Error('This note is no longer available.');
      }
    }
    if (note === null) transaction.delete(noteRef);
    else if (noteId) transaction.update(noteRef, { note: note.trim(), updatedAt: serverTimestamp() });
    else transaction.set(noteRef, { dealerId, salesExecutiveId: execId, note: note.trim(), createdAt: serverTimestamp() });
  });
}
