# KrishiDukaan Sales

A standalone Flutter app for the field sales team — separate from the customer
app in `../mobile`, with its own package name, launcher icon and Play listing,
so a rep installs only the tool they need.

It reads and writes **the same Firestore data as `krishidukan.com/sales`**. The
web route and this app are two clients of one dataset: a day started on the web
can be ended in the app, and a visit logged in the app appears in the web
timeline. Nothing here is a private copy.

Route points are best effort: Android uses a location foreground service and
iOS uses background location updates while an open day is being tracked. A
force-quit, revoked location permission, disabled GPS, or an OS suspension can
leave gaps. The resulting road distance follows the recorded points, but does
not reconstruct unobserved travel between them. The browser does not record
periodic points; its end-day calculation currently uses only start, visits and
end. The web team must include `daySessions.trackPoints` if it needs the same
distance when a mobile-started day is closed in the browser.

---

## What it does

| Module | What a rep does | Storage |
|---|---|---|
| **Day session** | Start Day / End Day with GPS stamps. During an open day, the app records route points at roughly 15-minute intervals when the OS supplies a fresh fix. Ending the day routes through those points and visits in time order; if road routing fails, distance is left unset. | `daySessions` |
| **Dealer visits** | Browse dealers created by the signed-in rep, choose a preset or custom status when adding a dealer, and update that status during a GPS-stamped visit. Every status change has a history event. | `dealers`, `dealerVisits`, `dealerStatusHistory`, `dealerStatusOptions` |
| **Daily sessions** | History of every working day, each with a route map and a visit timeline. | `daySessions` + `dealerVisits` |
| **Attendance** | Present / half day / leave / week off / holiday per day. Start Day marks present automatically; the screen is for corrections. | `salesAttendance` |
| **Expenses** | Claim travel, fuel, food, lodging, toll and mobile costs with a bill photo, and track approval. | `salesExpenses` + Storage |
| **Reports** | Visits, dealers covered, days worked, hours, distance and spend for this week / this month / last 30 days. | derived on-device |

Sign-in is **email + password**, the same accounts the admin panel creates and
the same ones that work on `krishidukan.com/sales`. Access is gated on the
`salesExecutive` or `admin` role, resolved from `users/{uid}` or, for
phone-based accounts, `uidIndex/{uid}` → `users/{phone}` — mirroring
`isSalesExec()` in `firestore.rules`.

## Dealer status contract for the web team

The mobile app writes a dealer's current status as `dealers/{dealerId}.status`.
Preset values are `Pitching`, `Interested`, `Ongoing`, `Pending`, `Completed`,
`Closed`, and `Not Interested`. Custom values are plain display strings of at
most 50 characters. Existing dealers may have no status. A visit stores its
status snapshot in `dealerVisits/{visitId}.dealerStatus`.

