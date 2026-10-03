# Performance and cost rollout — October 2026

Branch: `claude/busy-keller-iica2f` (vinayfiinny/fiinnybusiness). Nothing here is
deployed yet. Follow the order below: the website and app read new collections
that must exist first.

## What changed and why

Firestore showed 68M reads against 898k writes in the period checked: reads are
~99% of the work, and most came from screens downloading whole collections.

| # | Change | Before | After |
|---|---|---|---|
| 1 | Website server moved to `asia-south1` (`firebase.json`) | SSR ran in Iowa; every Firestore call crossed to Mumbai and back | Same region as the database |
| 2 | View/click/call counters moved to `productStats/{id}` and `storeStats/{phone}` | Every product card a farmer saw wrote to the product doc and ran `syncSellerProductToCanonical` + `notifyLowStock` (~1,540 runs of each per day). Signed-out visitors got a denied write per product | Counter docs with lookup-free rules; no product functions fire; signed-out visitors skipped |
| 3 | Sitemap reads `marketplaceCards` and regenerates every 6 h | All 4,222 product docs per regeneration (top query by load) | One read per card |
| 4 | `marketplaceCards` built by Cloud Functions | Market API read up to 480 raw docs per page (13 s warm, 33 s cold); search kept the whole catalogue in memory; product, cart and map pages and the app downloaded every product and every review | One pre-merged card per product name; a page reads ~20 cards; search reads matching token docs |
| 5 | App reads cards, cached 5 min | Every search pause, category change and deep-linked product read the whole catalogue and every review | All cards once per 5 min; typing costs no reads; opening a product is 1 read |
| 6 | `storeDirectory` built by Cloud Functions | Cart, store map, SEO store pages and the app's store list read all of `retailers`, `profiles`, `manufacturers`, `stores` and `storeReviews` (the `COLLECTION /retailers` query) | 1–2 docs |
| 7 | Comment tagging, add-retailer form, admin reel picker | Downloaded every user (with personal details) and every retailer | Shops from the store directory; people by a name search of at most 10 docs |
| 8 | Firebase Performance Monitoring (web + app) | No real-user timings | Page loads, app start, and traces `load_marketplace_cards`, `load_store_directory` |

Cards are built with the exact merge code the website used, so a card matches
what the old storefront showed (checked over 1,082 generated products). The store
directory stores source records, not a merged result, so the web, SEO and app
merges run unchanged on it.

## Deploy order

Do this on **UAT first** (see "Testing on UAT" below), then production. All
commands run from `KrishiDukaan-V2/`.

### 0. Check which service serves krishidukan.com

`ENVIRONMENTS.md` says the website deploys through **App Hosting** on every push
to `main`, but production traffic in the Functions list goes to the **Firebase
Hosting** server `ssrkrishidukane8315`. In the Firebase console, see whether the
`krishidukan.com` custom domain is under **Hosting** or under **App Hosting**:

- **Hosting:** the website deploys with `firebase deploy --only hosting` (step 4),
  and the region change in `firebase.json` applies.
- **App Hosting:** merging this branch into `main` deploys the website. Do not
  merge until steps 1–3 are done. The region change in `firebase.json` would not
  apply; an App Hosting backend's region is chosen when the backend is created.

### 1. Security rules and indexes

Users see no change from steps 1–3: the rules only add access to the new
collections (every existing rule is unchanged), and nothing reads the new
collections until the new website and app ship in steps 4–5.

```
firebase deploy --only firestore --project prod     # rules + indexes
```

(`npm run deploy:prod` does the same plus Storage and functions, but
`firebase.json` points Storage at `storage.rules`, which is not in the repo, so
the script stops at Storage before deploying functions. Commit the live rules
from Firebase console → Storage → Rules as `storage.rules` to use the script.)

- If the CLI asks whether to **delete** indexes that are not in the file,
  answer **No**: production may have indexes created from console links.
- Rules replace the whole ruleset. If anyone edited rules directly in the
  console after 30 Sep, compare with `firestore.rules` first.

