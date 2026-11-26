export const DEALER_STATUSES = [
  "Pitching", "Interested", "Ongoing", "Pending", "Completed", "Closed", "Not Interested",
] as const;

export function normalizeDealerStatus(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const status = raw.trim().replace(/\s+/g, " ");
  const key = status.toLowerCase() === "notinterested" ? "not interested" : status.toLowerCase();
  return DEALER_STATUSES.find((preset) => preset.toLowerCase() === key) ?? status;
}


// Keep the upstream form API while using the same values as the Sales App.
export const PREDEFINED_STATUSES = DEALER_STATUSES;
export type PredefinedStatus = (typeof PREDEFINED_STATUSES)[number];
export const STATUS_LABELS = Object.fromEntries(DEALER_STATUSES.map((status) => [status, status]));
export const STATUS_COLORS: Record<PredefinedStatus, string> = {
  Pitching: "bg-blue-100 text-blue-700",
  Interested: "bg-green-100 text-green-700",
  Ongoing: "bg-amber-100 text-amber-700",
  Pending: "bg-orange-100 text-orange-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Closed: "bg-slate-100 text-slate-600",
  "Not Interested": "bg-red-100 text-red-600",
};
export const STATUS_NEUTRAL = "bg-purple-100 text-purple-700";

export function statusLabel(status: string | undefined): string {
  return normalizeDealerStatus(status) || "—";
}

export function statusColor(status: string | undefined): string {
  const key = normalizeDealerStatus(status) as PredefinedStatus;
  if (!key) return "bg-surface-container text-on-surface-variant";
  return Object.hasOwn(STATUS_COLORS, key) ? STATUS_COLORS[key] : STATUS_NEUTRAL;
}
