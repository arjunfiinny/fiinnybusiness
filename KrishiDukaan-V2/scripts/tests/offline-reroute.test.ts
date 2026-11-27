/**
 * Checkout reroute for Karan Arjun Power Plus (app/lib/offline-reroute.ts).
 *
 *   npx tsx scripts/tests/offline-reroute.test.ts
 */
import assert from "node:assert/strict";
import { OFFLINE_REROUTE, rerouteTarget } from "../../app/lib/offline-reroute";

const PP = "MhdOeDTFMn5065FvFeAM";
const NANDGAON = "+918658031942";
const DHANESHWARI = "+917620391466"; // account online, Power Plus listing offline
const SAI = "+919999998157";         // listing online, account online
const NOACC = "+919999990001";       // listing online, account offline

const availability = [
  { storeId: DHANESHWARI, storePhone: DHANESHWARI, isOnline: false, stockLevel: "In Stock" },
  { storeId: "VrHoCzdZebbD4k5PGv9hiMXfKlg2", storePhone: DHANESHWARI, isOnline: false, stockLevel: "In Stock" },
  { storeId: NANDGAON, storePhone: NANDGAON, isOnline: true, stockLevel: "In Stock" },
  { storeId: SAI, storePhone: SAI, isOnline: true, stockLevel: "In Stock" },
  { storeId: NOACC, storePhone: NOACC, isOnline: true, stockLevel: "In Stock" },
];
const onlineAccounts = new Set([NANDGAON, DHANESHWARI, SAI]);
const facts = (sentSeller: string, over: Partial<Parameters<typeof rerouteTarget>[0]> = {}) => ({
  productId: PP, sentSeller, availability, accountOnline: (p: string) => onlineAccounts.has(p), ...over,
});

assert.equal(OFFLINE_REROUTE[PP], NANDGAON);

// Rerouted: Power Plus sent to a store that can't deliver online.
assert.equal(rerouteTarget(facts(DHANESHWARI)), NANDGAON);                 // listing offline (the reported failure)
assert.equal(rerouteTarget(facts("7620391466")), NANDGAON);                // 10-digit form of the same store
assert.equal(rerouteTarget(facts(NOACC)), NANDGAON);                       // listing online, account offline
assert.equal(rerouteTarget(facts("VrHoCzdZebbD4k5PGv9hiMXfKlg2")), NANDGAON); // UID-only seller: server can't verify it

// Left as sent.
assert.equal(rerouteTarget(facts(NANDGAON)), null);                        // already Nandgaon
assert.equal(rerouteTarget(facts("8658031942")), null);                    // Nandgaon, 10-digit
assert.equal(rerouteTarget(facts(SAI)), null);                             // a store that really delivers
assert.equal(rerouteTarget(facts("")), null);                              // no seller: owner resolution unchanged
assert.equal(rerouteTarget(facts(DHANESHWARI, { productId: "someOtherProduct" })), null); // ONLY Power Plus

// Never move an order to a Nandgaon that can't take it (then it fails as before).
const without = (fn: (e: Record<string, unknown>) => Record<string, unknown>) =>
  availability.map((e) => (e.storePhone === NANDGAON ? fn(e) : e));
assert.equal(rerouteTarget(facts(DHANESHWARI, { availability: without((e) => ({ ...e, isOnline: false })) })), null);
assert.equal(rerouteTarget(facts(DHANESHWARI, { availability: without((e) => ({ ...e, stockLevel: "Out of Stock" })) })), null);
assert.equal(rerouteTarget(facts(DHANESHWARI, { availability: availability.filter((e) => e.storePhone !== NANDGAON) })), null);
assert.equal(rerouteTarget(facts(DHANESHWARI, { accountOnline: (p) => p !== NANDGAON && onlineAccounts.has(p) })), null);

// A store listed twice: the checkout's own lookup matches on sellerPhone AND
// sellerId and takes the FIRST matching entry. The reroute must read that same
// entry, so it never moves an order the server would have accepted as sent.
const STORE_UID = "Ab12Cd34Ef56Gh78Ij90Kl12Mn34";
const dup = [
  { storeId: STORE_UID, isOnline: true, stockLevel: "In Stock" },          // matched by sellerId → online
  { storeId: SAI, storePhone: SAI, isOnline: false, stockLevel: "In Stock" }, // matched by phone → offline
  { storeId: NANDGAON, storePhone: NANDGAON, isOnline: true, stockLevel: "In Stock" },
];
assert.equal(rerouteTarget(facts(SAI, { availability: dup, sentSellerIds: [SAI, STORE_UID] })), null); // server finds the online entry
assert.equal(rerouteTarget(facts(SAI, { availability: dup, sentSellerIds: [SAI, SAI] })), NANDGAON);   // only the offline entry is theirs

console.log("offline-reroute: all passed");
