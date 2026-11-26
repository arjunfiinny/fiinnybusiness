/**
 * Deleted-product URL → live product redirects, the one-page-per-card rule,
 * and product page titles.
 * Run: npx tsx scripts/tests/product-match.test.ts
 *
 * The fixture is every product page live on 26 Nov 2026 (the listable docs of
 * all marketplace cards: id, name, card group, primary page). The deleted ids
 * below are real 404s from Search Console. Only the Rosentra doc's old name
 * is on record (scripts/out/stage0-product-identity-audit-2026-10-23.json);
 * the other old slugs are the forms their URLs take.
 */
import assert from "node:assert/strict";
import {
  matchDeletedProduct,
  nameTokens,
  slugNamePart,
  type MatchCandidate,
} from "../../app/lib/seo/product-match";
import { productPageTitle, productShareTitle, TITLE_MAX } from "../../app/lib/seo/product-title";
import {
  buildProductIndex,
  buildProductSlug,
  extractIdFromSlug,
  primaryListable,
} from "../../app/lib/seo/products-server";
import live from "./fixtures/listable-products-2026-11-26.json";

const LIVE = live as (MatchCandidate & { category: string })[];

function redirectFor(slug: string, candidates: MatchCandidate[] = LIVE): string | null {
  return matchDeletedProduct(slug, extractIdFromSlug(slug), candidates);
}

// 1. Deleted products that were recreated under a new id → the live one.
const REDIRECTS: [string, string][] = [
  ["basf-tynzer-herbicide-flux-herbicide-effective-weed-control-solution-f--cjxvre7sm1GETpAcwb1i", "W9HI0Lcrcp0fewF2HCul"],
  ["isabion--iHA3O29L5hCP7ifoWtbw", "LETPu32qWmLOTy6yO6MZ"],
  ["syngenta-isabion-biostimulant--RHoYxsoMd8LYH67UW3X8", "XJuCdY6n9S1U0uthUmJG"],
  ["syngenta-isabion--RHoYxsoMd8LYH67UW3X8", "XJuCdY6n9S1U0uthUmJG"],
  ["bayer-vayego-insecticide--qNvlpwn3fgaKbERan5lU", "HCywhluMboykpbune8Le"],
  ["vayego--qNvlpwn3fgaKbERan5lU", "HCywhluMboykpbune8Le"],
  // A karanarjun-… id carries the name, in every URL form it ever had.
  ["rosentra--karanarjun-rosentra-30-ml", "DODXqry30vXvk4Yjax5Q"],
  ["rosentra-karanarjun-rosentra-30-ml", "DODXqry30vXvk4Yjax5Q"],
  ["karanarjun-rosentra-30-ml", "DODXqry30vXvk4Yjax5Q"],
  // Two live Excel Mera 71 pages: the exact current name wins.
  ["excel-mera-71--RurlQKDEvtkECuwzANlf", "Irr4bLpIr8bBhKlt90EJ"],
  ["excel-mera-71-herbicide--RurlQKDEvtkECuwzANlf", "mtsCxRdjx9MrzvlkOX7r"],
];
for (const [slug, want] of REDIRECTS) {
  assert.equal(redirectFor(slug), want, slug);
}

