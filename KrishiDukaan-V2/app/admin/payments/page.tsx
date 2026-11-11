"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { auth } from "../../firebase";
import {
  DateRangePicker,
  useDateRange,
} from "../_components/analytics/ui";
import {
  attemptsToCsv,
  bucketOf,
  BUCKET_LABEL,
  downloadCsv,
  fetchAttemptsInRange,
  money,
  nameOf,
  phoneOf,
  platformOf,
  type Attempt,
  type Bucket,
  type Platform,
} from "./_lib/payments";
import { PaymentsTable } from "./_components/payments-table";
import { PaymentDetailsModal } from "./_components/payment-details-modal";
import { PaymentPieCharts } from "./_components/payment-pie-charts";

/**
 * Admin → Payments.
 *
 * Shows every payment ATTEMPT (not just the successful ones), so a lost sale is
 * visible with the detail needed to act on it: who the buyer was, how to reach
 * them, which products at what price, and what Razorpay said went wrong.
 *
 * The whole page works off ONE date-bounded fetch of `paymentAttempts`
 * (fetchAttemptsInRange). Table, pie charts and CSV all read that same set, so
 * they can never disagree. The categorisation (failed / abandoned / in-process
 * / successful) is the shared bucketOf rule in _lib/payments.ts — "successful"
 * is Razorpay-confirmed money only, and "abandoned" is the app's own
 * 30-minutes-at-'created' rule, never simply "any failed Razorpay payment".
 */

const PAGE_SIZE = 25;

const PLATFORM_OPTIONS: { value: Platform | "all"; label: string }[] = [
  { value: "all", label: "All platforms" },
  { value: "app", label: "App" },
  { value: "web", label: "Web" },
  { value: "razorpay", label: "Razorpay (synced)" },
  { value: "unknown", label: "Unknown" },
];