Then open Firebase console → Firestore → Indexes and wait until **every** index
shows **Enabled** (minutes): the three new `marketplaceCards` /
`marketplaceSearch` ones, and the `waNotifications` index (`status`,
`createdAt` ↓, `retryCount`) from Sai's 30 Sep change, which the WhatsApp retry
job in step 2 needs. Deploying functions before it is ready makes that job fail
every 5 minutes until it is (notifications are delayed, not lost).

Note: `firestore.indexes.json` already had an entry under `fieldOverrides` that
is really a composite index (`dealerNotes`: `dealerId`, `createdAt`). It was there
before this work; if the deploy complains about it, move it into `indexes`.

### 2. Cloud Functions

```
firebase deploy --only functions --project prod
```

If the CLI lists functions "not in your local source" and asks to delete them,
answer **No**. The branch contains all of the team's `main` (checked against
Arjun's, Sai's and Kunal's repos), so existing functions deploy unchanged
apart from `sendStoreAnalyticsDigest`, which also counts the new stats records.

New functions (all `asia-south1`):
`syncMarketplaceCardOnProductWrite`, `syncMarketplaceCardOnReviewWrite`,
`recomputeDueMarketplaceCards` (every 15 min), `reconcileMarketplaceCards`
(nightly 02:30 IST), `markStoreDirectoryDirtyOn{Retailer,Manufacturer,Profile,Store,StoreReview}`,
`rebuildStoreDirectoryIfDirty` (every 5 min). They only write the new
collections. Until the new website and app ship, the current ones still save
view counts on products; the card function exits on those writes without
reading anything.

### 3. Build the cards and the store directory once

```
gcloud auth application-default login
cd functions
npx tsx scripts/backfill-marketplace-cards.ts --project krishidukan-e8315           # preview
npx tsx scripts/backfill-marketplace-cards.ts --project krishidukan-e8315 --write
npx tsx scripts/build-store-directory.ts --project krishidukan-e8315                # preview
npx tsx scripts/build-store-directory.ts --project krishidukan-e8315 --write
```

Before step 1, write down the product count on Admin → Overview (computed the
old way). Now check in the console: `marketplaceCards` has about that many docs
(one per product name), and `storeDirectory` has `chunk-000` (and maybe
`chunk-001`). `failures` in the first report must be 0.

### 4. Website

If krishidukan.com is on **Hosting** (step 0):

```
firebase deploy --only hosting --project prod
```

This creates the SSR function in `asia-south1`; the old `us-central1` one stays
until deleted in step 7, which is what makes a rollback instant.

If it is on **App Hosting**: merge this branch into the `main` branch App
Hosting watches; that push deploys the website.

Check on the live site: home top picks; Market browse, scroll and a category;
search for `urea`, `uria`, `यूरिया`, `neem oil`, a shop name; a product page;
add to cart and the store picker; the store map; a `/stores/...` page; a seller's
dashboard analytics; Admin Overview; typing `@` in a reel comment; the
manufacturer add-retailer form; `/sitemap.xml`.

### 5. App release

