/**
 * UTF-8 BOM (﻿) is prepended so Excel opens Marathi/Hindi/Gujarati
 * text correctly on Windows without a manual import wizard.
 */

/** Escape quotes and neutralize formula prefixes in text fields. */
export function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const s = typeof value === "string" && /^(?:\s*[=+\-@]|[\t\r\n])/.test(raw) ? "'" + raw : raw;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Trigger a browser download of [csv] as a UTF-8 BOM CSV file.
 * Only call in browser context ("use client" components or onClick handlers).
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Safe name fragment for filenames — replaces spaces/slashes with underscores. */
export function safeFilename(name: string): string {
  return name.trim().replace(/[\s/\\:*?"<>|]+/g, "_").slice(0, 60) || "export";
}
