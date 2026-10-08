import { getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

/** Shapes and calls for /api/admin/route-payouts, shared by the Seller payments tabs. */

export type Summary = Record<string, { count: number; amount: number }>;

export type TransferRow = {
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
  timeline: Record<string, unknown>;
};

export type SellerRow = {
  phone: string;
  collection: string;
  businessName: string;
  razorpayAccountId: string;
  routeStatus: string;
};

export type PayoutsResponse = {
  summary: Summary;
  sellers: SellerRow[];
  settings: { releaseEnabled: boolean; holdTransfers: boolean };
  canEdit: boolean;
  transfers: TransferRow[];
  nextCursor: string | null;
};

async function authHeader(): Promise<Record<string, string>> {
  const token = await getAuth().currentUser?.getIdToken();
  return { Authorization: `Bearer ${token ?? ""}` };
}

export async function fetchPayouts(params: { state?: string; cursor?: string | null; q?: string }): Promise<PayoutsResponse> {
  const qs = new URLSearchParams();
  qs.set("state", params.state ?? "all");
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.q) qs.set("q", params.q);
  const res = await fetch(`/api/admin/route-payouts?${qs}`, { headers: await authHeader() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Could not load seller payments.");
  return json as PayoutsResponse;
}

async function post(body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch("/api/admin/route-payouts", {
    method: "POST",
    headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed.");
  return json;
}

export const releaseOrder = (orderId: string) => post({ action: "release", orderId });
export const setReleaseEnabled = (enabled: boolean) => post({ action: "setReleaseEnabled", enabled });

/** Ask Razorpay now: the given orders, or every followed order due within a day. */
export async function checkWithRazorpay(orderIds?: string[]) {
  const call = httpsCallable<{ orderIds?: string[] }, { checked: number; changed: number; errors: number }>(
    getFunctions(getApp()),
    "syncPayoutsNow",
  );
  return (await call(orderIds ? { orderIds } : {})).data;
}

export const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmt = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

export const cap = (s: string | null) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");

export const STATE_META: Record<string, { label: string; cls: string }> = {
  needs_action: { label: "Delivered, still held", cls: "bg-red-50 text-red-700" },
  on_hold: { label: "On hold", cls: "bg-amber-50 text-amber-800" },
  scheduled: { label: "Release scheduled", cls: "bg-blue-50 text-blue-700" },
  processing: { label: "On the way to bank", cls: "bg-indigo-50 text-indigo-700" },
  settled: { label: "Settled", cls: "bg-green-50 text-green-700" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-700" },
  reversed: { label: "Reversed", cls: "bg-surface-container text-on-surface-variant" },
  not_routed: { label: "Not on Route", cls: "bg-surface-container text-on-surface-variant" },
  checking: { label: "Checking…", cls: "bg-surface-container text-on-surface-variant" },
};

export const needsAction = (r: TransferRow) => r.state === "on_hold" && r.orderStatus === "delivered";
