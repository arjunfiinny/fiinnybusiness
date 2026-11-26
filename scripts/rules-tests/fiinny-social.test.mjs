// Firestore-rules proof for Fiinny friends / splits / groups / sharing / ads.
// Each "ok" case replays the exact writes the app makes (FriendService,
// ExpenseService, GroupService, PartnerService); each "deny" case is an abuse
// the rules must still block.
//
// Run (from C:\lifemap):
//   firebase emulators:exec --only firestore --project demo-fiinny-rules \
//     "node scripts/rules-tests/fiinny-social.test.mjs"
//
// Uses @firebase/rules-unit-testing + firebase from KARANARJUNKSKPVTLTD/node_modules
// (override with RULES_TEST_NODE_MODULES=<dir containing node_modules>).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const modsRoot = process.env.RULES_TEST_NODE_MODULES
  || path.join(repo, 'KARANARJUNKSKPVTLTD');
const require = createRequire(path.join(modsRoot, 'package.json'));
const {
  initializeTestEnvironment, assertSucceeds, assertFails,
} = require('@firebase/rules-unit-testing');
const {
  doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where,
  writeBatch, runTransaction, serverTimestamp,
} = require('firebase/firestore');

const A = '+919000000001'; // registered
const B = '+919000000002'; // registered, A's friend
const C = '+919000000003'; // registered stranger
const D = '+919000000004'; // invited, signs up later
const E = '+919000000005'; // registered, not in group

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const env = await initializeTestEnvironment({
  projectId: 'demo-fiinny-rules',
  firestore: { rules: readFileSync(process.env.RULES_FILE || path.join(repo, 'firestore.rules'), 'utf8'), host, port: Number(port) },
});

const as = (phone) => env.authenticatedContext(`uid-${phone.slice(-2)}`, { phone_number: phone }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const pairId = (a, b) => [a, b].sort().join('__');

let pass = 0; const failures = [];
async function ok(name, fn) {
  try { await assertSucceeds(fn()); pass++; console.log(`  ok    ${name}`); }
  catch (e) { failures.push(name); console.log(`  FAIL  ${name}\n        expected allow: ${e.message?.split('\n')[0]}`); }
}
async function deny(name, fn) {
  try { await assertFails(fn()); pass++; console.log(`  ok    ${name} (denied)`); }
  catch (e) { failures.push(name); console.log(`  FAIL  ${name}\n        expected deny: ${e.message?.split('\n')[0]}`); }
}

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const p of [A, B, C, E]) await setDoc(doc(db, 'users', p), { phone: p, name: `User ${p.slice(-1)}` });
});

