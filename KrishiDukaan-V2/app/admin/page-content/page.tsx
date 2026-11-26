"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, FileText, ImagePlus, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, storage } from "../../firebase";
import { compressImage, imageUploadMetadata } from "../../utils/compressImage";
import { LIMITS, pageContentWords, type PageContent, type PageFaq } from "../../lib/seo/page-content";

/**
 * Product page content: the longer description, FAQs and photos the team adds
 * to a product page (api/admin/product-page-content).
 *
 * It is stored apart from the product, so the seller's listing never changes,
 * and Remove puts the page back exactly as the seller's listing shows it.
 * Only products that can be ordered online with delivery are listed.
 */

type Row = {
  id: string;
  name: string;
  category: string;
  slug: string;
  image: string;
  onlineSellers: number;
  listingWords: number;
  hasContent: boolean;
  addedWords: number;
  faqCount: number;
  photoCount: number;
  updatedAt: number | null;
};

const EMPTY: PageContent = { description: "", faqs: [], images: [] };
const TARGET_WORDS = 300;

/** What a farmer looks for, by kind of product: shown above the editor as a checklist. */
function guideFor(category: string): string[] {
  const c = category.toLowerCase();
  if (/herbicide/.test(c)) return ["Active ingredient and %", "Weeds it controls", "Pre- or post-emergence", "Dose per acre", "Crops it is safe on", "When not to spray"];
  if (/insecticide|fungicide|pesticide|protector/.test(c)) return ["Active ingredient and %", "Pests or diseases it controls", "Dose per acre or per litre", "Crops", "Waiting period before harvest", "How to spray, safety"];
  if (/fertili/.test(c)) return ["Nutrient grade (e.g. 19:19:19)", "How to apply: foliar, drip or soil", "Dose per acre", "Crop stage", "Crops", "What it improves"];
  if (/seed/.test(c)) return ["Variety, hybrid or OPV", "Season: Kharif or Rabi", "Maturity in days", "Seed rate per acre", "Best regions", "Yield and quality"];
  if (/bio/.test(c)) return ["Key ingredients", "What it does for the crop", "Dose", "Growth stage", "Crops", "Mixing with other sprays"];
  return ["What it is", "What it is used for", "How to use it", "Who it suits", "Pack sizes", "Care and safety"];
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export default function AdminPageContentPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);

  const loadList = async () => {
    setLoading(true);
    setListError(null);
    try {
      const body = await api<{ products: Row[] }>("/api/admin/product-page-content?list=1");
      setRows(body.products);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load the products.");
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadList(); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!onlyMissing || !r.hasContent));
  }, [rows, search, onlyMissing]);
  const done = rows.filter((r) => r.hasContent).length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-on-surface flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" aria-hidden /> Product page content
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant max-w-2xl">
            Add a fuller description, FAQs and photos to the product pages farmers and Google see. The seller&apos;s own
            listing is never changed, and Remove takes your content off again. Only products with online delivery are listed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadList()}
          className="inline-flex items-center gap-2 rounded-xl border border-surface-container px-3 py-2 text-sm font-bold hover:bg-surface-container-low"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden /> Refresh
        </button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* Product list */}
        <section className="rounded-2xl border border-surface-container bg-white min-w-0">
          <div className="p-3 border-b border-surface-container space-y-2">
            <div className="flex items-center gap-2 rounded-xl border border-surface-container px-3 py-2">
              <Search className="h-4 w-4 text-on-surface-variant" aria-hidden />
              <input
                id="page-content-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products"
                aria-label="Search products"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-on-surface-variant">
              <label className="inline-flex items-center gap-2 font-semibold">
                <input id="page-content-missing" type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
                Only products without content
              </label>
              <span>{done} of {rows.length} done</span>
            </div>
          </div>
          {listError ? (
            <p className="p-4 text-sm text-red-600">{listError}</p>
          ) : loading && rows.length === 0 ? (
            <p className="p-4 text-sm text-on-surface-variant">Loading products with online delivery…</p>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto divide-y divide-surface-container">
              {visible.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-surface-container-low ${selected?.id === r.id ? "bg-lime-50" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.image} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover bg-surface-container" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-on-surface">{r.name}</span>
                      <span className="block text-xs text-on-surface-variant">
                        {r.category} · {r.onlineSellers} online seller{r.onlineSellers === 1 ? "" : "s"} · {r.listingWords + r.addedWords} words on page
                      </span>
                    </span>
                    <span
                      className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${
                        r.hasContent ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {r.hasContent ? "Added" : "To do"}
                    </span>
                  </button>
                </li>
              ))}
              {visible.length === 0 ? <li className="p-4 text-sm text-on-surface-variant">No products match.</li> : null}
            </ul>
          )}
        </section>

        {/* Editor */}
        <section className="rounded-2xl border border-surface-container bg-white p-4 sm:p-5 min-w-0">
          {selected ? (
            <Editor
              key={selected.id}
              row={selected}
              onSaved={(patch) => {
                setRows((rs) => rs.map((r) => (r.id === selected.id ? { ...r, ...patch } : r)));
              }}
            />
          ) : (
            <div className="text-sm text-on-surface-variant">
              <p className="font-bold text-on-surface">Pick a product on the left.</p>
              <p className="mt-2">
                Start with the products marked &quot;To do&quot; that have the most online sellers: those pages get the most
                visits. Aim for about {TARGET_WORDS} words and 4–6 FAQs per product.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Editor({ row, onSaved }: { row: Row; onSaved: (patch: Partial<Row>) => void }) {
  const [content, setContent] = useState<PageContent>(EMPTY);
  const [hadContent, setHadContent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const body = await api<{ content: PageContent | null }>(
          `/api/admin/product-page-content?productId=${encodeURIComponent(row.id)}`,
        );
        if (!live) return;
        setContent(body.content ?? EMPTY);
        setHadContent(!!body.content);
      } catch (e) {
        if (live) setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not load this product's content." });
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [row.id]);

  const words = pageContentWords(content);
  const total = row.listingWords + words;
  const setFaq = (i: number, patch: Partial<PageFaq>) =>
    setContent((c) => ({ ...c, faqs: c.faqs.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const body = await api<{ content: PageContent; addedWords: number }>("/api/admin/product-page-content", {
        method: "POST",
        body: JSON.stringify({ productId: row.id, ...content }),
      });
      setContent(body.content);
      setHadContent(true);
      onSaved({ hasContent: true, addedWords: body.addedWords, faqCount: body.content.faqs.length, photoCount: body.content.images.length });
      setMessage({ ok: true, text: "Saved. The product page shows it within a few minutes." });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/admin/product-page-content?productId=${encodeURIComponent(row.id)}`, { method: "DELETE" });
      setContent(EMPTY);
      setHadContent(false);
      setConfirmRemove(false);
      onSaved({ hasContent: false, addedWords: 0, faqCount: 0, photoCount: 0 });
      setMessage({ ok: true, text: "Removed. The page shows only the seller's listing again." });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not remove." });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) { setMessage({ ok: false, text: "Choose an image file." }); return; }
    if (content.images.length >= LIMITS.images) { setMessage({ ok: false, text: `Up to ${LIMITS.images} photos.` }); return; }
    setUploading(true);
    setMessage(null);
    try {
      const small = await compressImage(file);
      const path = `product-images/page-content/${row.id}/${Date.now()}-${small.name.replace(/\s+/g, "_")}`;
      const snap = await uploadBytes(storageRef(storage, path), small, imageUploadMetadata(small));
      const url = await getDownloadURL(snap.ref);
      setContent((c) => ({ ...c, images: [...c.images, url] }));
      setMessage({ ok: true, text: "Photo added. Save to put it on the page." });
    } catch {
      setMessage({ ok: false, text: "Upload failed. Try again." });
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <p className="text-sm text-on-surface-variant">Loading {row.name}…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-on-surface">{row.name}</h2>
          <p className="text-xs text-on-surface-variant">
            {row.category} · listing has {row.listingWords} words · you are adding {words}
          </p>
        </div>
        <a
          href={`/products/${row.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-surface-container px-3 py-1.5 text-xs font-bold text-primary hover:bg-surface-container-low"
        >
          View page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>

      <div className="rounded-xl bg-surface-container-low p-3">
        <div className="flex items-center justify-between text-xs font-bold text-on-surface">
          <span>Words on the page</span>
          <span>{total} / {TARGET_WORDS}</span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-white overflow-hidden" aria-hidden>
          <div className="h-full bg-primary" style={{ width: `${Math.min(100, (total / TARGET_WORDS) * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">Cover: {guideFor(row.category).join(" · ")}</p>
      </div>

      <div>
        <label htmlFor="page-content-description" className="text-sm font-black text-on-surface">Description</label>
        <p className="text-xs text-on-surface-variant">Shown under the seller&apos;s description. Leave a blank line between paragraphs. Write facts from the label, not claims you cannot check.</p>
        <textarea
          id="page-content-description"
          rows={10}
          value={content.description}
          maxLength={LIMITS.description}
          onChange={(e) => setContent((c) => ({ ...c, description: e.target.value }))}
          className="mt-2 w-full rounded-xl border border-surface-container px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <p className="text-right text-[11px] text-on-surface-variant">{content.description.length}/{LIMITS.description}</p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-on-surface">FAQs</span>
          <button
            type="button"
            disabled={content.faqs.length >= LIMITS.faqs}
            onClick={() => setContent((c) => ({ ...c, faqs: [...c.faqs, { q: "", a: "" }] }))}
            className="inline-flex items-center gap-1 rounded-lg border border-surface-container px-2 py-1 text-xs font-bold disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add FAQ
          </button>
        </div>
        <p className="text-xs text-on-surface-variant">Questions farmers ask: dose, mixing, which crops, waiting period. Google and AI answers can quote these.</p>
        <div className="mt-2 space-y-3">
          {content.faqs.map((f, i) => (
            <div key={i} className="rounded-xl border border-surface-container p-3 space-y-2">
              <div className="flex items-start gap-2">
                <input
                  id={`page-content-faq-q-${i}`}
                  value={f.q}
                  maxLength={LIMITS.question}
                  onChange={(e) => setFaq(i, { q: e.target.value })}
                  placeholder="Question"
                  aria-label={`FAQ ${i + 1} question`}
                  className="w-full rounded-lg border border-surface-container px-2.5 py-1.5 text-sm font-semibold outline-none focus:border-primary"
                />
                <button
                  type="button"
                  aria-label={`Delete FAQ ${i + 1}`}
                  onClick={() => setContent((c) => ({ ...c, faqs: c.faqs.filter((_, j) => j !== i) }))}
                  className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-low"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <textarea
                id={`page-content-faq-a-${i}`}
                rows={3}
                value={f.a}
                maxLength={LIMITS.answer}
                onChange={(e) => setFaq(i, { a: e.target.value })}
                placeholder="Answer"
                aria-label={`FAQ ${i + 1} answer`}
                className="w-full rounded-lg border border-surface-container px-2.5 py-1.5 text-sm outline-none focus:border-primary"
              />
            </div>
          ))}
          {content.faqs.length === 0 ? <p className="text-xs text-on-surface-variant">No FAQs yet.</p> : null}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-on-surface">Extra photos</span>
          <button
            type="button"
            disabled={uploading || content.images.length >= LIMITS.images}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-lg border border-surface-container px-2 py-1 text-xs font-bold disabled:opacity-40"
          >
            <ImagePlus className="h-3.5 w-3.5" aria-hidden /> {uploading ? "Uploading…" : "Add photo"}
          </button>
          <input
            ref={fileRef}
            id="page-content-photo"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }}
          />
        </div>
        <p className="text-xs text-on-surface-variant">Back label (dose and composition), pack sizes, the product in use. Shown after the listing&apos;s own photo.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {content.images.map((url) => (
            <div key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover border border-surface-container" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => setContent((c) => ({ ...c, images: c.images.filter((u) => u !== url) }))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 shadow border border-surface-container"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      </div>

      {message ? (
        <p className={`text-sm font-semibold ${message.ok ? "text-green-700" : "text-red-600"}`} role="status">{message.text}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-surface-container pt-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save to page"}
        </button>
        {hadContent ? (
          confirmRemove ? (
            <>
              <span className="text-sm text-on-surface">Take all of this off the page?</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Yes, remove
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)} className="px-3 py-2.5 text-sm font-bold text-on-surface-variant">
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Remove from page
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
