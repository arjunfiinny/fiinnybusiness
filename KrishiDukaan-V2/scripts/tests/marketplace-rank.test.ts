/**
 * The Market's default order (app/lib/marketplace-rank.ts): online first, then
 * most bought (90 days, then 30), then A→Z.
 * Run: npx tsx scripts/tests/marketplace-rank.test.ts
 */
import assert from "node:assert/strict";
import {
  cardIsOnline,
  rankRows,
  readBuyCounts,
  statsIdsForCard,
  toRankRow,
  type BuyCounts,
} from "../../app/lib/marketplace-rank";

const online = [{ storePhone: "1", isOnline: true }];
const offline = [{ storePhone: "1", isOnline: false }];

function card(name: string, opts: { online?: boolean; listable?: string[]; id?: string } = {}) {
  return {
    id: opts.id ?? `p-${name}`,
    nameKey: name,
    categoryKey: "fertilizers",
    availability: opts.online === false ? offline : online,
    listable: (opts.listable ?? [`p-${name}`]).map((id) => ({ id, name })),
  };
}

// 1. Online flag: any shop's offer online; missing or junk availability is offline.
{
  assert.equal(cardIsOnline({ availability: [{ isOnline: false }, { isOnline: true }] }), true);
  assert.equal(cardIsOnline({ availability: [{ isOnline: "yes" }] }), false, "only a real true counts");
  assert.equal(cardIsOnline({}), false);
  assert.equal(cardIsOnline({ availability: [null] }), false);
}

// 2. Buy stats are found through the listable members (never under the card's doc id in prod).
{
  assert.deepEqual(statsIdsForCard("card1", card("kit", { listable: ["a", "b"], id: "a" })), ["a", "card1", "b"]);
  assert.deepEqual(readBuyCounts({ d30: 3, d90: "7" }), { d30: 3, d90: 7 });
  assert.deepEqual(readBuyCounts({ d30: -1, d90: "x" }), { d30: 0, d90: 0 }, "bad counts are 0");
  assert.deepEqual(readBuyCounts(undefined), { d30: 0, d90: 0 });
}

// 3. The order: online > 90-day buyers > 30-day buyers > name.
{
  const stats = new Map<string, BuyCounts>([
    ["p-jefha", { d90: 12, d30: 8 }],
    ["kit-member", { d90: 13, d30: 13 }], // only on a non-primary member
    ["p-power", { d90: 10, d30: 10 }],
    ["p-tie-a", { d90: 4, d30: 1 }],
    ["p-tie-b", { d90: 4, d30: 4 }],
    ["p-offline-bestseller", { d90: 50, d30: 50 }],
  ]);
  const cards: [string, Record<string, unknown>][] = [
    ["c1", card("abacin")],
    ["c2", card("jefha")],
    ["c3", card("onion sizing kit", { listable: ["kit-primary", "kit-member"] })],
    ["c4", card("power")],
    ["c5", card("offline-bestseller", { online: false })],
    ["c6", card("tie-a")],
    ["c7", card("tie-b")],
    ["c8", card("20:20:0:13", { online: false })],
    ["c9", card("acoreli")],
  ];
  const order = rankRows(cards.map(([id, d]) => toRankRow(id, d, stats))).map((r) => r.nameKey);
  assert.deepEqual(order, [
    "onion sizing kit", // 13 buyers, found via its second member
    "jefha", // 12
    "power", // 10
    "tie-b", // 4 in 90 days, more in the last 30
    "tie-a",
    "abacin", // online, no buyers: A→Z
    "acoreli",
    "offline-bestseller", // offline products after every online one, even a best-seller;
    "20:20:0:13", // within the offline group the same buyers-then-A→Z order applies
  ]);
}

// 4. Same name: stable by doc id, so pages never shuffle between requests.
{
  const rows = [toRankRow("b", card("x"), new Map()), toRankRow("a", card("x"), new Map())];
  assert.deepEqual(rankRows(rows).map((r) => r.docId), ["a", "b"]);
  assert.deepEqual(rankRows(rows.slice().reverse()).map((r) => r.docId), ["a", "b"]);
}

// 5. productId is the card's id field (what the website and app show), else the doc id.
{
  assert.equal(toRankRow("doc1", { id: "prod1", nameKey: "n" }, new Map()).productId, "prod1");
  assert.equal(toRankRow("doc1", { nameKey: "n" }, new Map()).productId, "doc1");
}

console.log("marketplace-rank: all assertions passed");