export default function AdminPaymentsPage() {
  const dr = useDateRange("30d");
  const { from, to } = dr.range;

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Single clock for the whole loaded set, so the 30-minute abandoned/pending
  // split is identical across table, charts and CSV. Bumped on every reload.
  const [now, setNow] = useState(() => Date.now());

  const [tab, setTab] = useState<Bucket>("failed");
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selected, setSelected] = useState<Attempt | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAttemptsInRange(from, to);
      setAttempts(rows);
      setNow(Date.now());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not load payments. Check the Firestore rules for paymentAttempts.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Refetch whenever the date range changes.
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.getTime(), to.getTime()]);

  // Reset pagination when the working view changes.
  useEffect(() => setPage(0), [tab, platform, search]);

  // Everything in range after the platform + text filters — but NOT the status
  // tab. Charts and the summary read this so they always show the full
  // distribution; only the table and CSV narrow further by tab.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attempts.filter((a) => {
      if (platform !== "all" && platformOf(a) !== platform) return false;
      if (!q) return true;
      return (
        (phoneOf(a) ?? "").toLowerCase().includes(q) ||
        nameOf(a).toLowerCase().includes(q) ||
        a.razorpayOrderId.toLowerCase().includes(q) ||
        (a.razorpayPaymentId ?? "").toLowerCase().includes(q) ||
        a.items.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [attempts, platform, search]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { failed: 0, abandoned: 0, pending: 0, paid: 0 };
    for (const a of filtered) c[bucketOf(a, now)] += 1;
    return c;
  }, [filtered, now]);

  const lostValue = useMemo(
    () =>
      filtered
        .filter((a) => bucketOf(a, now) === "failed")
        .reduce((s, a) => s + a.amount, 0),
    [filtered, now],
  );

  // The tab's records (full, unpaginated) — what the CSV exports.
  const tabRows = useMemo(
    () => filtered.filter((a) => bucketOf(a, now) === tab),
    [filtered, now, tab],
  );

  const pageRows = useMemo(
    () => tabRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [tabRows, page],
  );
  const pageCount = Math.max(1, Math.ceil(tabRows.length / PAGE_SIZE));

  const exportCsv = () => {
    const csv = attemptsToCsv(tabRows, now);
    const day = new Date().toISOString().slice(0, 10);
    downloadCsv(`krishi-dukan-payments-${day}.csv`, csv);
  };

  // Pulls failed payments straight from Razorpay — catches failures the client
  // never reported (killed app, dropped connection, old app version). Unchanged
  // behaviour from before; just reloads the range when done.
  const syncFromRazorpay = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in.");
      let skip = 0;
      let totalScanned = 0;
      let totalWritten = 0;
      let hasMore = true;
      let guard = 0;
      while (hasMore && guard < 50) {
        guard++;
        const res = await fetch("/api/admin/sync-razorpay-failures", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ skip }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Sync failed");
        totalScanned += data.scanned ?? 0;
        totalWritten += data.written ?? 0;
        skip = data.nextSkip ?? skip;
        hasMore = Boolean(data.hasMore);
      }
      setSyncResult(
        `Scanned ${totalScanned} Razorpay payment${totalScanned === 1 ? "" : "s"}, added/updated ${totalWritten} failed record${totalWritten === 1 ? "" : "s"}.`,
      );
      await reload();
    } catch (e) {
      setSyncResult(e instanceof Error ? `Sync failed: ${e.message}` : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-on-surface">Payments</h1>
          <p className="text-sm text-on-surface-variant">
            Every payment attempt in the selected range — successful, failed, abandoned and in progress.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={tabRows.length === 0}
            title="Export every record in the current tab, range and filters — not just this page."
            className="flex items-center gap-2 rounded-lg border border-outline/30 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:bg-surface-container disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={syncFromRazorpay}
            disabled={syncing}
            title="Pull failed payments directly from Razorpay — catches failures the app never reported."
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Download className={`h-4 w-4 ${syncing ? "animate-pulse" : ""}`} />
            {syncing ? "Syncing…" : "Sync from Razorpay"}
          </button>
          <button
            onClick={reload}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-outline/30 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:bg-surface-container disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {syncResult && (
        <div className="flex items-start gap-2 rounded-xl bg-primary/5 px-4 py-3 text-sm text-on-surface">
          <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{syncResult}</span>
        </div>
      )}

      {/* Date range */}
      <DateRangePicker {...dr} />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Failed" value={String(counts.failed)} tone="error" />
        <SummaryCard label="Abandoned" value={String(counts.abandoned)} tone="warn" />
        <SummaryCard label="In progress" value={String(counts.pending)} tone="warn" />
        <SummaryCard label="Successful" value={String(counts.paid)} tone="ok" />
        <SummaryCard label="Value not collected" value={money(lostValue)} tone="error" />
      </div>

      {/* Analytics (collapsible) */}
      <div className="rounded-2xl border border-outline/15 bg-surface-container/20">
        <button
          onClick={() => setShowAnalytics((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <BarChart3 className="h-4 w-4 text-primary" />
            Payment analytics
            <span className="text-xs font-normal text-on-surface-variant">
              ({filtered.length} attempt{filtered.length === 1 ? "" : "s"} in view)
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 text-outline transition-transform ${showAnalytics ? "rotate-180" : ""}`} />
        </button>
        {showAnalytics && (
          <div className="border-t border-outline/15 p-4">
            <PaymentPieCharts rows={filtered} now={now} />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-outline/20">
        {(["failed", "abandoned", "pending", "paid"] as Bucket[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-1 pb-2 text-sm font-semibold ${
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {BUCKET_LABEL[t]}
            <span className="rounded-full bg-surface-container px-1.5 py-0.5 text-[11px] font-bold">
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, payment / order id or product"
            className="w-full rounded-lg border border-outline/30 py-2 pl-9 pr-9 text-sm focus:border-primary focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform | "all")}
          className="rounded-lg border border-outline/30 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          {PLATFORM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <p className="py-16 text-center text-sm text-on-surface-variant">Loading…</p>
      ) : tabRows.length === 0 ? (
        <p className="py-16 text-center text-sm text-on-surface-variant">
          {search || platform !== "all"
            ? `No ${BUCKET_LABEL[tab].toLowerCase()} payments match the current filters.`
            : `No ${BUCKET_LABEL[tab].toLowerCase()} payments in this range.`}
        </p>
      ) : (
        <>
          <PaymentsTable rows={pageRows} now={now} onView={setSelected} />
          <div className="flex items-center justify-between text-sm text-on-surface-variant">
            <span>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, tabRows.length)} of{" "}
              {tabRows.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-outline/30 px-3 py-1.5 font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs">
                Page {page + 1} / {pageCount}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="rounded-lg border border-outline/30 px-3 py-1.5 font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {selected && (
        <PaymentDetailsModal attempt={selected} now={now} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "error" | "warn" | "ok";
}) {
  const toneClass =
    tone === "error" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-green-700";
  return (
    <div className="rounded-xl border border-outline/15 bg-white p-4">
      <p className={`text-2xl font-extrabold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">{label}</p>
    </div>
  );
}
