"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Contact, MapPin, Store, CalendarDays, Route, Clock, Download, Plus } from "lucide-react";
import { fetchAllSessions, type DaySession } from "../../../sales/day-session-service";
import { fetchAllVisitsForExec, type DealerVisit } from "../../../sales/dealers/dealer-visit-service";
import { watchDealersByExec, type Dealer } from "../../../sales/dealers/dealers-service";
import { doc, getDoc, getDocs, collection, query, where, limit } from "firebase/firestore";
import { db } from "../../../firebase";
import DaySessionCard from "../../../../components/sales/DaySessionCard";
import SessionSummary from "../../../../components/sales/SessionSummary";
import VisitTimeline from "../../../../components/sales/VisitTimeline";
import AdminDealerCard from "../../../../components/sales/AdminDealerCard";

import { useAdminAuth } from "../../_context/admin-auth-context";
import { DEALER_STATUSES } from "../../../sales/dealers/dealer-status";
import { fetchNotesByExec } from "../../../sales/dealers/dealer-note-service";
import AdminDealerForm from "../AdminDealerForm";
import { DEALER_TYPES, saveDealer } from "../dealer-management";
import { exportDealers, exportSessions, exportVisits, groupSessionVisits, salesDate, timestampMs } from "../sales-reports";

const sections = [
  { id: "sessions", hash: "daily-sessions", label: "Daily Sessions" },
  { id: "dealers", hash: "dealers-added", label: "Dealers Added" },
  { id: "status", hash: "status", label: "Status" },
] as const;
const controlClass = "rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm";
const buttonClass = `inline-flex items-center gap-1.5 font-semibold disabled:opacity-50 ${controlClass}`;

// RouteMap uses the Google Maps JS SDK — client-only, same as the /sales portal.
const RouteMap = dynamic(() => import("../../../../components/sales/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center rounded-2xl bg-surface-container ring-1 ring-outline/10">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  ),
});

type PageState = "loading" | "ready" | "error";

/** The exec's own user doc: users/{uid} (email accounts), else the doc whose uid matches. */
async function fetchExecUser(execId: string): Promise<Record<string, any> | null> {
  const direct = await getDoc(doc(db, "users", execId));
  if (direct.exists()) return direct.data();
  const byUid = await getDocs(query(collection(db, "users"), where("role", "==", "salesExecutive"), where("uid", "==", execId), limit(1)));
  return byUid.empty ? null : byUid.docs[0].data();
}

type MonthRow = {
  key: string;          // YYYY-MM
  label: string;        // "Sep 2026"
  sessions: number;
  distanceKm: number;
  visits: number;
  workingMinutes: number;
};

function fmtDistance(km: number): string {
  return km > 0 ? `${km.toFixed(1)} km` : "—";
}

