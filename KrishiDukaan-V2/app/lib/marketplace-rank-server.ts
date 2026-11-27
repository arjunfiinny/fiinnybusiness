import { getAdminDb } from "./firebase-admin";
import { CARDS_COLLECTION } from "./marketplace-cards";
import { staleWhileErrorCache } from "./seo/stale-cache";
import {
  rankRows,
  readBuyCounts,
  statsIdsForCard,
  toRankRow,
  type BuyCounts,
  type RankRow,
} from "./marketplace-rank";

/**
 * Every marketplace card in the Market's default order (marketplace-rank.ts).
 *
 * ~220 cards with only the fields the order needs, plus the productBuyStats
 * docs of their listable members (~300 small docs). Buy stats are rebuilt
 * every 6 hours and cards change a few times a day, so one read per 5 minutes
 * per server instance is plenty. A failed reload keeps serving the last good
 * order; with none yet, callers fall back to plain A→Z.
 */

const BUY_STATS = "productBuyStats";
const TTL_MS = 5 * 60 * 1000;
const GET_ALL_CHUNK = 300;

async function loadRanking(): Promise<RankRow[]> {
  const db = getAdminDb();
  const cards = await db
    .collection(CARDS_COLLECTION)
    .select("id", "nameKey", "categoryKey", "availability", "listable")
    .get();

  const wanted = new Set<string>();
  for (const c of cards.docs) for (const id of statsIdsForCard(c.id, c.data())) wanted.add(id);

  const statsById = new Map<string, BuyCounts>();
  const refs = Array.from(wanted).map((id) => db.collection(BUY_STATS).doc(id));
  for (let i = 0; i < refs.length; i += GET_ALL_CHUNK) {
    const snaps = await db.getAll(...refs.slice(i, i + GET_ALL_CHUNK), { fieldMask: ["d30", "d90"] });
    for (const s of snaps) if (s.exists) statsById.set(s.id, readBuyCounts(s.data()));
  }

  return rankRows(cards.docs.map((c) => toRankRow(c.id, c.data(), statsById)));
}

export const getMarketRanking: () => Promise<RankRow[]> = staleWhileErrorCache(loadRanking, TTL_MS, {
  onStaleServe: (err) => console.warn("[marketplace-rank] serving the last ranking:", err),
});
