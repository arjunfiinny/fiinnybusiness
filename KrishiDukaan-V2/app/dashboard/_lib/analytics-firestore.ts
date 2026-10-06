import {
  collection,
  doc,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  sum,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { getDocsByIds } from "../../lib/firestore-by-ids";

export type SearchAppearanceStats = {
  impressions: string;
  ctr: string;
  avgPosition: string;
};

export type SeriesPoint = { label: string; value: number };

export type OrderAnalytics = {
  totalOrders: number;
  totalRevenue: number;
  revenueOverTime: SeriesPoint[];
  ordersOverTime: SeriesPoint[];
  statusCounts: Record<string, number>;
  topProducts: { name: string; quantity: number; revenue: number }[];
};

export type RetailerAnalytics = {
  totalImpressions: number;
  totalClicks: number;
  productCount: number;
  searchAppearance: SearchAppearanceStats;
  viewsOverTime: SeriesPoint[];
  callsOverTime: SeriesPoint[];
  directionRequests: SeriesPoint[];
  orders: OrderAnalytics;
  /** Lifetime follower count — see the note where it's fetched. */
  followers: number;
  /** Reel reach/engagement across the seller's own reels. */
  reelViews: number;
  reelLikes: number;
  reelComments: number;
  /** False when every query came back empty — drives the honest empty state. */
  hasAnyData: boolean;
};

type DaySeries = { key: string; label: string };

function getLocalDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Selectable window, mirroring AnalyticsPeriod in the app
 * (mobile/lib/features/dashboard/data/store_analytics.dart) — same keys,
 * labels and day counts, so both platforms report the same number for the
 * same choice, and an analytics_digest notification's `period` maps directly.
 */
export const ANALYTICS_PERIODS = [
  { key: "week", label: "Week", days: 7 },
  { key: "month", label: "Month", days: 30 },
  { key: "year", label: "Year", days: 365 },
] as const;

export type AnalyticsPeriodKey = (typeof ANALYTICS_PERIODS)[number]["key"];

export function periodDays(key: AnalyticsPeriodKey): number {
  return ANALYTICS_PERIODS.find((p) => p.key === key)?.days ?? 7;
}

/** An explicit start/end window for the Custom Date Range filter, alongside
 * the Week/Month/Year presets above — mirrors AnalyticsRange in the app
 * (mobile/lib/features/dashboard/data/store_analytics.dart). Both bounds are
 * inclusive calendar days. */
export type CustomDateRange = { start: Date; end: Date };

/**
 * The day buckets for a window, oldest first.
 *
 * Chart labels adapt to the range: a weekday name reads well across 7 points
 * but is meaningless repeated 52 times, so longer ranges switch to a date and
 * a year is bucketed by MONTH rather than by day (365 bars are unreadable and
 * would mean 365 map lookups per product).
 */
function getDaySeries(days: number): DaySeries[] {
  const today = new Date();
  const out: DaySeries[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push({
      key: getLocalDayKey(d),
      label:
        days <= 7
          ? d.toLocaleDateString("en-US", { weekday: "short" })
          : d.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
    });
  }
  return out;
}

/** Same day-bucket shape as getDaySeries, but for an explicit start/end
 * range instead of "the last N days ending today" — backs the Custom Date
 * Range filter. */
function getDaySeriesForRange(start: Date, end: Date): DaySeries[] {
  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const to = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const totalDays =
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const out: DaySeries[] = [];
  for (let i = 0; i < totalDays; i += 1) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    out.push({
      key: getLocalDayKey(d),
      label:
        totalDays <= 7
          ? d.toLocaleDateString("en-US", { weekday: "short" })
          : d.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
    });
  }
  return out;
}

/**
 * Collapses a day series into at most [maxPoints] buckets for charting, summing
 * the values that fall in each bucket. The underlying totals are unaffected —
 * this only controls how many bars a chart draws.
 */
function bucketSeries(
  points: { label: string; value: number }[],
  maxPoints = 14,
): { label: string; value: number }[] {
  if (points.length <= maxPoints) return points;
  const size = Math.ceil(points.length / maxPoints);
  const out: { label: string; value: number }[] = [];
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    out.push({
      // Label the bucket by its first day — the range is implied by the picker.
      label: chunk[0].label,
      value: chunk.reduce((sum, p) => sum + p.value, 0),
    });
  }
  return out;
}

/** Same as normalizeSellerKey in functions/src/stats/seller-stats.ts. */
function sellerKeyOf(value: unknown): string {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (/^\+?\d{10,12}$/.test(raw.replace(/[\s-]/g, "")) && digits.length >= 10) return `+91${digits.slice(-10)}`;
  return raw;
}