// 1b. From the full Search Console 404 list (23 Nov): model numbers and grades
//     must agree, and grades read the way URLs write them.
assert.equal(redirectFor("fertistar-161612-Upkhj1hwJoCPHmu3s5tG"), LIVE.find((p) => p.name === "Fertistar 16:16:12")!.primaryId);
assert.equal(redirectFor("npk-151515--karanarjun-npk-15-15-15-50-kg"), LIVE.find((p) => p.name === "NPK 15:15:15")!.primaryId);
assert.equal(redirectFor("syngenta-nk-6802--TPOo1WMcTdWEsaCXEoPv"), LIVE.find((p) => /NK 6802/.test(p.name))!.primaryId);
assert.equal(redirectFor("hytech-5402--qEEmvtavRITeemGDyFtV"), LIVE.find((p) => /Hytech 5402/.test(p.name))!.primaryId);
assert.notEqual(redirectFor("hytech-5402--qEEmvtavRITeemGDyFtV"), LIVE.find((p) => /Hytech 5101/.test(p.name))!.primaryId);
// The long old Excel Mera name: two live cards read the same, either is right.
assert.ok(["mtsCxRdjx9MrzvlkOX7r", "Irr4bLpIr8bBhKlt90EJ"].includes(
  redirectFor("excel-mera-71-herbicide-glyphosate-71-sg-ammonium-salt-weed-control--RurlQKDEvtkECuwzANlf")!,
));
// The product word leads; a marketing tail ("broad spectrum") must not pull
// in another product that happens to share it.
assert.equal(redirectFor("abacin-insecticide-abamectin-19-ec-broad-spectrum-mite-control--uspyuLqOL6tSnJJfc7fF"), "TI6rBmjAu7nKzbqxYJk5");
// Every word common, the phrase rare: "Karan Arjun Power Plus" in any pack.
assert.equal(redirectFor("karan-arjun-power-plus-5ltr--5CBxFDldNyzgGgDovTYP"), "MhdOeDTFMn5065FvFeAM");
assert.equal(redirectFor("karan-arjun-power-plus-3-ltr-6znQ7uoEHOYnNn8Ri2JW"), "MhdOeDTFMn5065FvFeAM");
// Products that are really gone stay 404.
for (const slug of ["aladdin--weL1qWMr3Uo9dIijvu8w", "kaneem--karanarjun-kaneem-250-ml", "15ml--7LFIUVicCiI27kkWjK9k", "hectare-scuffle-hoe--daSUZx6hpICfAHK9ZIr3"]) {
  assert.equal(redirectFor(slug), null, slug);
}
// A sprayer is not "the" sprayer: only kind words in common → 404.
assert.equal(redirectFor("spry-pump--V2j6FXLHvbaw6Cqc0epk"), null);

// 2. A deleted pack-size page → its card's primary page, not a sibling pack.
assert.equal(redirectFor("kazoo-500-ml--karanarjun-kazoo-750-ml"), "xMZfZAkpnXzV2m3WWrIH");
assert.equal(redirectFor("kazoo--deadDocId00000000"), "xMZfZAkpnXzV2m3WWrIH");

// 3. No confident match → null (the page stays a 404).
for (const slug of [
  "bayer-insecticide--deadDocId00000000", // brand + type only: no product word
  "herbicide--deadDocId00000000",
  "random-product-name--deadDocId00000000",
  "deadDocId00000000", // bare id, no name
  "--deadDocId00000000",
]) {
  assert.equal(redirectFor(slug), null, slug);
}

// 4. Two DIFFERENT products that match equally well → null, never a guess.
{
  const pair: MatchCandidate[] = [
    { id: "a1", name: "Alphazor Gold", groupKey: "alphazor gold" },
    { id: "b1", name: "Alphazor Plus", groupKey: "alphazor plus" },
    { id: "c1", name: "Unrelated Thing", groupKey: "unrelated thing" },
  ];
  assert.equal(redirectFor("alphazor--x0", pair), null);
  assert.equal(redirectFor("alphazor-gold--x0", pair), "a1");
  // The same two pages in ONE card group are one product: go to its primary.
  const grouped = pair.map((c) => (c.id === "c1" ? c : { ...c, groupKey: "alphazor", primaryId: "a1" }));
  assert.equal(redirectFor("alphazor--x0", grouped), "a1");
}

// 5. Every live product would be found again from its own slug if it were
//    recreated under a new id (a self-check that names are distinctive enough),
//    or stays a 404. It never lands on a different product's card.
{
  let found = 0;
  for (const p of LIVE) {
    // The URL the site would have built for it (buildProductSlug), under a new id.
    const slug = buildProductSlug(p.name, "newDocId0000000000");
    const got = matchDeletedProduct(slug, "newDocId0000000000", LIVE);
    if (got === null) continue;
    found++;
    const target = LIVE.find((c) => c.id === got)!;
    const sameName = nameTokens(target.name).join(" ") === nameTokens(p.name).join(" ");
    assert.ok(target.groupKey === p.groupKey || sameName, `${p.name} → ${target.name}`);
  }
  assert.ok(found > LIVE.length * 0.7, `only ${found}/${LIVE.length} recoverable`);
}