function fmtDuration(mins: number): string {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export default function AdminSalesExecActivityPage() {
  const params = useParams();
  const execId = String(params.execId ?? "");
  const identity = useAdminAuth();
  const [canAdd, setCanAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dealerLoadError, setDealerLoadError] = useState("");
  const [dealersReady, setDealersReady] = useState(false);
  const [dealerSearch, setDealerSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const [execName, setExecName] = useState("");
  const [execEmail, setExecEmail] = useState("");
  const [sessions, setSessions] = useState<DaySession[]>([]);
  const [visits, setVisits] = useState<DealerVisit[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [loadError, setLoadError] = useState("");

  const [selected, setSelected] = useState<DaySession | null>(null);
  const [activeSection, setActiveSection] = useState<(typeof sections)[number]["id"]>("sessions");

  useEffect(() => {
    const syncHash = () => {
      setSelected(null);
      setActiveSection(sections.find((section) => `#${section.hash}` === window.location.hash)?.id ?? "sessions");
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [execId]);

  useEffect(() => {
    setDealersReady(false);
    setDealerLoadError("");
    setDealers([]);
    return watchDealersByExec(execId, (records) => {
      setDealers(records);
      setDealersReady(true);
    }, (error) => setDealerLoadError(error.message));
  }, [execId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPageState("loading");
      setLoadError("");
      setCanAdd(false);
      try {
        const [exec, allSessions, allVisits] = await Promise.all([
          fetchExecUser(execId).catch(() => null),
          fetchAllSessions(execId),
          fetchAllVisitsForExec(execId),
        ]);
        if (cancelled) return;
        setExecName(String(exec?.name ?? "").trim());
        setExecEmail(String(exec?.email ?? "").trim());
        setSessions(allSessions);
        setVisits(allVisits);
        setCanAdd(exec?.role === "salesExecutive");
        setPageState("ready");
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load activity.");
        setPageState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [execId]);

  const visitsBySession = useMemo(() => groupSessionVisits(sessions, visits), [sessions, visits]);
  const selectedVisits = selected ? visitsBySession.get(selected.id) ?? [] : [];
  const filteredSessions = sessions.filter((session) => (!from || session.date >= from) && (!to || session.date <= to));
  const filteredVisits = visits.filter((visit) => {
    const date = salesDate(timestampMs(visit.visitedAt) || visit.createdAt);
    return (!from || date >= from) && (!to || date <= to);
  });
  const search = dealerSearch.trim().toLowerCase();
  const searchedDealers = dealers.filter((dealer) =>
    [dealer.shopName, dealer.ownerName, dealer.phone, dealer.address].some((value) => value.toLowerCase().includes(search))
  );
  const statusOptions = Array.from(new Set([
    ...DEALER_STATUSES,
    ...dealers.flatMap((dealer) => dealer.status ? [dealer.status] : []),
    ...(statusFilter && statusFilter !== "status:" ? [statusFilter.slice("status:".length)] : []),
  ]));
  const statusDealers = statusFilter
    ? searchedDealers.filter((dealer) => `status:${dealer.status ?? ""}` === statusFilter)
    : searchedDealers;

  async function exportDealersWithNotes() {
    setExportError("");
    setExporting(true);
    try {
      exportDealers(searchedDealers, "dealers-added", await fetchNotesByExec(execId));
    } catch {
      setExportError("Could not export dealers. Try again.");
    } finally {
      setExporting(false);
    }
  }

  // Monthly performance rolled up from the sessions themselves — no new data.
  const monthly = useMemo<MonthRow[]>(() => {
    const rows = new Map<string, MonthRow>();
    for (const s of sessions) {
      const key = s.date.slice(0, 7); // YYYY-MM
      if (!key || key.length !== 7) continue;
      let row = rows.get(key);
      if (!row) {
        const [y, m] = key.split("-").map(Number);
        row = {
          key,
          label: new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
          sessions: 0, distanceKm: 0, visits: 0, workingMinutes: 0,
        };
        rows.set(key, row);
      }
      row.sessions += 1;
      row.distanceKm += typeof s.totalDistanceKm === "number" ? s.totalDistanceKm : 0;
      row.workingMinutes += typeof s.totalWorkingMinutes === "number" ? s.totalWorkingMinutes : 0;
      row.visits += visitsBySession.get(s.id)?.length ?? 0;
    }
    return Array.from(rows.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [sessions, visitsBySession]);

  const title = execName || execEmail || "Sales Executive";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href="/admin/sales-team"
          aria-label="Back to Sales Team"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-outline-variant/40 text-on-surface hover:bg-surface-container transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Contact className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            <h1 className="text-lg sm:text-2xl font-black text-on-surface truncate">{title}</h1>
          </div>
          {execEmail && execName && (
            <p className="text-xs sm:text-sm text-on-surface-variant ml-7 sm:ml-9 truncate">{execEmail}</p>
          )}
        </div>
      </div>

      {pageState === "loading" && (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {pageState === "error" && (
        <div className="rounded-2xl bg-red-50 px-5 py-4 text-center">
          <p className="text-sm font-semibold text-red-600">{loadError}</p>
        </div>
      )}

      {pageState === "ready" && (
        <>
          {/* ── Session detail drill-in ─────────────────────────────────── */}
          {selected ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sessions
              </button>

              <SessionSummary session={selected} visitCount={selectedVisits.length} />

              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-outline">Route Map</p>
                <RouteMap session={selected} visits={selectedVisits} />
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-outline">Visit Timeline</p>
                  {selectedVisits.length > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      {selectedVisits.length}
                    </span>
                  )}
                </div>
                <VisitTimeline session={selected} visits={selectedVisits} />
              </div>
            </div>
          ) : (
            <>
              {/* ── Monthly performance ─────────────────────────────────── */}
              {monthly.length > 0 && (
                <section>
                  <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                    Monthly Performance
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {monthly.map((m) => (
                      <div key={m.key} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
                        <p className="text-sm font-bold text-on-surface mb-3">{m.label}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <MonthStat icon={<CalendarDays className="h-3.5 w-3.5 text-outline" />} label="Sessions" value={String(m.sessions)} />
                          <MonthStat icon={<Store className="h-3.5 w-3.5 text-outline" />} label="Visits" value={String(m.visits)} />
                          <MonthStat icon={<Route className="h-3.5 w-3.5 text-outline" />} label="Distance" value={fmtDistance(m.distanceKm)} />
                          <MonthStat icon={<Clock className="h-3.5 w-3.5 text-outline" />} label="Working" value={fmtDuration(m.workingMinutes)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <nav aria-label="Executive activity" className="flex flex-wrap gap-4 border-b border-outline-variant/30">
                {sections.map((section) => (
                  <a key={section.id} href={`#${section.hash}`} onClick={() => setActiveSection(section.id)}
                    aria-current={activeSection === section.id ? "page" : undefined}
                    className={`px-1 pb-2 text-sm font-semibold ${activeSection === section.id ? "border-b-2 border-primary text-primary" : "text-on-surface-variant"}`}>
                    {section.label}
                  </a>
                ))}
              </nav>

              {/* ── Sessions list ───────────────────────────────────────── */}
              {activeSection === "sessions" && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="grid gap-1 text-xs font-semibold">From (IST)<input type="date" className={controlClass} value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
                    <label className="grid gap-1 text-xs font-semibold">To (IST)<input type="date" className={controlClass} value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
                    <button type="button" className={buttonClass} disabled={!filteredSessions.length} onClick={() => exportSessions(execId, filteredSessions, visitsBySession)}>
                      <Download className="h-4 w-4" /> Export Sessions CSV
                    </button>
                    <button type="button" className={buttonClass} disabled={!filteredVisits.length} onClick={() => exportVisits(execId, filteredVisits, visitsBySession)}>
                      <Download className="h-4 w-4" /> Export Visits CSV
                    </button>
                  </div>
                  {filteredSessions.length === 0 ? (
                    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-10 text-center">
                      <MapPin className="mx-auto mb-2 h-6 w-6 text-outline" />
                      <p className="text-sm font-semibold text-on-surface">{sessions.length ? "No daily sessions in this date range" : "No daily sessions yet"}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {filteredSessions.map((session) => (
                        <DaySessionCard
                          key={session.id}
                          session={session}
                          visitCount={visitsBySession.get(session.id)?.length ?? 0}
                          onClick={() => setSelected(session)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeSection !== "sessions" && (
                <section className="space-y-4">
                  {dealerLoadError ? (
                    <p role="alert" className="text-sm text-red-700">{dealerLoadError}</p>
                  ) : !dealersReady ? (
                    <p role="status" className="text-sm text-on-surface-variant">Loading dealers…</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="grid gap-1 text-xs font-semibold">Search dealers
                          <input className={controlClass} type="search" value={dealerSearch} onChange={(event) => setDealerSearch(event.target.value)}
                            placeholder="Name, owner, phone or address" />
                        </label>
                        {activeSection === "status" ? (
                          <>
                            <label className="grid gap-1 text-xs font-semibold">Current status
                              <select className={controlClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                                <option value="">All statuses</option>
                                <option value="status:">Not set</option>
                                {statusOptions.map((value) => <option key={value} value={`status:${value}`}>{value}</option>)}
                              </select>
                            </label>
                            <button type="button" className={buttonClass} disabled={!statusDealers.length} onClick={() => exportDealers(statusDealers, "dealer-statuses")}>
                              <Download className="h-4 w-4" /> Export Status CSV
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className={buttonClass} disabled={!searchedDealers.length || exporting} onClick={() => void exportDealersWithNotes()}>
                              <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Dealers CSV"}
                            </button>
                            {canAdd && identity.role === "admin" && !adding && (
                              <button type="button" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white" onClick={() => setAdding(true)}>
                                <Plus className="h-4 w-4" /> Add Dealer
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {exportError && activeSection === "dealers" && <p role="alert" className="text-sm text-red-700">{exportError}</p>}
                      {activeSection === "dealers" && adding && canAdd && identity.role === "admin" && (
                        <AdminDealerForm onClose={() => setAdding(false)} onSave={async (input) => {
                          await saveDealer(identity.uid, execId, input);
                        }} />
                      )}
                      {activeSection === "dealers" && searchedDealers.length > 0 && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {searchedDealers.map((dealer) => <AdminDealerCard key={dealer.id} dealer={dealer} execId={execId} />)}
                        </div>
                      )}
                      {activeSection === "status" && statusDealers.length > 0 && (
                        <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-surface-container-low">
                              <tr>{["Dealer", "Owner", "Phone", "Type", "Current status"].map((heading) =>
                                <th key={heading} scope="col" className="whitespace-nowrap px-4 py-3">{heading}</th>)}</tr>
                            </thead>
                            <tbody>
                              {statusDealers.map((dealer) => (
                                <tr key={dealer.id} className="border-t border-outline-variant/20">
                                  <td className="px-4 py-3">
                                    <Link className="font-semibold text-primary hover:underline" href={`/admin/sales-team/${encodeURIComponent(execId)}/dealers/${encodeURIComponent(dealer.id)}`}>{dealer.shopName}</Link>
                                    <p className="text-xs text-on-surface-variant">{dealer.address}</p>
                                  </td>
                                  <td className="px-4 py-3">{dealer.ownerName || "—"}</td>
                                  <td className="whitespace-nowrap px-4 py-3">{dealer.phone || "—"}</td>
                                  <td className="px-4 py-3">{DEALER_TYPES[dealer.type] ?? dealer.type}</td>
                                  <td className="px-4 py-3"><span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{dealer.status || "Not set"}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {(activeSection === "status" ? statusDealers : searchedDealers).length === 0 && (
                        <p className="rounded-2xl border border-outline-variant/30 px-5 py-8 text-center text-sm">No dealers found.</p>
                      )}
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function MonthStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low px-3 py-2">
      <div className="flex items-center gap-1 mb-0.5">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">{label}</p>
      </div>
      <p className="text-sm font-bold text-on-surface">{value}</p>
    </div>
  );
}
