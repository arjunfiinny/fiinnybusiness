/**
 * Client side of Admin > Search insights (app/api/analytics/search).
 *
 * A search is logged only once it has SETTLED (no new term for SETTLE_MS), so
 * typing "u", "ur", "urea" records just "urea"; each term and category is
 * logged at most once per browser session. Fire-and-forget with keepalive, so
 * it never blocks the UI and survives navigating to a product right away.
 */

const SETTLE_MS = 1500;
const SESSION_KEY = "kd_logged_searches";

let pending: ReturnType<typeof setTimeout> | null = null;
let logged: Set<string> | null = null;

function loggedSet(): Set<string> {
  if (logged) return logged;
  try {
    logged = new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "[]"));
  } catch {
    logged = new Set();
  }
  return logged;
}

function markLogged(key: string): boolean {
  const set = loggedSet();
  if (set.has(key)) return false;
  set.add(key);
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(Array.from(set).slice(-100)));
  } catch {
    /* private mode — the in-memory set still dedupes this tab */
  }
  return true;
}

function send(body: Record<string, unknown>): void {
  try {
    void fetch("/api/analytics/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, source: "web" }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never break search */
  }
}

/** Call when the first page of results for [query] has loaded. */
export function scheduleSearchLog(query: string, results: number): void {
  if (pending) clearTimeout(pending);
  const q = query.trim().toLowerCase();
  if (q.length < 2) return;
  pending = setTimeout(() => {
    pending = null;
    if (markLogged(`q:${q}`)) send({ kind: "search", q, results });
  }, SETTLE_MS);
}

/** Call when the shopper picks a category to browse. */
export function logCategoryBrowse(category: string): void {
  const c = category.trim();
  if (!c || c.toLowerCase() === "all") return;
  if (markLogged(`c:${c.toLowerCase()}`)) send({ kind: "category", category: c });
}
