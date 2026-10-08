"use client";

import { useCallback, useEffect, useState } from "react";
import { getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Zap, RefreshCw, Loader2, AlertTriangle, ChevronDown, Send } from "lucide-react";

/**
 * Admin → Route Payouts.
 *
 * Where every seller's money is in Razorpay Route: the transfer made at
 * checkout (held), its release after delivery, and its settlement to the
 * seller's bank, the same columns as Razorpay's Route → Transfers screen.
 * Statuses come from orders/{id}.payout, which a Cloud Function keeps in step
 * with Razorpay (functions/src/payouts/payout-status.ts); "Check with
 * Razorpay now" asks for every followed order at once.
 *
 * "Needs action" lists delivered orders whose transfer is still on hold, e.g.
 * delivered while settings/route.releaseEnabled was off: release them here.
 */

type Summary = Record<string, { count: number; amount: number }>;

type TransferRow = {
  orderId: string;
  createdAt: number | null;
  orderStatus: string;
  sellerName: string;
  sellerPhone: string;
  via: string;
  transferId: string | null;
  account: string | null;
  amount: number;
  reversed: number;
  transferStatus: string | null;
  settlementStatus: string | null;
  state: string;
  onHoldUntil: number | null;
  settlementId: string | null;
  settledAt: number | null;
  checkedAt: number | null;
  error: string | null;
};

type SellerRow = {
  phone: string;
  collection: string;
  businessName: string;
  razorpayAccountId: string;
  routeStatus: string;
};

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_action", label: "Needs action" },
  { key: "on_hold", label: "On hold" },
  { key: "scheduled", label: "Release scheduled" },
  { key: "processing", label: "On the way" },
  { key: "settled", label: "Settled" },
  { key: "failed", label: "Failed" },
  { key: "reversed", label: "Reversed" },
  { key: "not_routed", label: "Not routed" },
];