Each status change creates an immutable `dealerStatusHistory/{changeId}` document
with `dealerId`, `salesExecutiveId` (the dealer's `createdBy` UID),
`fromStatus` (nullable), `toStatus`, `source` (`CREATED`, `EDIT`, `VISIT`, or
`ADMIN_EDIT`), `changedBy` (actor UID), `changedAt` (server timestamp), and
optional `visitId`. The app writes the dealer, visit and history together in a
batch or transaction. Admin status edits should write `source: ADMIN_EDIT` and
the history event in the same batch. Reusable custom choices live in
`dealerStatusOptions/{execUid}.statuses` as a string array.

The app listens to dealer, note, custom status and status-history documents, so
admin edits and removals appear in open dealer screens. Use `active: false` to
hide a dealer while retaining its visit and status history. The web Sales Team
CRUD, status filters, and CSV/Excel exports are separate web work.

Before the owner-scoped `firestore.rules` in this change are deployed, the web
sales portal must query active dealers with `createdBy == signed-in UID` and
dealer notes with `salesExecutiveId == signed-in UID`. Its current unscoped
queries will otherwise be denied. Updated mobile builds must also reach users
before those rules are enabled.

## Layout

```
lib/
  core/          constants, theme, router, Firebase options, shared widgets
    services/    location (GPS), directions (route distance via /api/directions)
    utils/       ist_date.dart — every date key in this app is an IST day
  features/
    auth/        login, role gate, access-denied
    dashboard/   Start/End Day, today at a glance, module list
    day_session/ session history, detail, route map, visit timeline
    dealers/     rep-owned dealers, visit logging
    attendance/  daily marking + record
    expenses/    claims, bill upload
    reports/     derived summary
    profile/     account, support, sign out
```

## Running it

```bash
cd sales_app
flutter pub get
flutter run                                   # production Firebase project
flutter run --dart-define=APP_FLAVOR=uat      # karan-arjun-uat instead
```

A JDK 17+ must be on `PATH` (`JAVA_HOME` set) for any Android build.

### Previewing in a browser

Android and iOS are the real targets, but the app also builds for web, which is
the quickest way to look at a screen without a device or emulator:

```bash
flutter run -d chrome
flutter run -d web-server --web-port 8383     # then open http://localhost:8383
```

Two caveats on web: geolocation only works over `localhost` or HTTPS (browsers
block it on plain HTTP origins), and the camera option in the expense form
falls back to a file picker.

**`firebase_core` is pinned to `4.11.0`, not caret-ranged.** From 4.12 it pulls
`firebase_core_web` 3.11.0, which calls `e.isA<JSObject>()` on a catch-clause
`Object` and fails to compile for web on the current Dart SDK:

```
Error: The method 'isA' isn't defined for the type 'Object'.
```

Do not widen that constraint without checking `flutter build web` still passes.

## Building for release

Release signing reads `android/key.properties`, exactly like `../mobile`:

```bash
cp android/key.properties.example android/key.properties
# fill in keyAlias / keyPassword / storeFile / storePassword
flutter build appbundle --release
```

Without `key.properties` the release build falls back to the debug keystore, so
it runs on a device but **cannot be uploaded to Play**. Use the same keystore
you use for the customer app if you want one signing identity across both.

Output: `build/app/outputs/bundle/release/app-release.aab`

## Publishing to Play

**This is a separate Play Console app, not a KrishiDukaan release.** Play keys a
listing to its `applicationId`, and this app is
`com.karanarjuntechnologies.KrishiDukanSales` while the customer app is
`com.karanarjuntechnologies.KrishiDukan`. Uploading this bundle to the customer
listing is rejected ("package name doesn't match") — two package names is always
two listings. Version codes are independent too: this app starts at `1.0.0+1`
regardless of where the customer app is.

Use the **Internal testing** track, not Production. Up to 100 testers invited by
email, no full store review, and it stays unlisted — which matters for a
login-gated internal tool, since a public listing means strangers install it,
cannot sign in, and leave one-star reviews. Testers still get auto-updates.

Store listing copy, the exact Data safety answers and reviewer notes are in
[`PLAY_LISTING.md`](PLAY_LISTING.md) — copy-paste ready.

What the console will ask for:

- **Data safety** — declare precise **location** (every visit, day start/end and
  attendance check-in is GPS-stamped), **photos** (expense bills) and **email
  address**, all linked to a user identity. These answers must match the privacy
  policy you link.
- **Privacy policy URL** — `krishidukan.com/privacy`. Check it actually covers
  field-staff location tracking; the customer-facing text may not.
- Content rating questionnaire and target audience.

Two things that are deliberately *not* needed:

- **No SHA-1 fingerprint in Firebase.** Sign-in is email/password only — no
  Google Sign-In, phone auth or Dynamic Links, which are the only features that
  need it. This avoids the usual "works in debug, breaks once Play App Signing
  re-signs the bundle" trap.
- **No background-location declaration.** Only foreground
  `ACCESS_FINE_LOCATION` is requested; background location triggers a separate
  and much slower Play review.

The upload keystore may be shared with the customer app — an upload key only
authenticates uploads, and Play App Signing mints a distinct app signing key per
app regardless.

## Firebase

Registered in the **production** project `krishidukan-e8315` as its own client:

| | |
|---|---|
| Android package | `com.karanarjuntechnologies.KrishiDukanSales` |
| Android app id | `1:650303885415:android:9aa71a8b016690ee2b84c2` |
| iOS bundle id | `com.karanarjuntechnologies.KrishiDukanSales` |
| iOS app id | `1:650303885415:ios:cd78322502709a9d2b84c2` |

`android/app/google-services.json` and `ios/Runner/GoogleService-Info.plist`
are checked in, matching how `../mobile` handles them.

UAT builds (`--dart-define=APP_FLAVOR=uat`) reuse the customer app's UAT client
ids — no separate sales app is registered in `karan-arjun-uat` yet. Auth and
Firestore only care which *project* a client belongs to, so UAT builds still
talk to UAT data. Register a dedicated UAT app if you ever need per-app UAT
analytics or push.

### Rules and indexes this app needs

Two collections are new. Their rules live in `../firestore.rules` and their
composite indexes in `../firestore.indexes.json`; expense bill photos are
covered by `../storage.rules`. **Deployed to production on 2026-09-01**:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project krishidukan-e8315
```

If that deploy ever prompts *"the following indexes are defined in your project
but are not present in your firestore indexes file — delete?"*, answer **No**.
The database holds collections from other apps whose indexes are not tracked in
this file, and deleting them would break their live queries.

### Data notes

- **Every date key is an IST calendar day** (`daySessions.date`,
  `salesAttendance.date`, `salesExpenses.date`). A UTC day would roll over at
  05:30 local and split one working day across two keys. See
  `core/utils/ist_date.dart`; it matches `getTodayIST()` on the web.
- **`salesAttendance` document ids are `{uid}_{date}`**, so a day can only be
  marked once. Ownership is still enforced by the `salesExecutiveId` check in
  the rules — the id prefix is not treated as a permission.
- **Expense amounts are plain rupees**, not paise. Only Razorpay works in paise
  and no payment touches this collection.
- **`dealers.type`** (`retailer` / `distributor` / `manufacturer`) is a new
  optional field added by this app. Records created on the web have no `type`
  and are shown as Retailer; web edits write a fixed field list, so they leave
  an existing value untouched.
- **Bill photos are uploaded as bytes** (`BillImage` + `putData`), not via a
  `dart:io` File. `dart:io` does not exist on web, so a File-typed bill would
  make the app impossible to compile for the browser.
- **Route distance** goes through `POST /api/directions` on the web app rather
  than calling the Google Routes API from the device, so the billing key stays
  server-side. Override the host with `--dart-define=API_BASE_URL=...`.

## Tests

```bash
flutter test
```

Covers the IST date arithmetic and report range presets — the logic where an
off-by-one silently files a rep's work against the wrong day.
