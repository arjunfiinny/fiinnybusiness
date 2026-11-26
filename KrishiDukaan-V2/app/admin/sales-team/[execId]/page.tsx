"use client";

/**
 * Sales Team → single executive activity (read-only overview + dealer edit/delete).
 *
 * Four hash-based tabs:
 *   #monthly-performance (default)
 *   #daily-sessions
 *   #dealers-added
 *   #status
 *
 * Sessions and visits feed the reports. A live dealer query reflects Sales App updates.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Contact, Plus } from "lucide-react";
import { doc, getDoc, getDocs, collection, query, where, limit } from "firebase/firestore";
import { db } from "../../../firebase";
import { fetchAllSessions, type DaySession } from "../../../sales/day-session-service";
import { fetchAllVisitsForExec, type DealerVisit } from "../../../sales/dealers/dealer-visit-service";
import { watchDealersByExec, type Dealer } from "../../../sales/dealers/dealers-service";
import { ExecDetailTabs, useHashTab } from "./_components/ExecDetailTabs";
import { MonthlyPerformanceTab, type MonthRow } from "./_components/MonthlyPerformanceTab";
import { DailySessionsTab } from "./_components/DailySessionsTab";
import { DealersTab } from "./_components/DealersTab";
import { StatusTab } from "./_components/StatusTab";

import { useAdminAuth } from "../../_context/admin-auth-context";
import AdminDealerForm from "../AdminDealerForm";
import { saveDealer } from "../dealer-management";
import { groupSessionVisits } from "../sales-activity";

type PageState = "loading" | "ready" | "error";

async function fetchExecUser(execId: string): Promise<Record<string, any> | null> {
  const direct = await getDoc(doc(db, "users", execId));
  if (direct.exists()) return direct.data();
  const byUid = await getDocs(query(collection(db, "users"), where("role", "==", "salesExecutive"), where("uid", "==", execId), limit(1)));
  return byUid.empty ? null : byUid.docs[0].data();
}

export default function AdminSalesExecActivityPage() {
  const params = useParams();
  const execId = String(params.execId ?? "");
  const identity = useAdminAuth();
  const [canAdd, setCanAdd] = useState(false);
  const [adding, setAdding] = useState(false);

  const [execName, setExecName] = useState("");
  const [execEmail, setExecEmail] = useState("");
  const [sessions, setSessions] = useState<DaySession[]>([]);
  const [visits, setVisits] = useState<DealerVisit[]>([]);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [loadError, setLoadError] = useState("");

  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [dealersLoaded, setDealersLoaded] = useState(false);
  const [dealerError, setDealerError] = useState("");

  const [activeTab, setActiveTab] = useHashTab();

  // Load sessions + visits upfront (needed for default Monthly Performance tab)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPageState("loading");
      setLoadError("");
      setCanAdd(false);
      setAdding(false);
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

  useEffect(() => {
    setDealers([]);
    setDealersLoaded(false);
    setDealerError("");
    return watchDealersByExec(execId, (records) => {
      setDealers(records);
      setDealersLoaded(true);
    }, (error) => setDealerError(error.message));
  }, [execId]);

  const visitsBySession = useMemo(() => groupSessionVisits(sessions, visits), [sessions, visits]);
  const monthly = useMemo<MonthRow[]>(() => {
    const rows = new Map<string, MonthRow>();
    for (const s of sessions) {
      const key = s.date.slice(0, 7);
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

  const handleDealerUpdated = (dealerId: string, updated: Dealer | null) => {
    setDealers((prev) =>
      updated == null
        ? prev.filter((d) => d.id !== dealerId)
        : prev.map((d) => d.id === dealerId ? updated : d),
    );
  };

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
          <ExecDetailTabs
            sessionCount={sessions.length}
            dealerCount={dealersLoaded ? dealers.length : null}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

          <div>
            {activeTab === "monthly-performance" && (
              <MonthlyPerformanceTab monthly={monthly} />
            )}

            {activeTab === "daily-sessions" && (
              <DailySessionsTab
                sessions={sessions}
                visitsBySession={visitsBySession}
                execId={execId}
              />
            )}

            {(activeTab === "dealers-added" || activeTab === "status") && dealerError && (
              <p role="alert" className="text-sm text-red-700">{dealerError}</p>
            )}
            {(activeTab === "dealers-added" || activeTab === "status") && !dealersLoaded && !dealerError && (
              <div className="flex h-40 items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {activeTab === "dealers-added" && dealersLoaded && !dealerError && canAdd && identity.role === "admin" && (
              <div className="mb-4">
                {adding ? (
                  <AdminDealerForm onClose={() => setAdding(false)} onSave={async (input) => {
                    await saveDealer(identity.uid, execId, input);
                  }} />
                ) : (
                  <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white">
                    <Plus className="h-4 w-4" /> Add Dealer
                  </button>
                )}
              </div>
            )}
            {activeTab === "dealers-added" && dealersLoaded && !dealerError && (
              <DealersTab
                dealers={dealers}
                execId={execId}
                execName={title}
                onDealerUpdated={handleDealerUpdated}
              />
            )}

            {activeTab === "status" && dealersLoaded && !dealerError && (
              <StatusTab
                dealers={dealers}
                execName={title}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