// ---------------------------------------------------------------- friends
console.log('Friends: A adds registered B (addFriendByPhone)');
{
  const db = as(A);
  await ok('own friend doc', () => setDoc(doc(db, `users/${A}/friends/${B}`), { phone: B, name: 'Bee', avatar: '👤' }, { merge: true }));
  await ok('friend_links create', () => setDoc(doc(db, `friend_links/${A}_${B}`), { inviterPhone: A, friendPhone: B, inviterName: 'Bee', status: 'pending', createdAt: serverTimestamp() }, { merge: true }));
  await ok('pair + both mirrors (batch)', () => {
    const b = writeBatch(db);
    b.set(doc(db, `friends_pairs/${pairId(A, B)}`), { a: A, b: B, createdAt: serverTimestamp() }, { merge: true });
    b.set(doc(db, `users/${A}/friends/${B}`), { phone: B, name: 'Bee', avatar: '👤', source: 'pair' }, { merge: true });
    b.set(doc(db, `users/${B}/friends/${A}`), { phone: A, name: 'User 1', avatar: '👤', source: 'pair' }, { merge: true });
    return b.commit();
  });
  await ok('links marked active', async () => {
    await setDoc(doc(db, `friend_links/${A}_${B}`), { status: 'active', claimedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(db, `friend_links/${B}_${A}`), { status: 'active', claimedAt: serverTimestamp() }, { merge: true });
  });
  await ok('A reads its own entry in B\'s list', () => getDoc(doc(db, `users/${B}/friends/${A}`)));
}
console.log('Friends: abuse');
await deny('C writes itself into B\'s list without listing B', () => setDoc(doc(as(C), `users/${B}/friends/${C}`), { phone: C, name: 'x' }));
await deny('C writes A\'s entry into B\'s list (impersonation)', () => setDoc(doc(as(C), `users/${B}/friends/${A}`), { phone: A, name: 'x' }));
await deny('C reads B\'s friend list', () => getDocs(collection(as(C), `users/${B}/friends`)));
await deny('C reads A_B invite', () => getDoc(doc(as(C), `friend_links/${A}_${B}`)));
await deny('C writes A_B invite', () => setDoc(doc(as(C), `friend_links/${A}_${B}`), { status: 'active' }, { merge: true }));
await deny('A forges invite with wrong inviterPhone', () => setDoc(doc(as(A), `friend_links/${A}_${C}`), { inviterPhone: C, friendPhone: A }));
await deny('C creates pair A__B', () => setDoc(doc(as(C), `friends_pairs/${pairId(A, B)}`), { a: A, b: B }));
await deny('unauthenticated writes a pair', () => setDoc(doc(anon(), `friends_pairs/${pairId(A, B)}`), { a: A, b: B }));

console.log('Friends: A invites unregistered D, D signs up (claimPendingFor)');
await ok('A adds D + invite', async () => {
  const db = as(A);
  await setDoc(doc(db, `users/${A}/friends/${D}`), { phone: D, name: 'Dee' }, { merge: true });
  await setDoc(doc(db, `friend_links/${A}_${D}`), { inviterPhone: A, friendPhone: D, inviterName: 'Dee', status: 'pending' }, { merge: true });
});
await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users', D), { phone: D, name: 'User 4' }));
await ok('D queries its pending invites', () => getDocs(query(collection(as(D), 'friend_links'), where('friendPhone', '==', D), where('status', '==', 'pending'))));
await ok('D claims: pair + both mirrors + links (batch)', () => {
  const db = as(D);
  const b = writeBatch(db);
  b.set(doc(db, `friends_pairs/${pairId(A, D)}`), { a: A, b: D }, { merge: true });
  b.set(doc(db, `users/${A}/friends/${D}`), { phone: D, name: 'User 4', avatar: '👤', source: 'claimed' }, { merge: true });
  b.set(doc(db, `users/${D}/friends/${A}`), { phone: A, name: 'User 1', avatar: '👤', source: 'claimed' }, { merge: true });
  b.update(doc(db, `friend_links/${A}_${D}`), { status: 'active', claimedAt: serverTimestamp() });
  b.set(doc(db, `friend_links/${D}_${A}`), { status: 'active', claimedAt: serverTimestamp() }, { merge: true });
  return b.commit();
});

console.log('Friends: repair of a one-sided friendship (repairMutualLinks)');
await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `users/${E}/friends/${C}`), { phone: C, name: 'Cee' }));
await ok('E reads pair (missing) and its entry in C\'s list (missing)', async () => {
  const db = as(E);
  await getDoc(doc(db, `friends_pairs/${pairId(C, E)}`));
  await getDoc(doc(db, `users/${C}/friends/${E}`));
});
await ok('E creates pair + its entry in C\'s list', () => {
  const db = as(E);
  const b = writeBatch(db);
  b.set(doc(db, `friends_pairs/${pairId(C, E)}`), { a: E, b: C }, { merge: true });
  b.set(doc(db, `users/${C}/friends/${E}`), { phone: E, name: 'User 5', avatar: '👤', source: 'repair' });
  return b.commit();
});

