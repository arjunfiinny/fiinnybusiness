import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../../../../lib/firebase-admin";
import { requireSection } from "../../../../../../lib/admin-auth";
import { writeAuditLog, auditMeta } from "../../../../../../lib/audit-log-service";
import { csvCell } from "../../../../../../admin/_lib/csv";

import { groupSessionVisits, salesDate, timestampMs } from "../../../../../../admin/sales-team/sales-activity";
import { normalizeDealerStatus } from "../../../../../../sales/dealers/dealer-status";

type Params = { params: { execId: string } };

export const dynamic = "force-dynamic";

function formatTs(ts: FirebaseFirestore.Timestamp | undefined | null): string {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function fmtDuration(mins: number | undefined): string {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// GET /api/admin/sales-team/[execId]/sessions/csv?type=sessions|dealer-wise&from=&to=
export async function GET(req: NextRequest, { params }: Params) {
  const caller = await requireSection(req, "salesTeam");
  if (caller instanceof NextResponse) return caller;

  const { execId } = params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "sessions";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const db = getAdminDb();

  const execDoc = await db.collection("users").doc(execId).get().catch(() => null);
  const execName = String(execDoc?.data()?.name ?? execDoc?.data()?.email ?? execId);

  const [sessionsSnap, visitsSnap] = await Promise.all([
    db.collection("daySessions").where("salesExecutiveId", "==", execId).orderBy("date", "asc").get(),
    db.collection("dealerVisits").where("salesExecutiveId", "==", execId).get(),
  ]);
  const sessions = sessionsSnap.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, date: String(data.date ?? ""), startedAt: data.startedAt, data };
  });
  const visits = visitsSnap.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, daySessionId: data.daySessionId, visitedAt: data.visitedAt ?? data.createdAt, data };
  }).sort((a, b) => timestampMs(a.visitedAt) - timestampMs(b.visitedAt));
  const sessionsInRange = sessions.filter(({ date }) => (!from || date >= from) && (!to || date <= to));
  const bySession = groupSessionVisits(sessions, visits);

  const actorDoc = await db.collection("users").doc(caller.uid).get().catch(() => null);
  const actorName = String(actorDoc?.data()?.name ?? actorDoc?.data()?.email ?? caller.uid);
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = execName.replace(/[\s/\\:*?"<>|]+/g, "_").slice(0, 40);

  if (type === "dealer-wise") {
    // Dealer-wise sessions CSV: one row per dealer visit per session
    // Joins: dealerVisits + dealers collections
    const byVisitId = new Map<string, string>();
    for (const [sessionId, entries] of Array.from(bySession)) {
      for (const entry of entries) byVisitId.set(entry.id, sessionId);
    }
    const visitsInRange = visits.filter((visit) => {
      const date = salesDate(visit.visitedAt);
      return (!from || date >= from) && (!to || date <= to);
    });

    // Collect all dealer IDs from visits
    const dealerIds = Array.from(new Set(visitsInRange.map((visit) => String(visit.data.dealerId ?? "")))).filter(Boolean);

    // Fetch dealer details for type, interest, ownerName, phone
    const dealerMap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < dealerIds.length; i += 30) {
      const chunk = dealerIds.slice(i, i + 30);
      const dSnap = await db.collection("dealers").where("__name__", "in", chunk).get();
      for (const dd of dSnap.docs) {
        if (dd.data().createdBy === execId) dealerMap.set(dd.id, dd.data());
      }
    }

    const headers = [
      "Date (IST)", "Visit ID", "Session ID", "Dealer ID", "Dealer Name at Visit", "Owner Name", "Phone",
      "Visit Time (IST)", "Dealer Type", "Status at Visit", "Current Status", "Interest", "Purpose", "Notes", "Latitude", "Longitude",
    ];
    const rows: string[] = [headers.map(csvCell).join(",")];

    const interestMap: Record<string, string> = {
      low: "Low", considering: "Considering", veryInterested: "Very Interested",
    };
    for (const visit of visitsInRange) {
      const vd = visit.data;
      const sessionId = byVisitId.get(visit.id) ?? visit.daySessionId ?? "";
      const date = salesDate(visit.visitedAt);
      const dealer = dealerMap.get(String(vd.dealerId ?? "")) ?? {};
      rows.push([
        csvCell(date),
        csvCell(visit.id),
        csvCell(sessionId),
        csvCell(vd.dealerId),
        csvCell(vd.dealerName),
        csvCell(String(dealer.ownerName ?? "")),
        csvCell(String(dealer.phone ?? "")),
        csvCell(formatTs(visit.visitedAt)),
        csvCell(String(dealer.type ?? "retailer")),
        csvCell(normalizeDealerStatus(vd.dealerStatus)),
        csvCell(normalizeDealerStatus(dealer.status)),
        csvCell(interestMap[String(dealer.interest ?? "")] ?? String(dealer.interest ?? "")),
        csvCell(vd.purpose === "Other" ? String(vd.purposeOther ?? "Other") : String(vd.purpose ?? "")),
        csvCell(vd.notes),
        csvCell(vd.geo?.latitude),
        csvCell(vd.geo?.longitude),
      ].join(","));
    }

    const csv = rows.join("\r\n");
    const filename = `${safeName}_dealer_wise_sessions_${dateStr}.csv`;
    const rowCount = visitsInRange.length;

    await writeAuditLog({
      actorId: caller.uid,
      actorName,
      actorRole: actorDoc?.data()?.role ?? "admin",
      action: "EXPORT",
      module: "sales_team",
      entityType: "dealer_visit",
      entityId: execId,
      entityName: `${execName} — dealer-wise sessions CSV`,
      before: null,
      after: { rowCount, from: from ?? null, to: to ?? null },
      ...auditMeta(req),
    });

    return new NextResponse("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const headers = [
    "Session ID", "Date (IST)", "Status", "Start Time (IST)", "End Time (IST)", "Duration",
    "Visits Count", "Distance (km)", "Start Latitude", "Start Longitude", "End Latitude", "End Longitude",
  ];
  const rows: string[] = [headers.map(csvCell).join(",")];
  for (const session of sessionsInRange) {
    const sd = session.data;
    rows.push([
      csvCell(session.id), csvCell(session.date), csvCell(sd.status),
      csvCell(formatTs(sd.startedAt)), csvCell(formatTs(sd.endedAt)),
      csvCell(fmtDuration(sd.totalWorkingMinutes)), csvCell(bySession.get(session.id)?.length ?? 0),
      csvCell(typeof sd.totalDistanceKm === "number" ? sd.totalDistanceKm.toFixed(2) : ""),
      csvCell(sd.startGeo?.latitude), csvCell(sd.startGeo?.longitude),
      csvCell(sd.endGeo?.latitude), csvCell(sd.endGeo?.longitude),
    ].join(","));
  }

  const csv = rows.join("\r\n");
  const filename = `${safeName}_sessions_${dateStr}.csv`;

  await writeAuditLog({
    actorId: caller.uid,
    actorName,
    actorRole: actorDoc?.data()?.role ?? "admin",
    action: "EXPORT",
    module: "sales_team",
    entityType: "day_session",
    entityId: execId,
    entityName: `${execName} — sessions CSV`,
    before: null,
    after: { rowCount: sessionsInRange.length, from: from ?? null, to: to ?? null },
    ...auditMeta(req),
  });

  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
