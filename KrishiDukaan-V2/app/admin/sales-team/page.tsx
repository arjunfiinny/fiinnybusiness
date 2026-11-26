"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Contact, Search, X, Eye, Download } from "lucide-react";
import { collection, getCountFromServer, getDocs, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../../firebase";
import { fetchUsersByRoles } from "../_lib/admin-queries";
import { RefreshButton } from "../_components/refresh-button";
import { exportRows, exportTime, timestampMs } from "./sales-reports";
import { fetchAllVisitsForExec } from "../../sales/dealers/dealer-visit-service";

// ── Types ─────────────────────────────────────────────────────────────────────
type ExecStats = {
  totalVisits: number;
  /** Distinct dealers visited in the last RECENT_DAYS days. */
  dealersVisited: Set<string>;
  dealersCreated: number;
  lastActiveMs: number;
};

type SalesExec = {
  uid: string;
  name: string;
  email: string;
  phone: string;
  createdAtMs: number;
  accountStatus: string;
  stats: ExecStats;
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;

/** Derived status from most-recent activity — there is no status field on the doc. */
function statusOf(lastActiveMs: number): { label: string; cls: string; dot: string } {
  if (!lastActiveMs) return { label: "No activity", cls: "text-on-surface-variant", dot: "bg-gray-300" };
  if (Date.now() - lastActiveMs <= ACTIVE_WINDOW_MS)
    return { label: "Active", cls: "text-green-600", dot: "bg-green-500" };
  return { label: "Idle", cls: "text-amber-600", dot: "bg-amber-400" };
}

export default function AdminSalesTeamPage() {
  const [execs, setExecs] = useState<SalesExec[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataAge, setDataAge] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const since = Timestamp.fromMillis(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
      const [users, recentSnap] = await Promise.all([
        fetchUsersByRoles(["salesExecutive"]),
        getDocs(query(collection(db, "dealerVisits"), where("visitedAt", ">=", since))),
      ]);

      // Distinct dealers visited and last activity from the recent visits.
      const recent = new Map<string, { dealers: Set<string>; lastMs: number }>();
      for (const d of recentSnap.docs) {
        const v = d.data();
        const uid = String(v.salesExecutiveId ?? "");
        if (!uid) continue;
        const r = recent.get(uid) ?? { dealers: new Set<string>(), lastMs: 0 };
        if (v.dealerId) r.dealers.add(String(v.dealerId));
        r.lastMs = Math.max(r.lastMs, timestampMs(v.visitedAt) || timestampMs(v.createdAt));
        recent.set(uid, r);
      }

      // All-time totals per exec are count queries; the last visit is read
      // only for execs with no visit in the recent window.
      const uniqueUsers = new Map(users.map((user) => [String(user.uid || user.id), user]));
      const roster: SalesExec[] = await Promise.all(Array.from(uniqueUsers.entries()).map(async ([uid, u]) => {
        const visits = query(collection(db, "dealerVisits"), where("salesExecutiveId", "==", uid));
        const r = recent.get(uid);
        const [visitCount, dealerCount, lastSnap] = await Promise.all([
          getCountFromServer(visits).then((c) => c.data().count),
          getCountFromServer(query(collection(db, "dealers"), where("createdBy", "==", uid), where("active", "==", true)))
            .then((c) => c.data().count),
          r ? Promise.resolve(null) : getDocs(query(visits, orderBy("visitedAt", "desc"), limit(1))),
        ]);
        const lastDoc = lastSnap?.docs[0]?.data();
        return {
          uid,
          name: String(u.name ?? "").trim(),
          email: String(u.email ?? "").trim(),
          phone: String(u.phone ?? "").trim(),
          createdAtMs: timestampMs(u.createdAt),
          accountStatus: u.isActive === false || u.disabled === true || u.isBlocked === true ? "Inactive" : "Active",
          stats: {
            totalVisits: visitCount,
            dealersVisited: r?.dealers ?? new Set<string>(),
            dealersCreated: dealerCount,
            lastActiveMs: r?.lastMs ?? (lastDoc ? timestampMs(lastDoc.visitedAt) || timestampMs(lastDoc.createdAt) : 0),
          },
        };
      }));

      // Most recently active first, then alphabetical.
      roster.sort((a, b) =>
        b.stats.lastActiveMs - a.stats.lastActiveMs || a.name.localeCompare(b.name),
      );

      setExecs(roster);
      setDataAge(Date.now());
    } catch {
      setLoadError("Could not load the sales team. Refresh to try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return execs;
    return execs.filter((e) => [e.name, e.email, e.phone].join(" ").toLowerCase().includes(q));
  }, [execs, search]);

  async function exportTeam() {
    setExportError("");
    setExporting(true);
    try {
      const rows = [];
      for (let index = 0; index < filtered.length; index += 8) {
        const batch = await Promise.all(filtered.slice(index, index + 8).map(async (exec) => {
          const [visits, dealerDocs] = await Promise.all([
            fetchAllVisitsForExec(exec.uid),
            getDocs(query(collection(db, "dealers"), where("createdBy", "==", exec.uid))),
          ]);
          const visited = new Set(visits.map((visit) => visit.dealerId).filter(Boolean));
          const retailerDocs = dealerDocs.docs.filter((entry) => String(entry.data().type ?? "retailer").toLowerCase() === "retailer");
          return [
            exec.uid, exec.name, exec.email, exec.phone, exec.accountStatus, statusOf(exec.stats.lastActiveMs).label,
            visited.size, retailerDocs.filter((entry) => visited.has(entry.id)).length,
            dealerDocs.size, retailerDocs.length,
            dealerDocs.docs.filter((entry) => entry.data().active === true).length, visits.length,
            exportTime(exec.stats.lastActiveMs), exportTime(exec.createdAtMs),
          ];
        }));
        rows.push(...batch);
      }
      exportRows("sales-team", [
        "Executive ID", "Executive name", "Email", "Phone", "Account status (profile)", "Activity status",
        "Unique dealers visited", "Unique retailers visited", "Dealers added (all time)", "Retailers added (all time)",
        "Active dealers", "Total visits", "Last active (UTC)", "Account created (UTC)",
      ], rows);
    } catch {
      setExportError("Could not export the sales team. Try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <Contact className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-2xl font-black text-on-surface">Sales Team</h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant ml-7 sm:ml-9">
            Field sales executives and their visit activity. Status is derived from recent field activity.
          </p>
        </div>
        <div className="shrink-0">
          <RefreshButton savedAt={dataAge} refreshing={refreshing} onRefresh={handleRefresh} />
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-1 items-center gap-3 bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-2.5">
        <Search className="h-4 w-4 text-outline shrink-0" />
        <input
          type="text"
          placeholder="Search name, email, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="text-outline hover:text-on-surface">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={loading || exporting || !!loadError || filtered.length === 0}
          onClick={() => void exportTeam()}
          className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-semibold disabled:opacity-50">
          <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Sales Team CSV"}
        </button>
        {exportError && <p role="alert" className="text-sm text-red-700">{exportError}</p>}
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <p role="alert" className="text-sm text-red-700">{loadError}</p>
      ) : (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/20 bg-surface-container-low">
            <span className="text-xs font-bold text-on-surface-variant">
              {filtered.length} sales executive{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Executive</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Contact</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Status</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Dealers Visited ({RECENT_DAYS}d)</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Active Dealers Added</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Visits</th>
                  <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const st = statusOf(e.stats.lastActiveMs);
                  return (
                    <tr key={e.uid} className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-on-surface">{e.name || "—"}</p>
                        <p className="text-xs text-on-surface-variant/70">Last active {fmtDate(e.stats.lastActiveMs)}</p>
                      </td>
                      <td className="px-5 py-3 text-xs text-on-surface-variant">
                        {e.email && <p className="truncate">{e.email}</p>}
                        {e.phone && <p className="text-on-surface-variant/70">{e.phone}</p>}
                        {!e.email && !e.phone && "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`flex items-center gap-1 text-xs font-bold ${st.cls}`}>
                          <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-on-surface">{e.stats.dealersVisited.size}</td>
                      <td className="px-5 py-3 text-sm text-on-surface">{e.stats.dealersCreated}</td>
                      <td className="px-5 py-3 text-sm text-on-surface">{e.stats.totalVisits}</td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/admin/sales-team/${encodeURIComponent(e.uid)}`}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" /> View Activity
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-on-surface-variant">No sales executives found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-outline-variant/10">
            {filtered.map((e) => {
              const st = statusOf(e.stats.lastActiveMs);
              return (
                <div key={e.uid} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-on-surface truncate">{e.name || "—"}</p>
                      {e.email && <p className="text-[11px] text-on-surface-variant/70 truncate">{e.email}</p>}
                      {e.phone && <p className="text-[11px] text-on-surface-variant/70 truncate">{e.phone}</p>}
                    </div>
                    <Link
                      href={`/admin/sales-team/${encodeURIComponent(e.uid)}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1 text-[11px] font-medium text-on-surface hover:bg-surface-container shrink-0"
                    >
                      <Eye className="h-3 w-3" /> View Activity
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`flex items-center gap-1 text-[11px] font-bold ${st.cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                    <span className="text-[11px] text-on-surface-variant">{e.stats.dealersVisited.size} visited ({RECENT_DAYS}d)</span>
                    <span className="text-[11px] text-on-surface-variant">{e.stats.dealersCreated} active dealers</span>
                    <span className="text-[11px] text-on-surface-variant">{e.stats.totalVisits} visits</span>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-on-surface-variant">No sales executives found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
