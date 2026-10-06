import {
  collection,
  documentId,
  getDocs,
  query,
  where,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

// Firestore's limit for an "in" filter.
const IN_LIMIT = 30;

/**
 * Reads docs by id with documentId() "in" queries of 30, all in parallel,
 * instead of one getDoc per id. Missing ids are simply absent from the map.
 * Only for collections whose rules allow listing these docs (a list query is
 * checked like any other query).
 */
export async function getDocsByIds(
  db: Firestore,
  collectionPath: string,
  ids: Iterable<string>,
): Promise<Map<string, DocumentData>> {
  const unique = Array.from(new Set(Array.from(ids).filter(Boolean)));
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += IN_LIMIT) chunks.push(unique.slice(i, i + IN_LIMIT));
  const snaps = await Promise.all(
    chunks.map((chunk) => getDocs(query(collection(db, collectionPath), where(documentId(), "in", chunk)))),
  );
  const out = new Map<string, DocumentData>();
  for (const snap of snaps) for (const d of snap.docs) out.set(d.id, d.data());
  return out;
}
