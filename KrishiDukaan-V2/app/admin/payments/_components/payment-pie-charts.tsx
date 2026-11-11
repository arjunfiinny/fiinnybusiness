"use client";

import { useMemo } from "react";
import type { Attempt } from "../_lib/payments";
import { bucketOf, type Bucket } from "../_lib/payments";

/**
 * Two payment pie (donut) charts, drawn with plain SVG — the project ships no
 * charting library, and the existing analytics charts are hand-rolled SVG too.
 *
 * Both charts read the SAME already-filtered dataset passed in, so they always
 * agree with the table and the CSV. Each attempt is one slice contribution and
 * is counted once (bucketOf is exhaustive and mutually exclusive), so there is
 * no double-counting.
 *
 * The two charts differ on purpose, and their titles say how:
 *   1. Status Distribution — ALL attempts, including checkouts still in flight
 *      ("In process"). Answers "where is every attempt right now?".
 *   2. Outcome Breakdown — RESOLVED attempts only (drops "In process").
 *      Answers "of the checkouts that finished, how did they end?".
 */

const COLORS: Record<Bucket, string> = {
  paid: "#16a34a", // green-600
  failed: "#dc2626", // red-600
  abandoned: "#d97706", // amber-600
  pending: "#64748b", // slate-500
};

type Slice = { bucket: Bucket; label: string; count: number };

export function PaymentPieCharts({ rows, now }: { rows: Attempt[]; now: number }) {
  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { paid: 0, failed: 0, abandoned: 0, pending: 0 };
    for (const a of rows) c[bucketOf(a, now)] += 1;
    return c;
  }, [rows, now]);

  const statusSlices: Slice[] = [
    { bucket: "paid", label: "Successful", count: counts.paid },
    { bucket: "failed", label: "Failed", count: counts.failed },
    { bucket: "abandoned", label: "Abandoned", count: counts.abandoned },
    { bucket: "pending", label: "In process", count: counts.pending },
  ];

  const outcomeSlices: Slice[] = [
    { bucket: "paid", label: "Successful", count: counts.paid },
    { bucket: "failed", label: "Failed", count: counts.failed },
    { bucket: "abandoned", label: "Abandoned", count: counts.abandoned },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Donut
        title="Payment status distribution"
        subtitle="Every payment attempt, including checkouts still in progress."
        slices={statusSlices}
      />
      <Donut
        title="Payment outcome breakdown"
        subtitle="Resolved attempts only — in-progress checkouts are excluded."
        slices={outcomeSlices}
      />
    </div>
  );
}

function Donut({
  title,
  subtitle,
  slices,
}: {
  title: string;
  subtitle: string;
  slices: Slice[];
}) {
  const total = slices.reduce((s, x) => s + x.count, 0);

  // Geometry: a stroked circle whose dasharray paints each slice in turn.
  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = slices.map((s) => {
    const frac = total > 0 ? s.count / total : 0;
    const arc = {
      bucket: s.bucket,
      dash: frac * C,
      gap: C - frac * C,
      rotation: (offset / C) * 360,
    };
    offset += frac * C;
    return arc;
  });

  return (
    <div className="rounded-2xl border border-outline/15 bg-white p-4">
      <p className="text-sm font-bold text-on-surface">{title}</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">{subtitle}</p>

      <div className="mt-3 flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width="150" height="150" viewBox="0 0 150 150">
            <circle cx="75" cy="75" r={R} fill="none" stroke="#f1f5f9" strokeWidth="18" />
            {total > 0 &&
              arcs.map((a) => (
                <circle
                  key={a.bucket}
                  cx="75"
                  cy="75"
                  r={R}
                  fill="none"
                  stroke={COLORS[a.bucket]}
                  strokeWidth="18"
                  strokeDasharray={`${a.dash} ${a.gap}`}
                  strokeDashoffset={0}
                  transform={`rotate(${a.rotation - 90} 75 75)`}
                />
              ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-extrabold text-on-surface">{total}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-outline">
              attempts
            </span>
          </div>
        </div>

        <ul className="min-w-0 flex-1 space-y-1.5">
          {slices.map((s) => {
            const p = total > 0 ? (s.count / total) * 100 : 0;
            return (
              <li key={s.bucket} className="flex items-center gap-2 text-sm">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: COLORS[s.bucket] }}
                />
                <span className="flex-1 truncate text-on-surface-variant">{s.label}</span>
                <span className="font-bold text-on-surface">{s.count}</span>
                <span className="w-12 text-right text-xs text-outline">{p.toFixed(1)}%</span>
              </li>
            );
          })}
        </ul>
      </div>

      {total === 0 && (
        <p className="mt-2 text-center text-xs text-outline">
          No payment attempts in the selected range.
        </p>
      )}
    </div>
  );
}
