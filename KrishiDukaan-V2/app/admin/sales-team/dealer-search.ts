import { normalizeDealerStatus } from "../../sales/dealers/dealer-status";

type DealerSearchFields = { shopName: string; ownerName: string; phone: string; address: string; status?: string };

function normalizePhone(p: string): string {
  return p.replace(/[\s\+\-]/g, "").replace(/^91/, "");
}

/** Case-insensitive match across shop name, owner, phone, address, status. */
export function matchesSearch(dealer: DealerSearchFields, raw: string): boolean {
  if (!raw.trim()) return true;
  const q = raw.trim().toLowerCase();
  if (dealer.shopName.toLowerCase().includes(q)) return true;
  if (dealer.ownerName.toLowerCase().includes(q)) return true;
  if (dealer.address.toLowerCase().includes(q)) return true;
  if (dealer.status && dealer.status.toLowerCase().includes(q)) return true;
  if (normalizeDealerStatus(dealer.status).toLowerCase().includes(q)) return true;
  const normQ = normalizePhone(q);
  if (normQ && normalizePhone(dealer.phone).includes(normQ)) return true;
  return false;
}