Build and test the app on a real phone (Marketplace, search, a product, the
Stores tab, a seller's Profile overview and Analytics, tagging in comments), then
publish. Older app versions keep working: they still read the raw collections and
write counters onto products, which the rules still allow.

### 5b. Cache header for photos already in Storage (once)

New uploads now get `Cache-Control: public, max-age=31536000, immutable`, so
browsers and the app stop re-checking each photo on every view. Photos uploaded
before this change need the same header once. It only changes metadata (the
files and their links stay the same), and is safe to re-run:

```
gcloud storage objects update "gs://krishidukan-e8315.firebasestorage.app/product-images/**" --cache-control="public, max-age=31536000, immutable"
gcloud storage objects update "gs://krishidukan-e8315.firebasestorage.app/profile-images/**" --cache-control="public, max-age=31536000, immutable"
gcloud storage objects update "gs://krishidukan-e8315.firebasestorage.app/hub-images/**" --cache-control="public, max-age=31536000, immutable"
gcloud storage objects update "gs://krishidukan-e8315.firebasestorage.app/blog-images/**" --cache-control="public, max-age=31536000, immutable"
gcloud storage objects update "gs://krishidukan-e8315.firebasestorage.app/blog-covers/**" --cache-control="public, max-age=31536000, immutable"
```

Leave `kyc/**` and invoices alone: those are private documents. While in the
console, note the bucket's location (Storage → Files): if it is not
`asia-south1`, every uncached photo travels further to farmers in India.

### 6. Watch for a week

- Firestore → Usage: daily reads should fall sharply.
- Functions: `syncSellerProductToCanonical` and `notifyLowStock` should drop from
  ~1,540/day toward real product edits (old app versions still add some until
  users update). Check the new functions for errors.
- Performance: web page load and the two app traces.

### 7. Clean up after a few quiet days

```
firebase functions:delete ssrkrishidukane8315 --region us-central1 --project prod
firebase functions:delete ssrkrishidukanadmin --region us-central1 --project prod
```

## Testing on UAT

Needs your usual `.env.uat` file and access to `karan-arjun-uat`.

```
npm run copy:prod-to-uat     # optional: real catalogue and stores in UAT
npm run deploy:uat           # rules, indexes, storage and functions to UAT (see the storage.rules note in step 1)
cd functions
npx tsx scripts/backfill-marketplace-cards.ts --project karan-arjun-uat --write
npx tsx scripts/build-store-directory.ts --project karan-arjun-uat --write
cd ..
npm run dev:uat              # this website, on your computer, against UAT
```

Open http://localhost:3000 and run the step 4 checklist. For the app, run it on
a phone with the UAT flavor from `ENVIRONMENTS.md`
(`flutter run --flavor uat --dart-define=...`) and run the step 5 checklist.

## Rollback

- Website: Firebase console → Hosting → previous release → Rollback. The old
  website reads the raw collections, which this work never changes, so it works
  as before.
- Functions: the new ones only add `marketplaceCards`, `marketplaceSearch`,
  `cardMembers`, `storeDirectory`, `storeDirectoryState`, `productStats` and
  `storeStats`. They can be deleted without affecting the old website or app.

## Not done in this round (follow-ups)

- **`users` read rule** (`firestore.rules`, `myRole() in ['retailer','manufacturer']`)
  still lets any seller read any user's document. This work removed the screens
  that downloaded every user, but the sales dealers page (`fetchDealers`), people
  search in tags, and admin lists still rely on it. Tighten it after moving people
  search to a server endpoint and testing the sales flow.
- **Auth custom claims** for `myPhone()` / `myRole()` / `isAdmin()`: each costs
  `get()` reads per request. Putting phone and role in token claims removes them,
  but it rewrites 100+ rule checks and a role change only reaches the token on
  refresh (up to an hour), so it needs its own careful change.
- **Manufacturer's own discount** is not reflected in a card's lowest final price
  when retailer copies exist, because the merge builds that price from seller
  entries and the manufacturer's entry carries no discount. This was already how
  the live storefront behaved; cards keep it. Worth fixing in `functions/src/marketplace/merge.ts`.
- **Page views** (`trackPageView`) write one shared `siteVisits/{day}` doc per
  home load. Cheap, but a hot document; Google Analytics already counts these.
- **After most users update the app**, remove the analytics-counter exemption
  from the `products` update rule so no counter write can reach product docs.
- Android: add the Firebase Performance Gradle plugin if automatic network
  traces are wanted.
- `firebase.uat.json` still sets the UAT website server to `us-central1`; set it
  to the UAT database's region.

## Tests run

All in a cloud dev environment against the Firestore emulator (no access to
production):

- Card output equals the old storefront merge for 1,082 cards (3 randomized runs).
- Card triggers: build, ratings, rename, delete, review changes, counter-only
  writes ignored, 40 concurrent copies, discount window job, backfill dry run and
  re-run, nightly reconcile repairing damage (22 checks).
- Market API on `next dev`: paging, categories, search incl. Hindi, misspellings,
  substrings, shop names, suggestions (20 checks).
- Store directory: build, field selection, ratings, change detection, chunking
  (17 checks); every field the web, SEO and app store merges read is present.
- Counter rules (12 checks).
- App: `flutter analyze` (no new issues), `flutter test` (135 passing, 7 new).
- Web and functions typecheck: no new errors. `next build` compiles every page
  and route; its later page-data step needs the production Razorpay keys, which
  the test environment doesn't have, so run the full build where they are set.
- Not tested here: the storefront and app UI against real data (no access to
  production). That is what the UAT pass in "Deploy order" is for.
