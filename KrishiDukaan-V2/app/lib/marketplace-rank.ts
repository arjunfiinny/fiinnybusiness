/**
 * The Market's default ("Recommended") order, decided 26 Nov 2026:
 *
 *   1. Products a farmer can order online first: at least one shop's offer has
 *      availability[].isOnline (the copy is online AND the seller's account
 *      switch is on; the same flag checkout trusts, see
 *      functions/src/marketplace/online-eligibility.ts).
 *   2. Within that, the most distinct buyers in the last 90 days, then the last
 *      30 days (productBuyStats: cancelled, refunded and failed-payment orders
 *      are already excluded).
 *   3. Then A→Z by name, as before.
 *
 * Search keeps the best name match first and uses this order only to break
 * ties. A sort the customer picks (price, name) is applied on top in the
 * browser and is not affected.
 *
 * Pure (no Firebase import) so scripts/tests/marketplace-rank.test.ts can run
 * it directly. The server side is marketplace-rank-server.ts.
 */

export type BuyCounts = { d30: number; d90: number };

export interface RankRow {
  /** marketplaceCards doc id (what the API pages over). */
  docId: string;
  /** The card's `id` field: the product id the website and the app show. */
  productId: string;
  nameKey: string;
  categoryKey: string;
  online: boolean;
  d90: number;
  d30: number;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Any shop's offer can be ordered online. */
export function cardIsOnline(data: Record<string, unknown>): boolean {
  const availability = Array.isArray(data.availability) ? data.availability : [];
  return availability.some((a) => (a as Record<string, unknown> | null)?.isOnline === true);
}

/**
 * Product doc ids whose productBuyStats can describe this card. The stats job
 * writes the same totals to every product doc of a card, but not under the
 * card's own doc id, so the listable members are where they are found.
 */
export function statsIdsForCard(docId: string, data: Record<string, unknown>): string[] {
  const listable = Array.isArray(data.listable) ? data.listable : [];
  const ids = listable
    .map((l) => String((l as Record<string, unknown> | null)?.id ?? "").trim())
    .filter(Boolean);
  const own = String(data.id ?? "").trim();
  return Array.from(new Set([...(own ? [own] : []), docId, ...ids]));
}

/** Readable buyer counts from a productBuyStats doc (missing or bad = 0). */
export function readBuyCounts(data: Record<string, unknown> | undefined | null): BuyCounts {
  return { d30: num(data?.d30), d90: num(data?.d90) };
}

export function toRankRow(
  docId: string,
  data: Record<string, unknown>,
  statsById: Map<string, BuyCounts>,
): RankRow {
  // Every member carries the same totals; take the largest in case one is stale.
  let d90 = 0;
  let d30 = 0;
  for (const id of statsIdsForCard(docId, data)) {
    const s = statsById.get(id);
    if (!s) continue;
    if (s.d90 > d90 || (s.d90 === d90 && s.d30 > d30)) {
      d90 = s.d90;
      d30 = s.d30;
    }
  }
  return {
    docId,
    productId: String(data.id ?? "").trim() || docId,
    nameKey: String(data.nameKey ?? ""),
    categoryKey: String(data.categoryKey ?? ""),
    online: cardIsOnline(data),
    d90,
    d30,
  };
}

/** Online first, then 90-day buyers, then 30-day buyers, then A→Z (doc id last, for a stable order). */
export function compareRank(a: RankRow, b: RankRow): number {
  if (a.online !== b.online) return a.online ? -1 : 1;
  if (a.d90 !== b.d90) return b.d90 - a.d90;
  if (a.d30 !== b.d30) return b.d30 - a.d30;
  if (a.nameKey !== b.nameKey) return a.nameKey < b.nameKey ? -1 : 1;
  return a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0;
}

export function rankRows(rows: RankRow[]): RankRow[] {
  return [...rows].sort(compareRank);
}
