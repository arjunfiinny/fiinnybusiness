import { downloadCsv, csvCell, safeFilename } from "../_lib/csv";
import type { DaySession } from "../../sales/day-session-service";
import type { Dealer } from "../../sales/dealers/dealers-service";
import type { DealerNote } from "../../sales/dealers/dealer-note-service";
import type { DealerVisit } from "../../sales/dealers/dealer-visit-service";
import { DEALER_TYPES, DEALER_INTERESTS } from "./dealer-management";

type Cell = string | number | null | undefined;

export function exportRows(name: string, headers: string[], rows: Cell[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadCsv(csv, `${safeFilename(name)}-${salesDate(Date.now())}.csv`);
}

export function timestampMs(value: unknown): number {
  if (value instanceof Date) return value.getTime() || 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Date.parse(value) || 0;
  const timestamp = value as { toMillis?: () => number } | null;
  return timestamp?.toMillis?.() ?? 0;
}

const istDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
});

export function salesDate(value: unknown): string {
  const ms = timestampMs(value);
  if (!ms) return "";
  const parts = istDate.formatToParts(ms);
  return ["year", "month", "day"].map((key) => parts.find((part) => part.type === key)?.value).join("-");
}

export function exportTime(value: unknown): string {
  const ms = timestampMs(value);
  return ms ? new Date(ms).toISOString() : "";
}

export function groupSessionVisits(sessions: DaySession[], visits: DealerVisit[]): Map<string, DealerVisit[]> {
  const sessionIds = new Set(sessions.map((session) => session.id));
  const sessionsByDate = new Map<string, DaySession[]>();
  for (const session of sessions) {
    const day = sessionsByDate.get(session.date) ?? [];
    day.push(session);
    sessionsByDate.set(session.date, day);
  }
  for (const day of Array.from(sessionsByDate.values())) {
    day.sort((a, b) => timestampMs(a.startedAt) - timestampMs(b.startedAt) || a.id.localeCompare(b.id));
  }

  const bySession = new Map<string, DealerVisit[]>();
  for (const visit of visits) {
    const time = timestampMs(visit.visitedAt) || timestampMs(visit.createdAt);
    const day = sessionsByDate.get(salesDate(time));
    // Legacy visits have no session ID. Assign each once to the nearest session already started that day.
    const id = visit.daySessionId || (day && ([...day].reverse().find((session) =>
      timestampMs(session.startedAt) <= time)?.id ?? day[0].id));
    if (!id || !sessionIds.has(id)) continue;
    const group = bySession.get(id) ?? [];
    group.push(visit);
    bySession.set(id, group);
  }
  return bySession;
}

export function exportSessions(execId: string, sessions: DaySession[], bySession: Map<string, DealerVisit[]>) {
  exportRows("daily-sessions", [
    "Executive ID", "Session ID", "Date (IST)", "Session status", "Started (UTC)", "Ended (UTC)",
    "Working minutes", "Distance (km)", "Visits", "Start latitude", "Start longitude", "End latitude", "End longitude",
  ], sessions.map((session) => [
    execId, session.id, session.date, session.status, exportTime(session.startedAt), exportTime(session.endedAt),
    session.totalWorkingMinutes, session.totalDistanceKm, bySession.get(session.id)?.length ?? 0,
    session.startGeo.latitude, session.startGeo.longitude, session.endGeo?.latitude, session.endGeo?.longitude,
  ]));
}

export function exportVisits(execId: string, visits: DealerVisit[], bySession: Map<string, DealerVisit[]>) {
  const assigned = new Map<string, string>();
  for (const [sessionId, group] of Array.from(bySession.entries())) {
    for (const visit of group) assigned.set(visit.id, sessionId);
  }
  exportRows("dealer-visits", [
    "Executive ID", "Visit ID", "Session ID", "Dealer ID", "Dealer name at visit", "Visited (UTC)",
    "Visit sequence", "Purpose", "Other purpose", "Dealer status at visit", "Notes", "Latitude", "Longitude",
  ], visits.map((visit) => [
    execId, visit.id, assigned.get(visit.id) ?? visit.daySessionId, visit.dealerId, visit.dealerName,
    exportTime(visit.visitedAt) || exportTime(visit.createdAt), visit.visitSequence, visit.purpose, visit.purposeOther,
    visit.dealerStatus, visit.notes, visit.geo?.latitude, visit.geo?.longitude,
  ]));
}

export function exportDealers(dealers: Dealer[], name: string, notes?: DealerNote[]) {
  const notesByDealer = new Map<string, string[]>();
  for (const note of [...(notes ?? [])].sort((a, b) => timestampMs(a.createdAt) - timestampMs(b.createdAt))) {
    const group = notesByDealer.get(note.dealerId) ?? [];
    group.push(note.note);
    notesByDealer.set(note.dealerId, group);
  }
  exportRows(name, [
    "Executive ID", "Dealer ID", "Dealer name", "Owner name", "Phone", "Address", "Type", "Interest",
    "Current status", "Latitude", "Longitude", "Added (UTC)", "Updated (UTC)", ...(notes ? ["Notes"] : []),
  ], dealers.map((dealer) => [
    dealer.createdBy, dealer.id, dealer.shopName, dealer.ownerName, dealer.phone, dealer.address,
    DEALER_TYPES[dealer.type] ?? dealer.type, dealer.interest && (DEALER_INTERESTS[dealer.interest] ?? dealer.interest),
    dealer.status || "Not set", dealer.geo?.latitude, dealer.geo?.longitude,
    exportTime(dealer.createdAt), exportTime(dealer.updatedAt),
    ...(notes ? [notesByDealer.get(dealer.id)?.join("\n\n")] : []),
  ]));
}
