"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Phone, MapPin, Store, StickyNote } from "lucide-react";
import { watchDealer, type Dealer } from "../../../../../sales/dealers/dealers-service";
import { watchNotesForDealer, writeDealerNote, type DealerNote } from "../../../../../sales/dealers/dealer-note-service";
import DealerImagePreviewModal from "../../../../../../components/sales/DealerImagePreviewModal";

import { useAdminAuth } from "../../../../_context/admin-auth-context";
import AdminDealerForm from "../../../AdminDealerForm";
import {
  DEALER_TYPES, DEALER_INTERESTS, saveDealer, removeDealer, watchStatusHistory, type DealerStatusChange,
} from "../../../dealer-management";

type PageState = "loading" | "ready" | "not-found" | "error";
type NotesState = "loading" | "ready" | "error";

function fmtNoteTime(ts: unknown): string {
  if (!ts || typeof (ts as any).toDate !== "function") return "";
  const d = (ts as any).toDate();
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })} · ${d.toLocaleTimeString(
    "en-IN",
    { hour: "2-digit", minute: "2-digit", hour12: true },
  )}`;
}

export default function AdminDealerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const identity = useAdminAuth();
  const canManage = identity.role === "admin";
  const execId = String(params.execId ?? "");
  const dealerId = String(params.dealerId ?? "");

  const backHref = `/admin/sales-team/${encodeURIComponent(execId)}#dealers-added`;
  const [editing, setEditing] = useState<Dealer | null>(null);
  const [actionError, setActionError] = useState("");
  const [working, setWorking] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ id?: string; text: string } | null>(null);
  const [history, setHistory] = useState<DealerStatusChange[]>([]);
  const [historyError, setHistoryError] = useState(false);

  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [loadError, setLoadError] = useState("");

  const [notes, setNotes] = useState<DealerNote[]>([]);
  const [notesState, setNotesState] = useState<NotesState>("loading");

  const [imgFailed, setImgFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    return watchDealer(dealerId, (record) => {
      const visible = record?.active && record.createdBy === execId ? record : null;
      setDealer(visible);
      setPageState(visible ? "ready" : "not-found");
    }, (error) => {
      setLoadError(error.message);
      setPageState("error");
    });
  }, [dealerId, execId]);

  const visibleDealerId = dealer?.id;
  useEffect(() => {
    if (!visibleDealerId) return;
    const stopNotes = watchNotesForDealer(visibleDealerId, (records) => {
      setNotes(records);
      setNotesState("ready");
    }, () => setNotesState("error"));
    const stopStatus = watchStatusHistory(visibleDealerId, setHistory, () => setHistoryError(true));
    return () => { stopNotes(); stopStatus(); };
  }, [visibleDealerId]);

  async function perform(action: () => Promise<void>) {
    setActionError("");
    setWorking(true);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save changes.");
    } finally {
      setWorking(false);
    }
  }

  const hasImage = Boolean(dealer?.imageUrl) && !imgFailed;
  const location = dealer?.geo;

  const handleMaps = () => {
    if (!dealer?.geo) return;
    const { latitude, longitude } = dealer.geo;
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      "_blank",
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href={backHref}
          aria-label="Back to View Activity"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-outline-variant/40 text-on-surface hover:bg-surface-container transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Store className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            <h1 className="text-lg sm:text-2xl font-black text-on-surface truncate">
              {pageState === "ready" && dealer ? dealer.shopName : "Dealer Details"}
            </h1>
          </div>
        </div>
      </div>

      {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}

      {canManage && pageState === "ready" && dealer && (
        editing ? (
          <AdminDealerForm initial={editing} onClose={() => setEditing(null)} onSave={async (input) => {
            await saveDealer(identity.uid, execId, input, editing);
          }} />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={working} onClick={() => setEditing(dealer)} className="rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-semibold">Edit Dealer</button>
            <button type="button" disabled={working} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700" onClick={() => {
              if (!window.confirm(`Remove ${dealer.shopName} from active dealers? Previous visits and sessions will remain in the activity history.`)) return;
              void perform(async () => {
                await removeDealer(dealer, identity.uid);
                router.push(backHref);
              });
            }}>Remove Dealer</button>
          </div>
        )
      )}

      {pageState === "loading" && (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {pageState === "not-found" && (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-10 text-center">
          <Store className="mx-auto mb-2 h-6 w-6 text-outline" />
          <p className="text-sm font-semibold text-on-surface">Dealer not found</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            This dealer may have been removed.
          </p>
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white transition active:scale-95"
          >
            Back to View Activity
          </button>
        </div>
      )}

      {pageState === "error" && (
        <div className="rounded-2xl bg-red-50 px-5 py-4 text-center">
          <p className="text-sm font-semibold text-red-600">{loadError}</p>
        </div>
      )}

      {pageState === "ready" && dealer && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Image */}
            {hasImage && (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="block w-full overflow-hidden rounded-2xl ring-1 ring-outline/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={dealer.imageUrl}
                  alt={`${dealer.shopName} shop photo`}
                  onError={() => setImgFailed(true)}
                  className="w-full max-h-96 object-contain bg-surface-container"
                />
              </button>
            )}

            {/* Contact */}
            <section>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Contact
              </p>
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest divide-y divide-outline-variant/20">
                <InfoRow icon={<Phone className="h-4 w-4 text-outline" />} label="Phone" value={dealer.phone || "—"} />
                <InfoRow icon={<MapPin className="h-4 w-4 text-outline" />} label="Address" value={dealer.address || "—"} />
                <InfoRow icon={<Store className="h-4 w-4 text-outline" />} label="Owner" value={dealer.ownerName || "—"} />
              </div>
            </section>

            {/* Notes */}
            <section>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Notes {notes.length > 0 && `(${notes.length})`}
              </p>
              {canManage && !noteDraft && (
                <button type="button" disabled={working} onClick={() => setNoteDraft({ text: "" })}
                  className="mb-3 rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-semibold">Add Note</button>
              )}
              {canManage && noteDraft && (
                <form className="mb-3 space-y-2" onSubmit={(event) => {
                  event.preventDefault();
                  if (working || !noteDraft.text.trim()) return;
                  void perform(async () => {
                    await writeDealerNote(execId, dealer.id, noteDraft.text, noteDraft.id);
                    setNoteDraft(null);
                  });
                }}>
                  <label className="block space-y-1 text-sm font-semibold">
                    {noteDraft.id ? "Edit note" : "New note"}
                    <textarea required disabled={working} rows={3} value={noteDraft.text}
                      onChange={(event) => setNoteDraft({ ...noteDraft, text: event.target.value })}
                      className="w-full rounded-xl border border-outline-variant/40 p-3 text-sm font-normal" />
                  </label>
                  <div className="flex gap-2">
                    <button disabled={working} type="submit" className="rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white">Save Note</button>
                    <button disabled={working} type="button" onClick={() => setNoteDraft(null)} className="rounded-xl border border-outline-variant/40 px-3 py-2 text-sm">Cancel</button>
                  </div>
                </form>
              )}
              {notesState === "loading" && (
                <div className="flex h-24 items-center justify-center">
                  <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {notesState === "error" && (
                <div className="rounded-2xl bg-red-50 px-5 py-4 text-center">
                  <p className="text-sm font-semibold text-red-600">Could not load notes.</p>
                </div>
              )}
              {notesState === "ready" && notes.length === 0 && (
                <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-8 text-center">
                  <StickyNote className="mx-auto mb-2 h-5 w-5 text-outline" />
                  <p className="text-sm font-semibold text-on-surface">No notes yet</p>
                </div>
              )}
              {notesState === "ready" && notes.length > 0 && (
                <div className="space-y-2">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-2xl border border-outline-variant/30 bg-white px-4 py-3"
                    >
                      <p className="text-sm text-on-surface whitespace-pre-wrap">{n.note}</p>
                      <p className="mt-2 text-[11px] text-outline">{fmtNoteTime(n.createdAt)}</p>
                      {canManage && n.salesExecutiveId === execId && (
                        <div className="mt-2 flex gap-3 text-xs font-semibold">
                          <button disabled={working} type="button" className="text-primary" onClick={() => setNoteDraft({ id: n.id, text: n.note })}>Edit Note</button>
                          <button disabled={working} type="button" className="text-red-700" onClick={() => {
                            if (window.confirm("Delete this note?")) void perform(async () => {
                              await writeDealerNote(execId, dealer.id, null, n.id);
                              if (noteDraft?.id === n.id) setNoteDraft(null);
                            });
                          }}>Delete Note</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            {/* Type + Interest */}
            <section>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Dealer Type
              </p>
              <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                {DEALER_TYPES[dealer.type] ?? dealer.type}
              </span>
            </section>

            <section>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Dealer Interest
              </p>
              {dealer.interest ? (
                <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  {DEALER_INTERESTS[dealer.interest] ?? dealer.interest}
                </span>
              ) : (
                <span className="inline-block rounded-full bg-surface-container px-3 py-1 text-xs font-bold text-outline">
                  Not set
                </span>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-on-surface-variant">Current Status</h2>
              <p className="text-sm font-semibold">{dealer.status || "Not set"}</p>
              {historyError && <p className="mt-2 text-sm text-red-700">Could not load status history.</p>}
              {history.length > 0 && (
                <ul aria-label="Status history" className="mt-3 space-y-2 text-sm">
                  {history.map((event) => (
                    <li key={event.id} className="rounded-xl bg-surface-container-low p-3">
                      <p>{event.from ? `${event.from} → ` : ""}{event.to}</p>
                      <p className="text-xs text-on-surface-variant">
                        {event.source === "VISIT" ? "Visit" : event.source === "CREATED" ? "Dealer added" : "Dealer update"} · {fmtNoteTime(event.changedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Location */}
            <section>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Location
              </p>
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
                {location ? (
                  <>
                    <p className="text-xs text-on-surface-variant mb-3">
                      {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                    </p>
                    <button
                      type="button"
                      onClick={handleMaps}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-outline-variant/40 py-2 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      View on Maps
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-outline">No location saved</p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {previewOpen && dealer?.imageUrl && (
        <DealerImagePreviewModal
          imageUrl={dealer.imageUrl}
          dealerName={dealer.shopName}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-on-surface break-words">{value}</p>
      </div>
    </div>
  );
}