// ---------------------------------------------------------------- splits
console.log('Splits: A splits with friend B');
const split = { id: 'e1', amount: 300, payerId: A, friendIds: [B], groupId: null, date: new Date() };
await ok('A writes own copy', () => setDoc(doc(as(A), `users/${A}/expenses/e1`), split));
await ok('A writes B\'s copy (customSplits mirror)', () => setDoc(doc(as(A), `users/${B}/expenses/e1`), { ...split, amount: 150, friendIds: [A] }));
await ok('A updates B\'s copy', () => setDoc(doc(as(A), `users/${B}/expenses/e1`), { ...split, amount: 120, friendIds: [A] }));
await ok('A writes B copy tagged mirroredFrom=A (push sender)', () => setDoc(doc(as(A), `users/${B}/expenses/e1m`), { ...split, friendIds: [A], mirroredFrom: A }));
await deny('A spoofs mirroredFrom=C on B copy', () => setDoc(doc(as(A), `users/${B}/expenses/e1s`), { ...split, friendIds: [A], mirroredFrom: C }));
await ok('A deletes a copy that was never written', () => deleteDoc(doc(as(A), `users/${B}/expenses/never-mirrored`)));
await deny('A writes a PERSONAL (unshared) expense into B', () => setDoc(doc(as(A), `users/${B}/expenses/p1`), { amount: 9, friendIds: [], groupId: null }));
await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `users/${B}/expenses/own1`), { amount: 50, friendIds: [], groupId: null }));
await deny('A overwrites B\'s personal expense', () => setDoc(doc(as(A), `users/${B}/expenses/own1`), { amount: 1, friendIds: [A] }));
await deny('A deletes B\'s personal expense', () => deleteDoc(doc(as(A), `users/${B}/expenses/own1`)));
await deny('stranger C writes into B\'s ledger', () => setDoc(doc(as(C), `users/${B}/expenses/x1`), { amount: 9, friendIds: [C] }));
await deny('friend A reads B\'s ledger', () => getDocs(collection(as(A), `users/${B}/expenses`)));
await ok('A deletes B\'s split copy', () => deleteDoc(doc(as(A), `users/${B}/expenses/e1`)));

// ---------------------------------------------------------------- groups
console.log('Groups: A creates group with B and C (GroupService.addGroup)');
const members = [A, B, C];
await ok('group doc + every member\'s mirror (batch)', () => {
  const db = as(A);
  const b = writeBatch(db);
  b.set(doc(db, 'groups/g1'), { id: 'g1', name: 'Trip', memberPhones: members, createdBy: A });
  for (const m of members) b.set(doc(db, `users/${m}/groups/g1`), { id: 'g1', name: 'Trip', memberPhones: members }, { merge: true });
  return b.commit();
});
const gexp = { id: 'e2', amount: 900, payerId: A, friendIds: [B, C], groupId: 'g1' };
await ok('A writes group split into C (not A\'s friend)', () => setDoc(doc(as(A), `users/${C}/expenses/e2`), gexp));
await ok('A writes group_expenses copy', () => setDoc(doc(as(A), 'group_expenses/e2'), gexp));
await ok('A writes groups/g1/expenses copy', () => setDoc(doc(as(A), 'groups/g1/expenses/e2'), gexp));
await ok('B reads groups/g1/expenses', () => getDocs(collection(as(B), 'groups/g1/expenses')));
// (E is C's friend after the repair scenario, so use B: E neither lists B nor is in g1.)
await deny('non-member E writes into member B with groupId g1', () => setDoc(doc(as(E), `users/${B}/expenses/e3`), { ...gexp, id: 'e3' }));
await deny('non-member E writes groups/g1/expenses', () => setDoc(doc(as(E), 'groups/g1/expenses/e9'), gexp));
await deny('non-member E reads group_expenses/e2', () => getDoc(doc(as(E), 'group_expenses/e2')));
await deny('non-member E mirrors g1 into C', () => setDoc(doc(as(E), `users/${C}/groups/g1`), { id: 'g1' }));

