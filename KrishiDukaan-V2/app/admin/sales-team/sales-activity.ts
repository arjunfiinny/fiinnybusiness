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

type SessionKey = { id: string; date: string; startedAt?: unknown };
type VisitKey = { daySessionId?: string; visitedAt?: unknown; createdAt?: unknown };

export function groupSessionVisits<T extends VisitKey>(sessions: SessionKey[], visits: T[]): Map<string, T[]> {
  const sessionIds = new Set(sessions.map((session) => session.id));
  const sessionsByDate = new Map<string, SessionKey[]>();
  for (const session of sessions) {
    const day = sessionsByDate.get(session.date) ?? [];
    day.push(session);
    sessionsByDate.set(session.date, day);
  }
  for (const day of Array.from(sessionsByDate.values())) {
    day.sort((a, b) => timestampMs(a.startedAt) - timestampMs(b.startedAt) || a.id.localeCompare(b.id));
  }

  const bySession = new Map<string, T[]>();
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
