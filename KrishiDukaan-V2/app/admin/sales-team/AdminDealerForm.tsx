"use client";

import { useState, type FormEvent } from "react";
import { DEALER_STATUSES, normalizeDealerStatus } from "../../sales/dealers/dealer-status";
import type { Dealer } from "../../sales/dealers/dealers-service";
import { DEALER_TYPES, DEALER_INTERESTS, type AdminDealerInput } from "./dealer-management";

const inputClass = "w-full rounded-xl border border-outline-variant/50 bg-white px-3 py-2 text-sm";

export default function AdminDealerForm({ initial, onSave, onClose }: {
  initial?: Dealer;
  onSave: (input: AdminDealerInput) => Promise<void>;
  onClose: () => void;
}) {
  const [shopName, setShopName] = useState(initial?.shopName ?? "");
  const [ownerName, setOwnerName] = useState(initial?.ownerName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [type, setType] = useState(initial?.type ?? "retailer");
  const [interest, setInterest] = useState(initial?.interest ?? "");
  const [status, setStatus] = useState(initial?.status ?? (initial ? "" : "Pitching"));
  const [lat, setLat] = useState(initial?.geo?.latitude?.toString() ?? "");
  const [lng, setLng] = useState(initial?.geo?.longitude?.toString() ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const latitude = Number(lat);
    const longitude = Number(lng);
    const hasLocation = Boolean(lat.trim() || lng.trim());
    const cleanStatus = normalizeDealerStatus(status);
    if (!shopName.trim() || (!initial && (!ownerName.trim() || !address.trim()))) {
      setError("Enter the dealer name, owner and address.");
      return;
    }
    if (phone.trim() !== initial?.phone && !/^\+?\d{7,15}$/.test(phone.replace(/[\s()-]/g, ""))) {
      setError("Enter a valid contact number.");
      return;
    }
    if (hasLocation && (!lat.trim() || !lng.trim() ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180)) {
      setError("Enter a valid latitude and longitude, or leave both blank.");
      return;
    }
    if (cleanStatus.length > 50 || ((!initial || initial.status) && !cleanStatus)) {
      setError("Enter a dealer status of up to 50 characters.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        shopName, ownerName, phone, address, type, interest, status: cleanStatus, note,
        geo: hasLocation ? { lat: latitude, lng: longitude } : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the dealer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-4 sm:p-5">
      <h2 className="font-bold">{initial ? "Edit Dealer" : "Add Dealer"}</h2>
      <fieldset disabled={saving} className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="space-y-1">Dealer name<input required className={inputClass} value={shopName} onChange={(event) => setShopName(event.target.value)} /></label>
        <label className="space-y-1">Owner name<input required={!initial} className={inputClass} value={ownerName} onChange={(event) => setOwnerName(event.target.value)} /></label>
        <label className="space-y-1">Phone<input required={!initial} type="tel" className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label className="space-y-1">Dealer type
          <select className={inputClass} value={type} onChange={(event) => setType(event.target.value)}>
            {!Object.hasOwn(DEALER_TYPES, type) && <option value={type}>{type}</option>}
            {Object.entries(DEALER_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1">Dealer interest
          <select className={inputClass} value={interest} onChange={(event) => setInterest(event.target.value)}>
            <option value="">Not set</option>
            {interest && !Object.hasOwn(DEALER_INTERESTS, interest) && <option value={interest}>{interest}</option>}
            {Object.entries(DEALER_INTERESTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1">Status
          <input list="sales-dealer-statuses" maxLength={50} className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)} placeholder="Choose or type a status" />
          <datalist id="sales-dealer-statuses">
            {DEALER_STATUSES.map((choice) => <option key={choice} value={choice} />)}
          </datalist>
        </label>
        <label className="space-y-1 sm:col-span-2">Address<textarea required={!initial} className={inputClass} rows={2} value={address} onChange={(event) => setAddress(event.target.value)} /></label>
        <label className="space-y-1">Latitude<input type="number" step="any" min={-90} max={90} className={inputClass} value={lat} onChange={(event) => setLat(event.target.value)} /></label>
        <label className="space-y-1">Longitude<input type="number" step="any" min={-180} max={180} className={inputClass} value={lng} onChange={(event) => setLng(event.target.value)} /></label>
        {!initial && <label className="space-y-1 sm:col-span-2">Note <span className="text-on-surface-variant">(optional)</span><textarea className={inputClass} rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></label>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Save Dealer"}</button>
      </div>
    </form>
  );
}
