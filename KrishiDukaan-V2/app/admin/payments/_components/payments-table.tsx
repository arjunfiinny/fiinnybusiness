"use client";

import { Eye, Phone } from "lucide-react";
import {
  bucketOf,
  BUCKET_LABEL,
  nameOf,
  phoneOf,
  platformOf,
  PLATFORM_LABEL,
  productSummary,
  reasonOf,
  type Attempt,
  type Bucket,
} from "../_lib/payments";

/**
 * Compact, one-row-per-payment table. Long product names and error reasons are
 * truncated with a title tooltip so a row never grows; the phone is always
 * visible without opening details.
 */

const BADGE: Record<Bucket, string> = {
  failed: "bg-red-50 text-red-700",
  abandoned: "bg-amber-50 text-amber-700",
  pending: "bg-slate-100 text-slate-600",
  paid: "bg-green-50 text-green-700",
};

export function PaymentsTable({
  rows,
  now,
  onView,
}: {
  rows: Attempt[];
  now: number;
  onView: (a: Attempt) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-outline/15 bg-white">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="border-b border-outline/15 bg-surface-container/40 text-left text-xs uppercase tracking-wide text-on-surface-variant">
          <tr>
            <th className="px-3 py-2.5 font-semibold">Date &amp; time</th>
            <th className="px-3 py-2.5 font-semibold">Customer</th>
            <th className="px-3 py-2.5 font-semibold">Product</th>
            <th className="px-3 py-2.5 font-semibold">Phone</th>
            <th className="px-3 py-2.5 font-semibold">Error / reason</th>
            <th className="px-3 py-2.5 font-semibold">Platform</th>
            <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const bucket = bucketOf(a, now);
            const phone = phoneOf(a);
            const product = productSummary(a);
            const reason = reasonOf(a, bucket);
            return (
              <tr
                key={a.id}
                className="border-b border-outline/10 align-top transition hover:bg-surface-container/30"
              >
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-on-surface-variant">
                  {a.createdAt ? a.createdAt.toLocaleString("en-IN") : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="max-w-[10rem] truncate font-semibold text-on-surface" title={nameOf(a)}>
                      {nameOf(a)}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${BADGE[bucket]}`}>
                      {BUCKET_LABEL[bucket]}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="block max-w-[16rem] truncate text-on-surface-variant" title={product}>
                    {product}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {phone ? (
                    <a href={`tel:${phone}`} className="flex items-center gap-1 text-primary hover:underline">
                      <Phone className="h-3 w-3" />
                      {phone}
                    </a>
                  ) : (
                    <span className="text-outline">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`block max-w-[16rem] truncate text-xs ${
                      bucket === "failed" ? "text-red-600" : "text-on-surface-variant"
                    }`}
                    title={reason}
                  >
                    {reason}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-on-surface-variant">
                  {PLATFORM_LABEL[platformOf(a)]}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <button
                    onClick={() => onView(a)}
                    className="inline-flex items-center gap-1 rounded-lg border border-outline/30 px-2.5 py-1.5 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
