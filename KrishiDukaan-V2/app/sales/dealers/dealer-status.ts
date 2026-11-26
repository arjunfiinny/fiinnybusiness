export const DEALER_STATUSES = [
  "Pitching", "Interested", "Ongoing", "Pending", "Completed", "Closed", "Not Interested",
] as const;

export function normalizeDealerStatus(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const status = raw.trim().replace(/\s+/g, " ");
  const key = status.toLowerCase() === "notinterested" ? "not interested" : status.toLowerCase();
  return DEALER_STATUSES.find((preset) => preset.toLowerCase() === key) ?? status;
}
