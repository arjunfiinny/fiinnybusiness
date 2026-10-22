"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, documentId, getDocs, query, where } from "firebase/firestore";
import { Search, RefreshCw, Download, SearchX, LayoutGrid } from "lucide-react";
import { db } from "../../firebase";

/**
 * Admin > Search insights: what shoppers search for and browse, from the
 * daily aggregate docs searchStats/{YYYY-MM-DD} written by
 * /api/analytics/search. One read per day in range (≤ 90).
 */

type DayDoc = {
  date: string;
  total?: number;
  zeroTotal?: number;
  categoryTotal?: number;
  sources?: Record<string, number>;
  terms?: Record<string, number>;
  zeroResults?: Record<string, number>;
  categories?: Record<string, number>;
};

const RANGES = [7, 30, 90] as const;
const TOP_N = 25;

function istDayKey(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 - offsetDays * 86400 * 1000).toISOString().slice(0, 10);
}

function addInto(target: Map<string, number>, src: Record<string, number> | undefined) {
  if (!src) return;
  for (const [k, v] of Object.entries(src)) target.set(k, (target.get(k) ?? 0) + (Number(v) || 0));
}

function top(map: Map<string, number>, n = TOP_N): [string, number][] {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5">
      <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">{label}</p>
      <p className="mt-1 text-3xl font-black text-on-surface">{value}</p>
      {hint && <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>}
    </div>
  );
}

function RankedList({ title, icon: Icon, rows, empty, note }: {
  title: string;
  icon: typeof Search;
  rows: [string, number][];
  empty: string;
  note?: string;
}) {
  const max = rows[0]?.[1] ?? 1;
  return (
    <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-black text-on-surface">{title}</h2>
      </div>
      {note && <p className="text-xs text-on-surface-variant mb-3">{note}</p>}
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-on-surface-variant">{empty}</p>
      ) : (
        <ol className="space-y-1.5 mt-3">
          {rows.map(([term, count], i) => (
            <li key={term} className="grid grid-cols-[1.5rem_minmax(0,9rem)_1fr_3rem] items-center gap-2 text-sm" title={`${term}: ${count}`}>
              <span className="text-xs text-on-surface-variant tabular-nums">{i + 1}</span>
              <span className="truncate font-semibold text-on-surface">{term}</span>
              <span className="h-2 rounded-r bg-surface-container">
                <span className="block h-2 rounded-r bg-primary" style={{ width: `${Math.max(4, (count / max) * 100)}%` }} />
              </span>
              <span className="text-right tabular-nums text-on-surface-variant">{count.toLocaleString("en-IN")}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function AdminSearchInsightsPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [days, setDays] = useState<DayDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    const q = query(
      collection(db, "searchStats"),
      where(documentId(), ">=", istDayKey(range - 1)),
      where(documentId(), "<=", istDayKey(0)),
    );
    getDocs(q)
      .then(snap => setDays(snap.docs.map(d => ({ date: d.id, ...(d.data() as Omit<DayDoc, "date">) }))))
      .catch(err => {
        console.error(err);
        setError("Could not load search data. Check that you have the Analytics permission.");
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [range]);

  const agg = useMemo(() => {
    const terms = new Map<string, number>();
    const zero = new Map<string, number>();
    const cats = new Map<string, number>();
    const sources = new Map<string, number>();
    let total = 0, zeroTotal = 0, categoryTotal = 0;
    for (const d of days) {
      total += d.total ?? 0;
      zeroTotal += d.zeroTotal ?? 0;
      categoryTotal += d.categoryTotal ?? 0;
      addInto(terms, d.terms);
      addInto(zero, d.zeroResults);
      addInto(cats, d.categories);
      addInto(sources, d.sources);
    }
    const byDay = new Map(days.map(d => [d.date, d.total ?? 0]));
    const daily = Array.from({ length: range }, (_, i) => {
      const key = istDayKey(range - 1 - i);
      return { day: key, count: byDay.get(key) ?? 0 };
    });
    return { terms, zero, cats, sources, total, zeroTotal, categoryTotal, daily };
  }, [days, range]);

  const topTerms = top(agg.terms);
  const topZero = top(agg.zero);
  const topCats = top(agg.cats, 15);
  const dailyMax = Math.max(1, ...agg.daily.map(d => d.count));
  const pct = (n: number) => (agg.total ? `${Math.round((n / agg.total) * 100)}%` : "—");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Search className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-black text-on-surface">Search insights</h1>
          </div>
          <p className="text-sm text-on-surface-variant ml-9">
            What farmers and shoppers search for and browse on the website and app. A search counts once it settles, once per visitor session.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded-xl border border-outline-variant p-1">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${range === r ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"}`}>
                {r} days
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading} title="Refresh"
            className="p-2.5 rounded-xl border border-outline-variant hover:bg-surface-container disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => downloadCsv(`search-terms-${range}d.csv`, [
              ["term", "searches", "searches_with_no_results"],
              ...Array.from(agg.terms.entries()).sort((a, b) => b[1] - a[1]).map(([t, c]) => [t, c, agg.zero.get(t) ?? 0]),
            ])}
            disabled={agg.terms.size === 0}
            className="flex items-center gap-2 border border-outline-variant text-sm font-bold px-3 py-2 rounded-xl hover:bg-surface-container disabled:opacity-50">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      {error && <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold">{error}</div>}

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile label="Searches" value={agg.total.toLocaleString("en-IN")}
              hint={`Web ${pct(agg.sources.get("web") ?? 0)} · App ${pct(agg.sources.get("app") ?? 0)}`} />
            <Tile label="Unique terms" value={agg.terms.size.toLocaleString("en-IN")} />
            <Tile label="No results" value={agg.zeroTotal.toLocaleString("en-IN")} hint={`${pct(agg.zeroTotal)} of searches found nothing`} />
            <Tile label="Category browses" value={agg.categoryTotal.toLocaleString("en-IN")} />
          </div>

          <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-5">
            <h2 className="text-sm font-black text-on-surface mb-4">Searches per day</h2>
            <div className="flex items-end gap-[2px] h-32" role="img" aria-label="Searches per day">
              {agg.daily.map(d => (
                <div key={d.day} className="group relative flex-1 h-full flex items-end">
                  <div className="w-full rounded-t bg-primary/80 group-hover:bg-primary" style={{ height: `${(d.count / dailyMax) * 100}%`, minHeight: d.count ? 2 : 0 }} />
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap rounded-lg bg-on-surface px-2 py-1 text-[11px] font-bold text-white">
                    {d.day}: {d.count}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-on-surface-variant">
              <span>{agg.daily[0]?.day}</span>
              <span>{agg.daily[agg.daily.length - 1]?.day}</span>
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <RankedList title="Top searches" icon={Search} rows={topTerms}
              empty="No searches recorded in this period yet." />
            <RankedList title="Searches with no results" icon={SearchX} rows={topZero}
              note="Products people want that the marketplace doesn't list yet — good candidates to source or onboard."
              empty="Every search found something." />
          </div>
          <RankedList title="Categories browsed" icon={LayoutGrid} rows={topCats}
            empty="No category browsing recorded in this period yet." />
        </>
      )}
    </div>
  );
}
