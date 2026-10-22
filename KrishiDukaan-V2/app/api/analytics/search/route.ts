import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/analytics/search
 * Body: { kind: "search", q: string, results?: number, source?: "web" | "app" }
 *    or { kind: "category", category: string, source?: "web" | "app" }
 *
 * Records what shoppers look for, for Admin > Search insights. Each call is
 * ONE merge write into the day's aggregate doc, searchStats/{YYYY-MM-DD}
 * (IST) — no per-search documents, so reading a month back in the admin is
 * at most 31 reads. Clients only call this once a search has settled and
 * dedupe per session, so typing "u", "ur", "ure", "urea" logs just "urea".
 */

const MAX_TERM = 60;
// Per-instance throttle: plenty for a real shopper, stops a script spamming one instance.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const hits = new Map<string, { n: number; at: number }>();

// Unicode-aware (Devanagari etc.); built via RegExp() because tsconfig targets ES5.
const NOT_TERM_CHAR = new RegExp("[^\\p{L}\\p{M}\\p{N}\\s]+", "gu");
const NOT_CATEGORY_CHAR = new RegExp("[^\\p{L}\\p{M}\\p{N}\\s&-]+", "gu");

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > RATE_WINDOW_MS) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { n: 1, at: now });
    return false;
  }
  h.n += 1;
  return h.n > RATE_MAX;
}

/** Lowercase letters/digits (any script) and single spaces — also a safe map key. */
function normalizeTerm(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.'’]/g, "") // "D.A.P." -> "dap"
    .replace(NOT_TERM_CHAR, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TERM)
    .trim();
}

function istDayKey(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return new NextResponse(null, { status: 204 });

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* handled below */ }

  const source = body.source === "app" ? "app" : "web";
  const day = istDayKey();
  const update: Record<string, unknown> = { date: day, updatedAt: FieldValue.serverTimestamp() };

  if (body.kind === "category") {
    const category = String(body.category ?? "").trim().slice(0, MAX_TERM);
    // Category names come from our own chip list; keep them verbatim but map-key safe.
    const key = category.replace(NOT_CATEGORY_CHAR, "").trim();
    if (!key || key.toLowerCase() === "all") return new NextResponse(null, { status: 204 });
    update.categoryTotal = FieldValue.increment(1);
    update.categories = { [key]: FieldValue.increment(1) };
  } else {
    const term = normalizeTerm(body.q);
    if (term.length < 2) return new NextResponse(null, { status: 204 });
    const results = Number(body.results);
    update.total = FieldValue.increment(1);
    update.sources = { [source]: FieldValue.increment(1) };
    update.terms = { [term]: FieldValue.increment(1) };
    if (Number.isFinite(results) && results === 0) {
      update.zeroResults = { [term]: FieldValue.increment(1) };
      update.zeroTotal = FieldValue.increment(1);
    }
  }

  try {
    // set+merge with nested objects treats map keys literally (no dot-path parsing).
    await getAdminDb().collection("searchStats").doc(day).set(update, { merge: true });
  } catch (err) {
    console.error("[analytics/search] write failed", err);
  }
  return new NextResponse(null, { status: 204 });
}