// ---------------------------------------------------------------- sharing
console.log('Sharing: A asks B, B approves (PartnerService)');
const perms = { ring: true, tx: true, goals: false, notes: false, insights: false };
let reqId;
await ok('A creates request + own pending link', async () => {
  const db = as(A);
  reqId = 'req-ab';
  await setDoc(doc(db, `partner_requests/${reqId}`), { fromUserPhone: A, toUserPhone: B, permissions: perms, status: 'pending' });
  await setDoc(doc(db, `users/${A}/sharedPartners/${B}`), { userPhone: A, partnerPhone: B, partnerId: B, permissions: perms, status: 'pending', approvedRequestId: reqId }, { merge: true });
});
await deny('B approves but grants itself extra permissions', () => {
  const db = as(B);
  return runTransaction(db, async (tx) => {
    const r = doc(db, `partner_requests/${reqId}`);
    await tx.get(r);
    tx.update(r, { status: 'approved' });
    tx.set(doc(db, `users/${A}/sharedPartners/${B}`), { status: 'active', permissions: { ...perms, goals: true, notes: true }, approvedRequestId: reqId });
  });
});
await ok('B approves (transaction: request + both links)', () => {
  const db = as(B);
  return runTransaction(db, async (tx) => {
    const r = doc(db, `partner_requests/${reqId}`);
    await tx.get(r);
    tx.set(doc(db, `users/${A}/sharedPartners/${B}`), { partnerPhone: B, status: 'active', permissions: perms, permissionsGrantedBy: B, approvedRequestId: reqId }, { merge: true });
    tx.set(doc(db, `users/${B}/sharedPartners/${A}`), { partnerPhone: A, status: 'active', permissions: perms, permissionsGrantedBy: B, approvedRequestId: reqId }, { merge: true });
    tx.update(r, { status: 'approved', approvedBy: B });
  });
});
await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `users/${A}/incomes/i1`), { amount: 1000, date: new Date() }));
await ok('B reads A\'s expenses (tx granted)', () => getDocs(query(collection(as(B), `users/${A}/expenses`), where('date', '>=', new Date(0)))));
await ok('B reads A\'s incomes (tx granted)', () => getDocs(collection(as(B), `users/${A}/incomes`)));
await deny('B reads A\'s goals (not granted)', () => getDocs(collection(as(B), `users/${A}/goals`)));
await deny('C reads A\'s expenses', () => getDocs(collection(as(C), `users/${A}/expenses`)));
await deny('C forges an active link into A', () => setDoc(doc(as(C), `users/${A}/sharedPartners/${C}`), { status: 'active', permissions: perms, approvedRequestId: reqId }));
await ok('A turns off tx for B', () => updateDoc(doc(as(A), `users/${A}/sharedPartners/${B}`), { permissions: { ...perms, tx: false } }));
await deny('B reads A\'s expenses after tx revoked', () => getDocs(collection(as(B), `users/${A}/expenses`)));
await ok('A removes B (both links + revoke request)', async () => {
  const db = as(A);
  await runTransaction(db, async (tx) => {
    tx.delete(doc(db, `users/${A}/sharedPartners/${B}`));
    tx.delete(doc(db, `users/${B}/sharedPartners/${A}`));
  });
  await updateDoc(doc(db, `partner_requests/${reqId}`), { status: 'revoked', revokedBy: A });
});
await deny('B reads A\'s incomes after removal', () => getDocs(collection(as(B), `users/${A}/incomes`)));

console.log('Sharing: A asks C, C rejects');
await ok('request + pending link', async () => {
  await setDoc(doc(as(A), 'partner_requests/req-ac'), { fromUserPhone: A, toUserPhone: C, permissions: perms, status: 'pending' });
  await setDoc(doc(as(A), `users/${A}/sharedPartners/${C}`), { partnerPhone: C, permissions: perms, status: 'pending', approvedRequestId: 'req-ac' });
});
await ok('C rejects (transaction)', () => {
  const db = as(C);
  return runTransaction(db, async (tx) => {
    const r = doc(db, 'partner_requests/req-ac');
    await tx.get(r);
    tx.update(r, { status: 'rejected' });
    tx.set(doc(db, `users/${A}/sharedPartners/${C}`), { status: 'rejected' }, { merge: true });
  });
});
await deny('C turns its rejected link into an active one', () => setDoc(doc(as(C), `users/${A}/sharedPartners/${C}`), { status: 'active', permissions: perms, approvedRequestId: 'req-ac' }, { merge: true }));

// ---------------------------------------------------------------- payment sync (regression 2026-11-16)
console.log('Payment sync: SMS/Gmail claim then save (IngestIndexService.claim)');
await ok('A claims a de-dupe key in a transaction', () => {
  const db = as(A);
  return runTransaction(db, async (tx) => {
    const ref = doc(db, `ingest_index/${A}/keys/k1`);
    const snap = await tx.get(ref);
    if (!snap.exists()) tx.set(ref, { source: 'sms', createdAt: serverTimestamp() });
  });
});
await ok('A saves the parsed transaction', () => setDoc(doc(as(A), `users/${A}/expenses/sms1`), { amount: 499, date: new Date(), friendIds: [], source: 'SMS', ingestSources: ['sms'] }, { merge: true }));
await ok('A saves a parsed income', () => setDoc(doc(as(A), `users/${A}/incomes/sms2`), { amount: 50000, date: new Date() }, { merge: true }));
await deny('B reads A\'s de-dupe keys', () => getDoc(doc(as(B), `ingest_index/${A}/keys/k1`)));
await deny('B writes A\'s de-dupe keys', () => setDoc(doc(as(B), `ingest_index/${A}/keys/k2`), { source: 'sms' }));