type SellerTotals = {
  orders?: { count?: number; revenue?: number; paid?: number; paidAmount?: number; status?: Record<string, number> };
  items?: Record<string, { name?: string; qty?: number; revenue?: number }>;
};

/**
 * The seller's order totals (all time) and per-day orders/revenue for the
 * window, from sellerStats/{key} and sellerDailyStats (kept by the
 * sellerStatsOnOrderWrite Cloud Function) for each key the seller's orders
 * may be filed under. Each order is filed under exactly one key, so the
 * keys' totals add up without double counting.
 */
async function readSellerOrderStats(keys: string[], fromKey: string, toKey: string) {
  const reads = await Promise.allSettled(keys.map(async (key) => {
    const [totals, daySnap] = await Promise.all([
      getDoc(doc(db, "sellerStats", key)),
      toKey
        ? getDocs(query(
          collection(db, "sellerDailyStats"),
          where("sellerKey", "==", key),
          where("date", ">=", fromKey),
          where("date", "<=", toKey),
        ))
        : Promise.resolve(null),
    ]);
    return { totals: (totals.exists() ? totals.data() : {}) as SellerTotals, days: daySnap?.docs.map((d) => d.data()) ?? [] };
  }));
  const ok = reads.filter((r): r is PromiseFulfilledResult<{ totals: SellerTotals; days: Record<string, any>[] }> => r.status === "fulfilled");
  return {
    results: ok.map((r) => r.value),
    errors: reads.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => r.reason),
  };
}

/** The keys a seller's orders may be filed under in sellerStats. */
function sellerKeysFor(uid: string | null, profile?: any): string[] {
  return Array.from(new Set(
    [uid, profile?.uid, profile?.id, profile?.phone].filter(Boolean).map(sellerKeyOf).filter(Boolean),
  ));
}

export type SellerOrderTotals = { count: number; paid: number; paidAmount: number; status: Record<string, number> };

/** All-time order totals for the seller's Orders page tabs and tiles (2-3 doc reads). */
export async function fetchSellerOrderTotals(uid: string | null, profile?: any): Promise<SellerOrderTotals> {
  const out: SellerOrderTotals = { count: 0, paid: 0, paidAmount: 0, status: {} };
  const { results } = await readSellerOrderStats(sellerKeysFor(uid, profile), "", "");
  for (const { totals } of results) {
    out.count += Number(totals.orders?.count ?? 0) || 0;
    out.paid += Number(totals.orders?.paid ?? 0) || 0;
    out.paidAmount += Number(totals.orders?.paidAmount ?? 0) || 0;
    for (const [k, n] of Object.entries(totals.orders?.status ?? {})) out.status[k] = (out.status[k] ?? 0) + (Number(n) || 0);
  }
  return out;
}

/** Products the dashboard already loaded, so analytics doesn't read them again. */
export type LoadedProduct = { id: string } & Record<string, unknown>;

/**
 * Seller analytics, aggregated from the two collections that actually hold
 * data for a seller:
 *
 * - `products` — matched via the same dual-schema owner fields the (working)
 *   inventory reads use: ownerId/retailerId hold auth UIDs, ownerPhone/
 *   retailerPhone/retailerDocId hold phone keys. The old version queried
 *   sellerId/sellerPhone/shopOwnerId, which exist on no product doc, so it
 *   found nothing. Engagement counters (impressions/clicks/…ByDay) live on
 *   these docs, written by the track* helpers in app/firebase.ts.
 * - `orders` — sellerId and sellerPhone both store the seller's phone
 *   (order_repository.dart writes sellerId as phone for legacy compat).
 *
 * The phantom `store_analytics` collection (never written, no security rule,
 * every read permission-denied) has been removed.
 */
