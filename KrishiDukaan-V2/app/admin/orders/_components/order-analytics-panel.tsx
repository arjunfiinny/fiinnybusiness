"use client";

/**
 * Collapsible Order Analytics for Admin → Orders. Default collapsed; computes
 * everything from the SAME filtered order set the table and export use, so the
 * numbers always reconcile. Reads order-level payment state only (see
 * order-analytics.ts) — attempts and the gateway mirror are deliberately not
 * touched here.
 */

import { useMemo, useState } from "react";
import {
  BarChart3, ChevronDown, Loader2, ShoppingBag, Wallet, Undo2, TrendingUp,
  AlertTriangle, ArrowDownUp, Store, Factory,
} from "lucide-react";
import type { OrderDoc } from "../../../../types/order";
import {
  computeFinancialSummary, computePaymentDistribution, computeSellerBreakdown,
  PAYMENT_BUCKET_META, type SellerSortKey,
} from "../_lib/order-analytics";

const inr = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("en-IN");

function SummaryTile({ icon: Icon, label, value, tone = "default" }: {
  icon: any; label: string; value: string; tone?: "default" | "green" | "red" | "amber";
}) {
  const toneCls = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-700" : "text-on-surface";
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3">
      <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className={`mt-1 text-base font-black ${toneCls}`}>{value}</p>
    </div>
  );
}

export function OrderAnalyticsPanel({
  orders, loading, error, complete, onSelectSeller, onOpenChange,
}: {
  orders: OrderDoc[];
  loading: boolean;
  error: string | null;
  /** True when `orders` is the full filtered set (not just loaded pages). */
  complete: boolean;
  onSelectSeller: (sellerKey: string) => void;
  /** Fired when the panel expands/collapses, so the parent can lazily load the
   *  full filtered dataset only once it is actually opened. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const setOpen = (next: boolean | ((v: boolean) => boolean)) => {
    setOpenState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      onOpenChange?.(value);
      return value;
    });
  };
  const [sortBy, setSortBy] = useState<SellerSortKey>("value");

  const summary = useMemo(() => computeFinancialSummary(orders), [orders]);
  const dist = useMemo(() => computePaymentDistribution(orders), [orders]);
  const sellers = useMemo(() => computeSellerBreakdown(orders, sortBy), [orders, sortBy]);

  const sortBtn = (key: SellerSortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSortBy(key)}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
        sortBy === key ? "bg-primary text-white" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
      }`}
    >
      <ArrowDownUp className="h-3 w-3" /> {label}
    </button>
  );

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface-container-low/60"
      >
        <BarChart3 className="h-4 w-4 text-primary" />
        <span className="text-sm font-black text-on-surface">Order analytics</span>
        <span className="text-[11px] text-on-surface-variant">
          {loading ? "loading…" : `${num(summary.totalOrders)} orders${complete ? "" : " (loaded)"}`}
        </span>
        <ChevronDown className={`ml-auto h-4 w-4 text-on-surface-variant transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-outline-variant/20 p-4 space-y-5">
          {error && (
            <p className="flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </p>
          )}
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin" /> Crunching the numbers…
            </p>
          ) : (
            <>
              {!complete && (
                <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700">
                  Showing analytics for the orders loaded so far. Narrow the date range to aggregate the full matching set.
                </p>
              )}

              {/* A — Financial summary */}
              <section>
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Financial summary</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <SummaryTile icon={ShoppingBag} label="Total orders" value={num(summary.totalOrders)} />
                  <SummaryTile icon={TrendingUp} label="Total value" value={inr(summary.totalValue)} />
                  <SummaryTile icon={Wallet} label="Collected" value={inr(summary.collected)} tone="green" />
                  <SummaryTile icon={Undo2} label="Refunded" value={inr(summary.refunded)} tone="red" />
                  <SummaryTile icon={Wallet} label="Net collected" value={inr(summary.netCollected)} tone="green" />
                  <SummaryTile icon={AlertTriangle} label="Unpaid value" value={inr(summary.unpaidValue)} tone="amber" />
                </div>
              </section>

              {/* B — Payment distribution */}
              <section>
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Payment distribution</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {(Object.keys(PAYMENT_BUCKET_META) as Array<keyof typeof PAYMENT_BUCKET_META>).map((b) => (
                    <div key={b} className="rounded-xl border border-outline-variant/30 p-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${PAYMENT_BUCKET_META[b].badge}`}>
                        {PAYMENT_BUCKET_META[b].label}
                      </span>
                      <p className="mt-1.5 text-lg font-black text-on-surface">{num(dist[b].count)}</p>
                      <p className="text-[11px] text-on-surface-variant">{inr(dist[b].amount)}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* C — Retailer-wise breakdown */}
              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Retailer-wise breakdown</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-on-surface-variant">Sort:</span>
                    {sortBtn("orders", "Orders")}
                    {sortBtn("value", "Value")}
                    {sortBtn("collected", "Collected")}
                  </div>
                </div>
                {sellers.length === 0 ? (
                  <p className="py-4 text-center text-xs text-on-surface-variant">No sellers in this selection.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                    <table className="w-full min-w-[760px] border-collapse text-xs">
                      <thead className="bg-surface-container-low">
                        <tr className="border-b border-outline-variant/20 text-left text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
                          <th className="px-3 py-2">Seller</th>
                          <th className="px-3 py-2 text-right">Orders</th>
                          <th className="px-3 py-2 text-right">Value</th>
                          <th className="px-3 py-2 text-right">Accepted</th>
                          <th className="px-3 py-2 text-right">Dispatched</th>
                          <th className="px-3 py-2 text-right">Delivered</th>
                          <th className="px-3 py-2 text-right">Cancel/Rej</th>
                          <th className="px-3 py-2 text-right">Collected</th>
                          <th className="px-3 py-2 text-right">Refunded</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sellers.map((r) => (
                          <tr
                            key={r.sellerKey}
                            onClick={() => onSelectSeller(r.sellerKey)}
                            title="Filter the orders table to this seller"
                            className="cursor-pointer border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-low/70"
                          >
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1 font-semibold text-on-surface">
                                {r.sellerType === "manufacturer"
                                  ? <Factory className="h-3 w-3 shrink-0 text-blue-600" />
                                  : <Store className="h-3 w-3 shrink-0 text-green-600" />}
                                <span className="truncate max-w-[180px]">{r.sellerName}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-on-surface">{num(r.orders)}</td>
                            <td className="px-3 py-2 text-right text-on-surface">{inr(r.value)}</td>
                            <td className="px-3 py-2 text-right text-on-surface-variant">{num(r.accepted)}</td>
                            <td className="px-3 py-2 text-right text-on-surface-variant">{num(r.dispatched)}</td>
                            <td className="px-3 py-2 text-right text-on-surface-variant">{num(r.delivered)}</td>
                            <td className="px-3 py-2 text-right text-on-surface-variant">{num(r.cancelledRejected)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-green-700">{inr(r.collected)}</td>
                            <td className="px-3 py-2 text-right text-red-600">{inr(r.refunded)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
