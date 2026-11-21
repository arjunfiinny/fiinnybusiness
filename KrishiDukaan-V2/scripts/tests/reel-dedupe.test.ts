/**
 * One indexable watch page per reel video, and no test uploads — the rule the
 * sitemap and /reels/[slug] (noindex + no VideoObject) both apply.
 * Cases are real shapes from production (Nov 2026).
 * Run: npx tsx scripts/tests/reel-dedupe.test.ts
 */
import assert from "node:assert/strict";
import {
  indexableReelIds,
  isReelIndexable,
  isTestReel,
  pickPrimaryReel,
  reelVideoKey,
} from "../../app/lib/seo/reel-dedupe";

const BUCKET = "https://firebasestorage.googleapis.com/v0/b/krishidukan-e8315.firebasestorage.app/o";
const url = (folder: string, file = "video_optimized.mp4", token = "t") =>
  `${BUCKET}/reels%2F${folder}%2F${file}?alt=media&token=${token}`;
const reel = (id: string, title: string, folder: string, createdAtMs: number, file?: string) => ({
  id, title, videoUrl: url(folder, file, id), createdAtMs,
});

// 1. Key = Storage folder: token and raw-vs-optimized file don't matter.
assert.equal(reelVideoKey(url("46gSZ", "video.mp4", "a")), "reels/46gSZ");
assert.equal(reelVideoKey(url("46gSZ", "video_optimized.mp4", "b")), "reels/46gSZ");
assert.equal(reelVideoKey("https://cdn.example.com/x.mp4?sig=1"), "https://cdn.example.com/x.mp4");

// 2. Test reels: "test-3", "Test reels"; not "Fastest grower" or a demo.
assert.ok(isTestReel({ title: "test 3" }));
assert.ok(isTestReel({ title: "Test reels" }));
assert.ok(!isTestReel({ title: "Fastest grower" }));
assert.ok(!isTestReel({ title: "KrishiDukan demo" }));

// 3. The reel that owns the folder wins, even if a re-share is older.
{
  const original = reel("46gSZ", "", "46gSZ", 2000);
  const reshare = reel("eLCYU", "", "46gSZ", 1000);
  assert.equal(pickPrimaryReel([reshare, original])?.id, "46gSZ");
}

// 4. Owner is a test reel → the oldest non-test re-share is the watch page
//    (prod: "test reels--TRPHYF" vs "krishidukan demo--1PHOUT").
{
  const testOwner = reel("TRPHYF", "test reels", "TRPHYF", 1000);
  const demo = reel("1PHOUT", "krishidukan demo", "TRPHYF", 3000);
  const other = reel("02jR14", "test reels", "TRPHYF", 2000);
  assert.equal(pickPrimaryReel([testOwner, demo, other])?.id, "1PHOUT");
}

// 5. All test → nobody is indexable.
assert.equal(pickPrimaryReel([reel("4Poxm", "test 3", "4Poxm", 1), reel("lQiK", "test-3", "4Poxm", 2)]), null);

// 6. No owner in the set → oldest, then lowest id (stable).
{
  const a = reel("bbb", "Jefha", "gone", 500);
  const b = reel("aaa", "Jefha", "gone", 500);
  const c = reel("ccc", "Jefha", "gone", 100);
  assert.equal(pickPrimaryReel([a, b, c])?.id, "ccc");
  assert.equal(pickPrimaryReel([a, b])?.id, "aaa");
}

// 7. Sitemap set and per-page answer agree; unique videos all stay.
{
  const all = [
    reel("46gSZ", "", "46gSZ", 1),
    reel("eLCYU", "", "46gSZ", 2),
    reel("yEPvM", "", "46gSZ", 3),
    reel("solo1", "Nano urea", "solo1", 4),
    reel("tst01", "test reels", "tst01", 5),
  ];
  const ids = indexableReelIds(all);
  assert.deepEqual([...ids].sort(), ["46gSZ", "solo1"]);
  for (const r of all) assert.equal(isReelIndexable(r, all), ids.has(r.id), r.id);
}

// 8. A reel missing from a truncated list is judged on its own, never
//    noindexed just because the list was short.
assert.ok(isReelIndexable(reel("old01", "Old reel", "old01", 1), []));

console.log("reel-dedupe: all assertions passed");