export async function fetchRetailerAnalytics(
  retailerId: string | null,
  profile?: any,
  period: AnalyticsPeriodKey = "week",
  customRange?: CustomDateRange,
  /** The seller's products if the caller already has them (dashboard Home). */
  loadedProducts?: LoadedProduct[],
): Promise<RetailerAnalytics> {
  const days = customRange
    ? getDaySeriesForRange(customRange.start, customRange.end)
    : getDaySeries(periodDays(period));
  const dayKeys = new Set(days.map((d) => d.key));

  // ── Candidate identifiers ────────────────────────────────────────────────
  const phoneCandidates = new Set<string>();
  const rawPhone = String(profile?.phone ?? "").trim();
  if (rawPhone) {
    phoneCandidates.add(rawPhone);
    const stripped = rawPhone.replace("+91", "").trim();
    if (stripped) phoneCandidates.add(stripped);
    if (!rawPhone.startsWith("+")) phoneCandidates.add(`+91${rawPhone}`);
  }
  const errors: unknown[] = [];

  // ── Followers + reel engagement ──────────────────────────────────────────
  // Mirrors StoreAnalyticsRepository on mobile so both platforms report the
  // same figures from the same sources. Followers is a LIFETIME total, not a
  // per-period count: `follows` docs carry createdAt, but ranging over it
  // needs a composite index neither platform ships, and the running total is
  // the more useful number on screen — so it does not change with the period
  // picker, by design.
  let followers = 0;
  let reelViews = 0;
  let reelLikes = 0;
  let reelComments = 0;

  {
    // Reels and follows are keyed by the seller's PHONE (shopOwnerId /
    // followedShopId), never a uid — querying with a uid just returns empty.
    // A follow or reel carries one phone value, so the phone forms' results
    // never overlap: counts and sums add up. Count and sum queries instead of
    // reading every follower and reel.
    const phoneKeys = Array.from(phoneCandidates);
    const settled = await Promise.allSettled(phoneKeys.flatMap((phone) => {
      const reels = query(collection(db, "reels"), where("shopOwnerId", "==", phone));
      return [
        getCountFromServer(query(collection(db, "follows"), where("followedShopId", "==", phone)))
          .then((c) => { followers += c.data().count; }),
        getAggregateFromServer(reels, { v: sum("viewsCount") }).then((a) => { reelViews += Number(a.data().v ?? 0) || 0; }),
        getAggregateFromServer(reels, { v: sum("likesCount") }).then((a) => { reelLikes += Number(a.data().v ?? 0) || 0; }),
        getAggregateFromServer(reels, { v: sum("commentsCount") }).then((a) => { reelComments += Number(a.data().v ?? 0) || 0; }),
      ];
    }));
    for (const r of settled) if (r.status === "rejected") errors.push(r.reason);
  }

  // ── Products: engagement counters ────────────────────────────────────────
  const viewsByDay: Record<string, number> = {};
  const callsByDay: Record<string, number> = {};
  const directionsByDay: Record<string, number> = {};
  days.forEach((d) => {
    viewsByDay[d.key] = 0;
    callsByDay[d.key] = 0;
    directionsByDay[d.key] = 0;
  });

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalPositionSum = 0;

  // The seller's products: the ones the caller loaded, else the same owner
  // fields the dashboard's product lists read (fetchRetailerProducts /
  // fetchManufacturerProducts), queried here directly so an admin or team
  // member viewing the dashboard doesn't need the seller's uidIndex entry.
  let productsFailed = false;
  let products: LoadedProduct[] = loadedProducts ?? [];
  if (!loadedProducts) {
    const productsCol = collection(db, "products");
    const isManufacturer = profile?.role === "manufacturer";
    const phones = Array.from(phoneCandidates);
    const queries = [
      ...(retailerId && isManufacturer
        ? [
          query(productsCol, where("ownerId", "==", retailerId), where("ownerType", "==", "manufacturer")),
          query(productsCol, where("manufacturerId", "==", retailerId), where("ownerType", "==", "manufacturer")),
        ]
        : []),
      ...(retailerId && !isManufacturer
        ? [
          query(productsCol, where("retailerId", "==", retailerId)),
          query(productsCol, where("ownerId", "==", retailerId)),
        ]
        : []),
      ...(!isManufacturer
        ? phones.flatMap((phone) => [
          query(productsCol, where("retailerPhone", "==", phone)),
          query(productsCol, where("ownerPhone", "==", phone)),
        ])
        : []),
    ];
    const snaps = await Promise.all(queries.map((q) => getDocs(q).catch((err) => {
      errors.push(err);
      return null;
    })));
    productsFailed = snaps.length > 0 && snaps.every((snap) => snap === null);
    const byId = new Map<string, LoadedProduct>();
    for (const snap of snaps) {
      for (const d of snap?.docs ?? []) {
        if (d.data().isActive === false) continue;
        byId.set(d.id, { id: d.id, ...d.data() });
      }
    }
    products = Array.from(byId.values());
  }

  const addCounters = (data: Record<string, unknown>) => {
    totalImpressions += Number(data.impressions || 0);
    totalClicks += Number(data.clicks || 0);
    totalPositionSum += Number(data.positionSum || 0);

    const impressionsDay = (data.impressionsByDay ?? {}) as Record<string, unknown>;
    const callsDay = (data.callsByDay ?? {}) as Record<string, unknown>;
    const directionsDay = (data.directionRequestsByDay ?? {}) as Record<string, unknown>;
    days.forEach((day) => {
      viewsByDay[day.key] += Number(impressionsDay[day.key] || 0);
      callsByDay[day.key] += Number(callsDay[day.key] || 0);
      directionsByDay[day.key] += Number(directionsDay[day.key] || 0);
    });
  };

  const seenProductIds = new Set<string>();
  for (const p of products) {
    if (seenProductIds.has(p.id)) continue;
    seenProductIds.add(p.id);
    // Legacy counters still written by older app versions.
    addCounters(p);
  }

  // Current counters live in productStats/{id}, 30 per query in parallel.
  const stats = await getDocsByIds(db, "productStats", seenProductIds).catch((err) => {
    errors.push(err);
    console.error("[analytics] productStats read failed:", err);
    return new Map<string, Record<string, unknown>>();
  });
  stats.forEach((data) => addCounters(data));

  // ── Orders: revenue and volume ───────────────────────────────────────────
  const revenueByDay: Record<string, number> = {};
  const ordersByDay: Record<string, number> = {};
  days.forEach((d) => {
    revenueByDay[d.key] = 0;
    ordersByDay[d.key] = 0;
  });

  // All-time totals and the window's per-day series from the seller's stats
  // docs (sellerStatsOnOrderWrite), instead of every order the seller ever had.
  const sellerKeys = sellerKeysFor(retailerId, profile);
  const orderStats = await readSellerOrderStats(sellerKeys, days[0].key, days[days.length - 1].key);
  errors.push(...orderStats.errors);

  let totalOrders = 0;
  let totalRevenue = 0;
  const statusCounts: Record<string, number> = {};
  const productAgg = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const { totals, days: dayDocs } of orderStats.results) {
    totalOrders += Number(totals.orders?.count ?? 0) || 0;
    totalRevenue += Number(totals.orders?.revenue ?? 0) || 0;
    for (const [status, n] of Object.entries(totals.orders?.status ?? {})) {
      statusCounts[status] = (statusCounts[status] ?? 0) + (Number(n) || 0);
    }
    for (const item of Object.values(totals.items ?? {})) {
      const name = String(item?.name ?? "Unknown product");
      const agg = productAgg.get(name) ?? { name, quantity: 0, revenue: 0 };
      agg.quantity += Number(item?.qty ?? 0) || 0;
      agg.revenue += Number(item?.revenue ?? 0) || 0;
      productAgg.set(name, agg);
    }
    for (const day of dayDocs) {
      const key = String(day.date ?? "");
      if (!dayKeys.has(key)) continue;
      ordersByDay[key] += Number(day.orders?.count ?? 0) || 0;
      revenueByDay[key] += Number(day.orders?.revenue ?? 0) || 0;
    }
  }

  const topProducts = Array.from(productAgg.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Surface a real failure instead of silently rendering zeros — but only
  // when *nothing* succeeded; partial data is still worth showing.
  const everythingFailed =
    errors.length > 0 &&
    productsFailed &&
    orderStats.results.length === 0;
  if (everythingFailed) {
    throw errors[0];
  }

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgPosition = totalImpressions > 0 ? totalPositionSum / totalImpressions : 0;
  const impressionsFormatted =
    totalImpressions >= 1000
      ? (totalImpressions / 1000).toFixed(1) + "k"
      : totalImpressions.toString();

  return {
    totalImpressions,
    totalClicks,
    productCount: seenProductIds.size,
    searchAppearance: {
      impressions: impressionsFormatted,
      ctr: ctr.toFixed(1) + "%",
      avgPosition: avgPosition > 0 ? avgPosition.toFixed(1) : "—",
    },
    viewsOverTime: bucketSeries(days.map((day) => ({ label: day.label, value: viewsByDay[day.key] || 0 }))),
    callsOverTime: bucketSeries(days.map((day) => ({ label: day.label, value: callsByDay[day.key] || 0 }))),
    directionRequests: bucketSeries(days.map((day) => ({ label: day.label, value: directionsByDay[day.key] || 0 }))),
    orders: {
      totalOrders,
      totalRevenue,
      revenueOverTime: bucketSeries(days.map((day) => ({ label: day.label, value: revenueByDay[day.key] || 0 }))),
      ordersOverTime: bucketSeries(days.map((day) => ({ label: day.label, value: ordersByDay[day.key] || 0 }))),
      statusCounts,
      topProducts,
    },
    followers,
    reelViews,
    reelLikes,
    reelComments,
    hasAnyData:
      totalOrders > 0 ||
      totalImpressions > 0 ||
      totalClicks > 0 ||
      followers > 0 ||
      reelViews > 0,
  };
}