console.log('Restored top-level collections');
await ok('A reads/writes its spend limit', async () => {
  await setDoc(doc(as(A), `limits/${A}_monthly`), { limit: 20000 });
  await getDoc(doc(as(A), `limits/${A}_monthly`));
});
await deny('B reads A\'s spend limit', () => getDoc(doc(as(B), `limits/${A}_monthly`)));
await ok('A reads merchant-name overrides', () => getDocs(collection(as(A), 'config/merchant_alias/overrides')));
await deny('A writes merchant-name overrides', () => setDoc(doc(as(A), 'config/merchant_alias/overrides/x'), { label: 'x' }));
await ok('A writes + queries its insights', async () => {
  await setDoc(doc(as(A), `insights/${A}_1`), { userId: A, text: 'hi' });
  await getDocs(query(collection(as(A), 'insights'), where('userId', '==', A)));
});
await deny('B queries A\'s insights', () => getDocs(query(collection(as(B), 'insights'), where('userId', '==', A))));
await ok('A writes + queries its legacy loans', async () => {
  await setDoc(doc(as(A), 'loans/l1'), { userId: A, isClosed: false });
  await getDocs(query(collection(as(A), 'loans'), where('userId', '==', A), where('isClosed', '==', false)));
});
await ok('A survival mode', () => setDoc(doc(as(A), `survival_mode/${A}`), { on: true }));
await deny('B reads A\'s survival mode', () => getDoc(doc(as(B), `survival_mode/${A}`)));
await ok('A reports a transaction', () => setDoc(doc(as(A), 'reported_transactions/r1'), { by: A }));
await ok('A posts in a group chat', () => setDoc(doc(as(A), 'group_chats/g1/messages/m1'), { text: 'hi' }));

console.log('Shared friend recurring + blog');
await ok('B adds a recurring item in A\'s thread with B', () => setDoc(doc(as(B), `users/${A}/friends/${B}/recurring/r9`), { amount: 100 }));
await ok('B reads it', () => getDoc(doc(as(B), `users/${A}/friends/${B}/recurring/r9`)));
await deny('C reads A\'s thread with B', () => getDoc(doc(as(C), `users/${A}/friends/${B}/recurring/r9`)));
await ok('anyone reads blog posts', () => getDocs(collection(anon(), 'posts')));
await deny('signed-in non-admin writes a post', () => setDoc(doc(as(A), 'posts/p1'), { title: 'x' }));
await ok('verified admin email writes a post', () => setDoc(doc(env.authenticatedContext('admin1', { email: 'admin@fiinny.com', email_verified: true }).firestore(), 'posts/p1'), { title: 'x' }));
await deny('unverified admin email writes a post', () => setDoc(doc(env.authenticatedContext('admin2', { email: 'admin@fiinny.com', email_verified: false }).firestore(), 'posts/p2'), { title: 'x' }));

// ---------------------------------------------------------------- misc
console.log('Misc');
await ok('owner writes nested friend recurring', () => setDoc(doc(as(A), `users/${A}/friends/${B}/recurring/r1`), { amount: 1 }));
await deny('B writes recurring in A\'s thread with D', () => setDoc(doc(as(B), `users/${A}/friends/${D}/recurring/r2`), { amount: 1 }));
await deny('B writes other nested data of A', () => setDoc(doc(as(B), `users/${A}/goals/g1/notes/n1`), { t: 1 }));
await ok('anyone reads app/ads', () => getDoc(doc(anon(), 'app/ads')));
await deny('signed-in user writes app/ads', () => setDoc(doc(as(A), 'app/ads'), { enabled: false }));

await env.cleanup();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('Failed:', failures.join(' | ')); process.exit(1); }
