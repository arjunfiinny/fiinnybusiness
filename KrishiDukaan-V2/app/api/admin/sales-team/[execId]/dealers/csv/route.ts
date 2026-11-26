import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../../../../lib/firebase-admin";
import { requireSection } from "../../../../../../lib/admin-auth";
import { writeAuditLog, auditMeta } from "../../../../../../lib/audit-log-service";
import { csvCell } from "../../../../../../admin/_lib/csv";

import { normalizeDealerStatus } from "../../../../../../sales/dealers/dealer-status";
import { salesDate, timestampMs } from "../../../../../../admin/sales-team/sales-activity";
import { matchesSearch } from "../../../../../../admin/sales-team/dealer-search";

type Params = { params: { execId: string } };

const HEADERS = [
  "Dealer ID", "Dealer/Shop Name", "Owner Name", "Phone", "Address", "Latitude", "Longitude",
  "Dealer Type", "Current Status", "Dealer Interest", "Notes",
  "Added By (Executive)", "Added On", "Updated On",
];

function formatTimestamp(ts: FirebaseFirestore.Timestamp | undefined | null): string {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

export const dynamic = "force-dynamic";

// GET /api/admin/sales-team/[execId]/dealers/csv
// Server-side dealers CSV. Query params: from=YYYY-MM-DD, to=YYYY-MM-DD
export async function GET(req: NextRequest, { params }: Params) {
  const caller = await requireSection(req, "salesTeam");
  if (caller instanceof NextResponse) return caller;

  const { execId } = params;
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const search = url.searchParams.get("q") ?? "";

  const db = getAdminDb();

  // Fetch exec name for the filename and audit log
  const execDoc = await db.collection("users").doc(execId).get().catch(() => null);
  const execName = String(execDoc?.data()?.name ?? execDoc?.data()?.email ?? execId);

  // Fetch active dealers for this exec.
  // No composite index exists for createdBy + active + orderBy(createdAt), so
  // we fetch without orderBy and date-filter/sort in memory.
  const snap = await db
    .collection("dealers")
    .where("createdBy", "==", execId)
    .where("active", "==", true)
    .get();

  const docs = snap.docs.filter((doc) => {
    const data = doc.data();
    const date = salesDate(data.createdAt);
    if ((from || to) && (!date || (from && date < from) || (to && date > to))) return false;
    return matchesSearch({
      shopName: String(data.shopName ?? ""), ownerName: String(data.ownerName ?? ""),
      phone: String(data.phone ?? ""), address: String(data.address ?? ""),
      status: normalizeDealerStatus(data.status),
    }, search);
  }).sort((a, b) => timestampMs(a.data().createdAt) - timestampMs(b.data().createdAt));

  const notesByDealer = new Map<string, string[]>();
  const dealerIds = docs.map((doc) => doc.id);
  for (let index = 0; index < dealerIds.length; index += 30) {
    const chunk = dealerIds.slice(index, index + 30);
    const notes = await db.collection("dealerNotes").where("dealerId", "in", chunk).get();
    const ordered = notes.docs.sort((a, b) => timestampMs(a.data().createdAt) - timestampMs(b.data().createdAt));
    for (const note of ordered) {
      const data = note.data();
      if (data.salesExecutiveId !== execId) continue;
      const id = String(data.dealerId);
      const entries = notesByDealer.get(id) ?? [];
      entries.push(String(data.note ?? ""));
      notesByDealer.set(id, entries);
    }
  }

  const rows: string[] = [HEADERS.map(csvCell).join(",")];

  for (const d of docs) {
    const data = d.data();
    const geo = data.geo as { latitude?: number; longitude?: number } | null;
    const ts = data.createdAt as FirebaseFirestore.Timestamp | undefined;

    const interestMap: Record<string, string> = {
      low: "Low",
      considering: "Considering",
      veryInterested: "Very Interested",
    };

    rows.push([
      csvCell(d.id),
      csvCell(data.shopName),
      csvCell(data.ownerName),
      csvCell(data.phone),
      csvCell(data.address),
      csvCell(geo?.latitude ?? ""),
      csvCell(geo?.longitude ?? ""),
      csvCell(String(data.type ?? "retailer")),
      csvCell(normalizeDealerStatus(data.status)),
      csvCell(interestMap[String(data.interest ?? "")] ?? String(data.interest ?? "")),
      csvCell(notesByDealer.get(d.id)?.join("\n\n")),
      csvCell(execName),
      csvCell(formatTimestamp(ts)),
      csvCell(formatTimestamp(data.updatedAt)),
    ].join(","));
  }

  const csv = rows.join("\r\n");
  const bom = "﻿";
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = execName.replace(/[\s/\\:*?"<>|]+/g, "_").slice(0, 40);
  const filename = `${safeName}_dealers_${dateStr}.csv`;

  // Audit log — EXPORT action
  const actorDoc = await db.collection("users").doc(caller.uid).get().catch(() => null);
  const actorName = String(actorDoc?.data()?.name ?? actorDoc?.data()?.email ?? caller.uid);
  await writeAuditLog({
    actorId: caller.uid,
    actorName,
    actorRole: actorDoc?.data()?.role ?? "admin",
    action: "EXPORT",
    module: "sales_team",
    entityType: "dealer",
    entityId: execId,
    entityName: `${execName} — dealers CSV`,
    before: null,
    after: { rowCount: docs.length, from: from ?? null, to: to ?? null },
    ...auditMeta(req),
  });

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
