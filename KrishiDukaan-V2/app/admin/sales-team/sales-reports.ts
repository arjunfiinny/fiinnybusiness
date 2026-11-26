import { downloadCsv, csvCell, safeFilename } from "../_lib/csv";
import { salesDate, timestampMs } from "./sales-activity";

type Cell = string | number | null | undefined;

export function exportRows(name: string, headers: string[], rows: Cell[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadCsv(csv, `${safeFilename(name)}-${salesDate(Date.now())}.csv`);
}

export function exportTime(value: unknown): string {
  const ms = timestampMs(value);
  return ms ? new Date(ms).toISOString() : "";
}
