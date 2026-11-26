/**
 * Team-added product page content (admin → Product page content): what the
 * save route accepts, and that a stored document can never break a page.
 * Run: npx tsx scripts/tests/page-content.test.ts
 */
import assert from "node:assert/strict";
import {
  LIMITS,
  isAllowedImageUrl,
  pageContentWords,
  readPageContent,
  validatePageContent,
} from "../../app/lib/seo/page-content";

const OUR_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/krishidukan-e8315.firebasestorage.app/o/product-images%2Fpage-content%2Fx%2F1.webp?alt=media";

// 1. A normal save: text trimmed, blank FAQ rows dropped, duplicate photos merged.
{
  const r = validatePageContent({
    description: "  Bayer JUMP contains Fipronil 80% WG.\r\n\r\nUse 40–50 g per hectare in rice.  ",
    faqs: [{ q: "Is it systemic?", a: "Yes, it moves through the plant." }, { q: " ", a: "" }],
    images: [OUR_IMAGE, OUR_IMAGE],
  });
  assert.ok(r.ok && r.content);
  if (r.content) {
    assert.equal(r.content.description, "Bayer JUMP contains Fipronil 80% WG.\n\nUse 40–50 g per hectare in rice.");
    assert.equal(r.content.faqs.length, 1);
    assert.deepEqual(r.content.images, [OUR_IMAGE]);
    assert.ok(pageContentWords(r.content) > 10);
  }
}

// 2. Errors say what to fix.
{
  const half = validatePageContent({ description: "x", faqs: [{ q: "Dose?", a: "" }] });
  assert.ok(!half.ok && /FAQ 1 needs both/.test(half.error));
  const long = validatePageContent({ description: "a".repeat(LIMITS.description + 1) });
  assert.ok(!long.ok && /under 8000/.test(long.error));
  const many = validatePageContent({ faqs: Array.from({ length: LIMITS.faqs + 1 }, (_, i) => ({ q: `Q${i}`, a: "A" })) });
  assert.ok(!many.ok && /at most 12 FAQs/.test(many.error));
  const empty = validatePageContent({ description: "   ", faqs: [], images: [] });
  assert.ok(!empty.ok && /use Remove/.test(empty.error));
}

// 3. Photos only from our own storage: no hot-linking another site's image.
assert.equal(isAllowedImageUrl(OUR_IMAGE), true);
assert.equal(isAllowedImageUrl("https://example.com/jump.jpg"), false);
assert.equal(isAllowedImageUrl("http://firebasestorage.googleapis.com/v0/b/krishidukan-e8315/o/a.jpg"), false);
assert.equal(isAllowedImageUrl("https://firebasestorage.googleapis.com/v0/b/someone-else/o/a.jpg"), false);
assert.equal(isAllowedImageUrl("not a url"), false);
{
  const r = validatePageContent({ description: "Fine text here.", images: ["https://example.com/a.jpg"] });
  assert.ok(!r.ok && /uploaded here/.test(r.error));
}

// 4. Reading a stored doc is defensive: junk is dropped, an empty doc is "no content".
assert.equal(readPageContent(undefined), null);
assert.equal(readPageContent({ description: "", faqs: [], images: [] }), null);
{
  const c = readPageContent({
    description: 42,
    faqs: [{ q: "Q", a: "A" }, { q: "only a question" }, "junk"],
    images: ["https://evil.example/x.png", OUR_IMAGE],
  });
  assert.ok(c);
  assert.equal(c!.description, "42");
  assert.deepEqual(c!.faqs, [{ q: "Q", a: "A" }]);
  assert.deepEqual(c!.images, [OUR_IMAGE]);
}

console.log("page-content: all assertions passed");
