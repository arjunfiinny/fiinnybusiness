# Follow-up: speed and cost on the seller, manufacturer and admin side

Status: audit started 2026-10-06, not finished, nothing fixed yet. The farmer side
(Market, search, product pages, store list) was fixed earlier on branch
`claude/busy-keller-iica2f`. This file lists what is left on the retailer,
manufacturer and admin side. Line numbers are approximate (as of commit e0a52fcf);
re-read the code before changing it.

## Before you start

- Work on top of `claude/busy-keller-iica2f` (it holds the earlier speed and
  privacy work, not deployed yet). Do not deploy. Do not touch production data.
- Read `docs/performance-explained.md` (Part 6, rules for every new feature) and
  `docs/performance-rollout-2026-10.md` first.
- Every new or changed query must pass `firestore.rules` (rules are not filters:
  a list query must filter on what the rule checks). Add any new composite index
  to `firestore.indexes.json`. Test rule-sensitive changes on the Firestore
  emulator with `@firebase/rules-unit-testing`.
- Old app versions stay in people's hands for weeks: keep their queries working.
- Checks before each commit: web typecheck (`npx tsc --noEmit -p .` in
  `KrishiDukaan-V2`, 20 errors already exist), functions typecheck,
  `flutter analyze` (52 issues already exist) and `flutter test` in `mobile/`.
- Update the rollout guide (new indexes, functions, steps) when you add any.

## High priority

1. **"Add product" name search downloads every product.**
   `searchProductsByName` in `app/dashboard/_lib/manufacturer-products-firestore.ts`
   (~line 358) runs `products orderBy name` with no limit (~4,222 documents) on
   every typing pause (350 ms) in `app/dashboard/_components/add-product-inventory-form.tsx`
   (`handleNameChange`, ~line 596). Retailers, manufacturers and admins all use it.
   Fix: search the `marketplaceCards` / search entries the Market search already
   uses, at most 10 results. Keep what the form needs: the chosen product's ID
   (it becomes the new copy's `originalProductId`), the same source ranking
   (manufacturer_inventory first), and the autofill fields (category, description,
   images, variants, unit, price, NPK, dosage, bestForCrops). If a card lacks a
   field, read that one product by ID after the seller picks it, not per keystroke.

2. **Admin WhatsApp inbox listens to every WhatsApp message ever.**
   `app/admin/whatsapp/page.tsx` (~lines 316-350): live `onSnapshot` on the whole
   `waIncomingMessages` and `waConversations` collections (no order, no limit, on
   purpose because some docs lack `receivedAt`), and it logs a full message to
   the browser console. Fix: list the latest ~50 conversations (order by last
   message time, "load more"), load messages only for the open conversation,
   make the writer always set the time field (and backfill old docs with a
   script), and remove the console logging of message content.

## Medium priority (fine today, slow and costly as we grow)

3. **Admin portal downloads whole collections.** `app/admin/_lib/admin-data.ts`
   (memory cache, 10 min) wraps `fetchAllUsers`, `fetchAllSellerProducts` (all
   products), `fetchAllSubscriptions`, `fetchAllPlans`, `fetchAllOrdersForAdmin`
   in `app/firebase.ts`. Used by Users, Team, Companies, Reports, Subscriptions,
   Products, Orders, Sales team and WhatsApp templates pages.
   - Fix: tables load 50 rows at a time with filters and search done by queries;
     totals via `getCountFromServer`; a full download only behind an "Export" button.
   - Admin Overview (`app/admin/page.tsx` ~line 66) loads every product just to
     count them: count `marketplaceCards` instead (already done in
     `app/admin/_lib/analytics-queries.ts` ~line 166).
   - Admin analytics (`app/admin/_lib/analytics-queries.ts`): "All time" GMV and
     order metrics read every order; subscription revenue, payment funnel and a
     users chart read whole collections. Fix: `sum()`/`count()` aggregations (add
     the createdAt + grandTotal index the code comment mentions) or a daily
     totals document kept by a Cloud Function.
   - Other full scans: payments (`paymentAttempts`), payouts (`payoutAccounts`),
     sales team (`dealerVisits`, `dealers`), moderation (`contentReports`),
     WhatsApp template flows (`uidIndex`, `retailerSeatListings`, `payoutAccounts`),
     `fetchFailedPayments`, `fetchContactMessages`. Fix: newest first, a limit,
     "load more", and status filters.

4. **Manufacturer network map reads each retailer one by one.**
   `fetchManufacturerNetworkStores` in `app/firebase.ts` (~line 3572): one
   `retailers/{id}` read per retailer (200 retailers = 200 reads). Used by
   `app/dashboard/company/page.tsx` and `app/admin/companies/page.tsx`. Fix: take
   address and location from the store directory (1-2 documents, already built;
   see `STORE_DIRECTORY` in `app/firebase.ts`), fall back to the mirror doc.
   Also `fetchRetailerAssignedProducts` in
   `app/dashboard/_lib/manufacturer-retailers-firestore.ts` (~line 800): one
   product read per listing; batch with `documentId() in` (30 per query, in parallel).

5. **Seller dashboard home and analytics read the seller's whole history.**
   `fetchRetailerAnalytics` in `app/dashboard/_lib/analytics-firestore.ts` reads
   every order the seller ever had (several overlapping queries over
   sellerPhone/sellerId and uid/phone forms), all followers and reels, and loads
   the seller's products again although `app/dashboard/page.tsx` already did.
   Fix: a per-seller daily stats document kept by a Cloud Function on order
   writes (like `productStats`), reuse the products already loaded, and limit
   charts to a date window.

6. **Order and enquiry lists have no limit.**
   - Web: `fetchRetailerOrders` in `app/firebase.ts` (~line 1293) loads all orders
     and sorts in the browser.
   - App: `watchSellerOrders` in `mobile/lib/features/dashboard/data/dashboard_repository.dart`
     (~line 1150) and in `mobile/lib/features/orders/data/order_repository.dart`
     (~lines 255-340): 3 overlapping live listeners each, no limit; the buyer's
     order list too.
   - App enquiries: `mobile/lib/features/enquiries/data/enquiry_repository.dart`
     (~line 24), live, no limit.
   - Fix: newest first, 30 at a time, "load more"; live listener only on the
     first page. Fewer overlapping queries if orders store one consistent seller key.

## Low priority

7. Sequential chunk loops: `fetchProductNames` in
   `app/dashboard/_lib/inventory-firestore.ts` (~line 348, chunks of 10 awaited
   one by one) and `app/dashboard/subscription/page.tsx` (~line 635). Run the
   chunks in parallel, 30 per query.
8. App `watchMyListings` (`dashboard_repository.dart` ~line 178): 5 overlapping
   live listeners over the seller's own products, so the same docs are read 2-3 times.

## Not audited yet

Finish a quick pass over: the web seller enquiries, orders, delivery, payouts and
reviews pages; the app's manufacturer screens beyond the listeners above.
`sales_app` looked fine (queries filtered by the sales executive; the active
dealers list is small).

## Suggested order

Items 1 and 2 first (biggest waste today), then 4 and 3, then 5 and 6, then 7 and 8.
Commit each item separately, with what you measured before and after.