const STATE_META: Record<string, { label: string; cls: string }> = {
  on_hold: { label: "On hold", cls: "bg-amber-50 text-amber-800" },
  scheduled: { label: "Release scheduled", cls: "bg-blue-50 text-blue-700" },
  processing: { label: "On the way to bank", cls: "bg-indigo-50 text-indigo-700" },
  settled: { label: "Settled", cls: "bg-green-50 text-green-700" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-700" },
  reversed: { label: "Reversed", cls: "bg-surface-container text-on-surface-variant" },
  not_routed: { label: "Not routed", cls: "bg-surface-container text-on-surface-variant" },
  checking: { label: "Checking…", cls: "bg-surface-container text-on-surface-variant" },
};

const ROUTE_STATUS_CLS: Record<string, string> = {
  activated: "bg-green-50 text-green-700",
  needs_clarification: "bg-amber-50 text-amber-800",
  under_review: "bg-blue-50 text-blue-700",
  requested: "bg-surface-container text-on-surface-variant",
};

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmt = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

const cap = (s: string | null) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");

async function authHeader(): Promise<Record<string, string>> {
  const token = await getAuth().currentUser?.getIdToken();
  return { Authorization: `Bearer ${token ?? ""}` };
}

export default function AdminRoutePayoutsPage() {
  const [filter, setFilter] = useState("all");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSellers, setShowSellers] = useState(false);

  const fetchPage = useCallback(async (state: string, after: string | null) => {
    const qs = new URLSearchParams({ state, ...(after ? { cursor: after } : {}) });
    const res = await fetch(`/api/admin/route-payouts?${qs}`, { headers: await authHeader() });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Could not load Route payout data.");
    return json as { summary: Summary; sellers: SellerRow[]; transfers: TransferRow[]; nextCursor: string | null };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchPage(filter, null);
      setSummary(json.summary);
      setSellers(json.sellers);
      setRows(json.transfers);
      setCursor(json.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Route payout data.");
    } finally {
      setLoading(false);
    }
  }, [fetchPage, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const json = await fetchPage(filter, cursor);
      setRows((prev) => [...prev, ...json.transfers]);
      setCursor(json.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load more.");
    } finally {
      setLoadingMore(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setNotice(null);
    setError(null);
    try {
      const call = httpsCallable<Record<string, never>, { checked: number; changed: number; errors: number }>(
        getFunctions(getApp()),
        "syncPayoutsNow",
      );
      const { data } = await call({});
      setNotice(
        `Checked ${data.checked} order${data.checked === 1 ? "" : "s"} with Razorpay: ${data.changed} updated` +
          (data.errors ? `, ${data.errors} could not be read (will retry)` : "") + ".",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach Razorpay.");
    } finally {
      setSyncing(false);
    }
  };

  const release = async (row: TransferRow) => {
    const ok = window.confirm(
      `Release ${inr(row.amount)} to ${row.sellerName || row.sellerPhone} now?\n\n` +
        `Order ${row.orderId} is delivered and its money is still on hold. Razorpay settles it to the seller by the next working day.`,
    );
    if (!ok) return;
    setReleasing(row.orderId);
    setError(null);
    try {
      const res = await fetch("/api/admin/route-payouts", {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release", orderId: row.orderId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Release failed.");
      setNotice(
        json.alreadyReleased
          ? `Transfer ${json.transferId} was already released; its status will refresh shortly.`
          : `Released ${json.transferId}. Status updates within 15 minutes (or use "Check with Razorpay now").`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Release failed.");
    } finally {
      setReleasing(null);
    }
  };

  const tile = (key: string) => summary?.[key] ?? { count: 0, amount: 0 };

  return (
    <div className="pb-16">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-on-surface">
            <Zap className="h-5 w-5 text-primary" />
            Route Payouts
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            Every seller transfer made through Razorpay Route: held at checkout, released after
            delivery, then settled to the seller&apos;s bank. Statuses are checked with Razorpay
            automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void syncNow()}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Check with Razorpay now
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/50 px-3 py-1.5 text-sm font-semibold hover:bg-surface-container disabled:opacity-50"
          >
            Reload
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>
      )}

      {summary && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Needs action (delivered, still held)" v={tile("needs_action")} tone="red" onClick={() => setFilter("needs_action")} />
          <StatCard label="On hold" v={tile("on_hold")} tone="amber" onClick={() => setFilter("on_hold")} />
          <StatCard label="Release scheduled" v={tile("scheduled")} tone="blue" onClick={() => setFilter("scheduled")} />
          <StatCard label="On the way to bank" v={tile("processing")} tone="indigo" onClick={() => setFilter("processing")} />
          <StatCard label="Settled" v={tile("settled")} tone="green" onClick={() => setFilter("settled")} />
          <StatCard label="Failed" v={tile("failed")} tone="red" onClick={() => setFilter("failed")} />
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              filter === f.key ? "border-primary bg-primary text-white" : "border-outline-variant/50 text-on-surface-variant hover:border-primary"
            }`}
          >
            {f.label}
            {summary?.[f.key] ? ` (${summary[f.key].count})` : ""}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-outline-variant/20 text-left text-xs text-on-surface-variant">
              <th className="px-3 py-2 font-semibold">Transfer Id</th>
              <th className="px-3 py-2 font-semibold">Order / Seller</th>
              <th className="px-3 py-2 font-semibold">Recipient Id</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
              <th className="px-3 py-2 font-semibold">Created At</th>
              <th className="px-3 py-2 font-semibold">Transfer Status</th>
              <th className="px-3 py-2 font-semibold">Settlement Status</th>
              <th className="px-3 py-2 font-semibold">Payout</th>
              <th className="px-3 py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-on-surface-variant">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-on-surface-variant">
                  Nothing here yet. Orders paid online appear within a few minutes of payment.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const meta = STATE_META[r.state] ?? STATE_META.checking;
                const needsAction = r.state === "on_hold" && r.orderStatus === "delivered";
                return (
                  <tr key={r.orderId} className="border-b border-outline-variant/10 align-top last:border-0">
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {r.transferId ?? "—"}
                      {r.via === "balance" && <span className="ml-1 rounded bg-surface-container px-1 text-[10px]">payout run</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-mono text-xs text-on-surface-variant">#{r.orderId.slice(0, 10)}</p>
                      <p className="text-xs text-on-surface">{r.sellerName || r.sellerPhone || "—"}</p>
                      <p className="text-[11px] capitalize text-on-surface-variant">{r.orderStatus.replace(/_/g, " ")}</p>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-on-surface-variant">{r.account ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      {r.transferId ? inr(r.amount) : "—"}
                      {r.reversed > 0 && <p className="text-[11px] font-normal text-on-surface-variant">−{inr(r.reversed)} reversed</p>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-on-surface-variant">{fmt(r.createdAt)}</td>
                    <td className="px-3 py-2.5 text-xs">{cap(r.transferStatus)}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {cap(r.settlementStatus)}
                      {r.settlementId && <p className="font-mono text-[10px] text-on-surface-variant">{r.settlementId}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${needsAction ? "bg-red-50 text-red-700" : meta.cls}`}>
                        {needsAction ? "Delivered, still held" : meta.label}
                      </span>
                      {r.state === "scheduled" && <p className="mt-0.5 text-[11px] text-on-surface-variant">Releases {fmt(r.onHoldUntil)}</p>}
                      {r.state === "settled" && r.settledAt && <p className="mt-0.5 text-[11px] text-on-surface-variant">Seen settled {fmt(r.settledAt)}</p>}
                      {r.error && <p className="mt-0.5 text-[11px] text-red-700">{r.error}</p>}
                      <p className="mt-0.5 text-[10px] text-on-surface-variant/70">Checked {fmt(r.checkedAt)}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      {needsAction && (
                        <button
                          onClick={() => void release(r)}
                          disabled={releasing === r.orderId}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {releasing === r.orderId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          Release
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {cursor && !loading && (
        <div className="mt-3 text-center">
          <button
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-lg border border-outline-variant/50 px-4 py-1.5 text-sm font-semibold hover:bg-surface-container disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-2xl border border-outline-variant/30 bg-white">
        <button
          onClick={() => setShowSellers((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-on-surface hover:bg-surface-container-low/40"
        >
          Sellers with a Route account ({sellers.length})
          <ChevronDown className={`h-4 w-4 transition-transform ${showSellers ? "rotate-180" : ""}`} />
        </button>
        {showSellers && (
          <div className="divide-y divide-outline-variant/15 border-t border-outline-variant/15">
            {sellers.length === 0 ? (
              <p className="px-4 py-4 text-sm text-on-surface-variant">No seller has a Route account yet.</p>
            ) : (
              sellers.map((s) => (
                <div key={`${s.collection}/${s.phone}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-on-surface">{s.businessName}</span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${ROUTE_STATUS_CLS[s.routeStatus] ?? "bg-surface-container text-on-surface-variant"}`}>
                    {s.routeStatus}
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    {s.phone} · {s.collection} · <span className="font-mono">{s.razorpayAccountId}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  v,
  tone,
  onClick,
}: {
  label: string;
  v: { count: number; amount: number };
  tone: "amber" | "blue" | "green" | "indigo" | "red";
  onClick: () => void;
}) {
  const cls = {
    amber: "text-amber-700",
    blue: "text-blue-700",
    green: "text-green-700",
    indigo: "text-indigo-700",
    red: "text-red-700",
  }[tone];
  return (
    <button onClick={onClick} className="rounded-2xl border border-outline-variant/30 bg-white p-4 text-left hover:border-primary">
      <p className={`text-xl font-black tabular-nums ${cls}`}>{inr(v.amount)}</p>
      <p className="mt-0.5 text-xs font-semibold text-on-surface">
        {v.count} transfer{v.count === 1 ? "" : "s"}
      </p>
      <p className="mt-0.5 text-[11px] text-on-surface-variant">{label}</p>
    </button>
  );
}
