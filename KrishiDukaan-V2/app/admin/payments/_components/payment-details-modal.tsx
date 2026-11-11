"use client";

import Link from "next/link";
import { Phone, X, ExternalLink, Package } from "lucide-react";
import {
  bucketOf,
  BUCKET_LABEL,
  money,
  nameOf,
  phoneOf,
  platformOf,
  PLATFORM_LABEL,
  reasonOf,
  type Attempt,
  type Bucket,
} from "../_lib/payments";

/**
 * Full inspection of a single payment attempt. Shows every field the spec asks
 * for; where a value is genuinely not stored (payment method on a paid row,
 * captured timestamp, refund amount) it says so rather than inventing one.
 *
 * The customer name links to the existing Users screen, deep-linked by phone —
 * no new customer-profile page is introduced.
 */

const BADGE: Record<Bucket, string> = {
  failed: "bg-red-50 text-red-700",
  abandoned: "bg-amber-50 text-amber-700",
  pending: "bg-slate-100 text-slate-600",
  paid: "bg-green-50 text-green-700",
};

export function PaymentDetailsModal({
  attempt: a,
  now,
  onClose,
}: {
  attempt: Attempt;
  now: number;
  onClose: () => void;
}) {
  const bucket = bucketOf(a, now);
  const phone = phoneOf(a);
  const customerHref = phone ? `/admin/users?q=${encodeURIComponent(phone)}` : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-outline/15 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-on-surface">Payment details</h2>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE[bucket]}`}>
                {BUCKET_LABEL[bucket]}
              </span>
              <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                {PLATFORM_LABEL[platformOf(a)]}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-on-surface-variant">
              {a.createdAt ? a.createdAt.toLocaleString("en-IN") : "—"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-outline transition hover:bg-surface-container hover:text-on-surface"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Customer */}
          <Section title="Customer">
            <Field label="Name">
              {customerHref ? (
                <Link
                  href={customerHref}
                  className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                >
                  {nameOf(a)}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                nameOf(a)
              )}
            </Field>
            <Field label="Phone">
              {phone ? (
                <a href={`tel:${phone}`} className="flex items-center gap-1 text-primary hover:underline">
                  <Phone className="h-3 w-3" />
                  {phone}
                </a>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Customer ID">
              <code className="break-all text-xs">{a.userId || "—"}</code>
            </Field>
            <Field label="Account type">
              {/* Not stored on the attempt; would need a per-row user lookup. */}
              <span className="text-outline">Not recorded on payment</span>
            </Field>
            {a.razorpayEmail && <Field label="Email">{a.razorpayEmail}</Field>}
          </Section>

          {/* Products */}
          {a.kind === "subscription" ? (
            <Section title="Subscription">
              <Field label="Seats">{a.seatCount ?? "—"}</Field>
              <Field label="Duration">
                {a.durationMonths != null ? `${a.durationMonths} month(s)` : "—"}
              </Field>
            </Section>
          ) : (
            <div>
              <SectionLabel>
                <Package className="h-3.5 w-3.5" /> Products
              </SectionLabel>
              {a.items.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-outline/15">
                  <table className="w-full min-w-[32rem] text-sm">
                    <thead className="bg-surface-container/50 text-left text-xs text-on-surface-variant">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Product</th>
                        <th className="px-3 py-2 font-semibold">Product ID</th>
                        <th className="px-3 py-2 font-semibold">Qty</th>
                        <th className="px-3 py-2 font-semibold">Price</th>
                        <th className="px-3 py-2 font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.items.map((i, idx) => (
                        <tr key={idx} className="border-t border-outline/10">
                          <td className="px-3 py-2">{i.name}</td>
                          <td className="px-3 py-2">
                            <code className="text-xs text-outline">{i.productId || "—"}</code>
                          </td>
                          <td className="px-3 py-2">{i.qty}</td>
                          <td className="px-3 py-2">{money(i.unitPrice)}</td>
                          <td className="px-3 py-2">{money(i.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-outline">
                  No line items recorded (common on Razorpay-synced failures — the
                  gateway does not know the basket).
                </p>
              )}
            </div>
          )}

          {/* Amounts */}
          <Section title="Amounts">
            {a.subtotal != null && <Field label="Subtotal">{money(a.subtotal)}</Field>}
            {a.deliveryCharge != null && (
              <Field label="Delivery charges">{money(a.deliveryCharge)}</Field>
            )}
            {a.gstAdded != null && <Field label="GST">{money(a.gstAdded)}</Field>}
            <Field label="Total amount">
              <span className="font-bold">{money(a.amount)}</span>
            </Field>
          </Section>

          {/* Payment */}
          <Section title="Payment">
            <Field label="Payment ID">
              <code className="break-all text-xs">{a.razorpayPaymentId || "—"}</code>
            </Field>
            <Field label="Razorpay order ID">
              <code className="break-all text-xs">{a.razorpayOrderId}</code>
            </Field>
            <Field label="Status">{BUCKET_LABEL[bucket]}</Field>
            <Field label="Method">{a.method || <span className="text-outline">Not recorded</span>}</Field>
            <Field label="Created">{a.createdAt ? a.createdAt.toLocaleString("en-IN") : "—"}</Field>
            <Field label="Captured">
              {a.paidAt ? (
                a.paidAt.toLocaleString("en-IN")
              ) : (
                <span className="text-outline">—</span>
              )}
            </Field>
            <Field label="Refunded amount">
              {/* Refunds are not tracked on payment attempts today. */}
              <span className="text-outline">Not tracked</span>
            </Field>
          </Section>

          {/* Failure */}
          {bucket !== "paid" && (
            <div className="rounded-xl bg-red-50 p-4">
              <SectionLabel tone="error">Failure / status detail</SectionLabel>
              <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                <Field label="Reason">{reasonOf(a, bucket)}</Field>
                <Field label="Error code">{a.error?.code || "—"}</Field>
                <Field label="Error description">{a.error?.description || "—"}</Field>
                <Field label="Error source">{a.error?.source || "—"}</Field>
                <Field label="Error step">{a.error?.step || "—"}</Field>
                <Field label="Error reason">{a.error?.reason || "—"}</Field>
              </div>
            </div>
          )}

          {/* Platform */}
          <Section title="Platform">
            <Field label="Origin">{PLATFORM_LABEL[platformOf(a)]}</Field>
            <Field label="App / browser detail">
              {/* The client only tags web vs mobile; no OS / UA is stored. */}
              <span className="text-outline">Not recorded</span>
            </Field>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function SectionLabel({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "error";
}) {
  return (
    <p
      className={`mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${
        tone === "error" ? "text-red-700" : "text-outline"
      }`}
    >
      {children}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-outline">{label}</p>
      <div className="mt-0.5 break-words text-on-surface">{children}</div>
    </div>
  );
}