// 6. slugNamePart.
assert.equal(slugNamePart("bayer-jump--6hjLevmWzByrk5VcwJmE", "6hjLevmWzByrk5VcwJmE"), "bayer-jump");
assert.equal(slugNamePart("bayer-jump-6hjLevmWzByrk5VcwJmE", "6hjLevmWzByrk5VcwJmE"), "bayer-jump");
assert.equal(slugNamePart("6hjLevmWzByrk5VcwJmE", "6hjLevmWzByrk5VcwJmE"), "");
assert.equal(slugNamePart("karanarjun-rosentra-30-ml", "karanarjun-rosentra-30-ml"), "karanarjun-rosentra-30-ml");

// 7. Titles: product name first, within 60 characters with " | KrishiDukan".
assert.equal(
  productPageTitle("BASF Tynzer Selective Maize Herbicide (Topramezone 336 g/L SC)"),
  "BASF Tynzer Selective Maize Herbicide",
);
assert.equal(productPageTitle("Isabion"), "Isabion — Price & Buy Online");
assert.equal(productShareTitle("Isabion"), "Isabion — Price & Buy Online | KrishiDukan");
assert.equal(productPageTitle("Syngenta Isabion Biostimulant"), "Syngenta Isabion Biostimulant — Buy Online");
for (const p of LIVE) {
  const t = productShareTitle(p.name);
  assert.ok(t.length <= TITLE_MAX, `${t.length}: ${t}`);
  const first = p.name.trim().split(/\s+/)[0]!;
  assert.ok(t.startsWith(first.slice(0, 40)), `${p.name} → ${t}`);
}

// 8. One page per card: the primary is the merged product when it has a page,
//    else the first listable doc; every listable doc maps to its card.
{
  assert.equal(primaryListable({ id: "b", listable: [{ id: "a", name: "X" }, { id: "b", name: "X" }] })!.id, "b");
  assert.equal(primaryListable({ id: "z", listable: [{ id: "a", name: "X" }] })!.id, "a");
  assert.equal(primaryListable({ id: "z", listable: [] }), null);

  const index = buildProductIndex([
    {
      data: {
        id: "xMZfZAkpnXzV2m3WWrIH", name: "Kazoo", image: "k.jpg", price: 500, category: "Insecticides",
        groupKey: "kazoo", sellerCount: 2,
        availability: [{ storePhone: "+919000000001" }, { storePhone: "+919000000002" }, { storeId: "+919000000001" }],
        listable: [
          { id: "karanarjun-kazoo-250-ml", name: "Kazoo" },
          { id: "xMZfZAkpnXzV2m3WWrIH", name: "Kazoo" },
        ],
      },
    },
    { data: { id: "lonely", name: "Lonely", listable: [] } },
    {
      data: {
        id: "n1", name: "Nano Urea", image: "n.jpg", price: 240, category: "Fertilizers", groupKey: "nano urea",
        sellerCount: 9, listable: [{ id: "n1", name: "Nano Urea" }],
      },
    },
  ]);
  assert.equal(index.cards.length, 2);
  assert.equal(index.cards[0]!.product.id, "n1", "busiest card first");
  assert.equal(index.byId.get("karanarjun-kazoo-250-ml")!.product.id, "xMZfZAkpnXzV2m3WWrIH");
  assert.deepEqual(index.byId.get("xMZfZAkpnXzV2m3WWrIH")!.storePhones, ["+919000000001", "+919000000002"]);
  assert.equal(index.candidates.length, 3);
  assert.ok(index.candidates.every((c) => c.primaryId === (c.groupKey === "kazoo" ? "xMZfZAkpnXzV2m3WWrIH" : "n1")));
}

console.log("product-match: all assertions passed");
