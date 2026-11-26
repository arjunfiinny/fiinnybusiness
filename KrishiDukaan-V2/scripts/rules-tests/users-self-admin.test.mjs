// Firestore-rules proof: a signed-in user cannot grant themselves privileges
// through their own users/{phone} or users/{uid} doc (audit 2026-10-29), while
// the self-service edits the apps make still work.
//
// Run (from C:\lifemap\KrishiDukaan-V2, or any checkout of it):
//   firebase emulators:exec --only firestore --project demo-kd-rules \
//     "node scripts/rules-tests/users-self-admin.test.mjs"
//
// Uses @firebase/rules-unit-testing + firebase from ../KARANARJUNKSKPVTLTD
// (override with RULES_TEST_NODE_MODULES=<dir containing node_modules>).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '..', '..');
const modsRoot = process.env.RULES_TEST_NODE_MODULES || path.join(app, '..', 'KARANARJUNKSKPVTLTD');
const require = createRequire(path.join(modsRoot, 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc } = require('firebase/firestore');

const C = '+919000000011';  // customer
const R = '+919000000012';  // retailer
const T = '+919000000013';  // team account (limited admin sections)
const A = '+919000000014';  // admin
const uid = (p) => `uid-${p.slice(-4)}`;

const env = await initializeTestEnvironment({
  projectId: 'demo-kd-rules',
  firestore: { rules: readFileSync(path.join(app, 'firestore.rules'), 'utf8') },
});

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [p, role, extra] of [
      [C, 'customer', {}], [R, 'retailer', {}], [T, 'team', { adminSections: ['orders'] }], [A, 'admin', {}],
    ]) {
      await setDoc(doc(db, 'uidIndex', uid(p)), { phone: p });
      await setDoc(doc(db, 'users', p), { role, name: 'x', ...extra });
    }
    // An email-style doc keyed by uid, as promoteToAdmin/create-user write.
    await setDoc(doc(db, 'users', uid(C)), { role: 'customer', name: 'x' });
    await setDoc(doc(db, 'users', uid(T)), { role: 'team', adminSections: ['orders'] });
  });
}

const as = (p) => env.authenticatedContext(uid(p), { phone_number: p }).firestore();
let failed = 0;
async function check(name, fn) {
  await seed();
  try { await fn(); console.log('  ok  ', name); }
  catch (e) { failed++; console.log('  FAIL', name, '-', e.message.split('\n')[0]); }
}

// Self-service edits the apps make
await check('customer edits own name', () => assertSucceeds(updateDoc(doc(as(C), 'users', C), { name: 'y' })));
await check('customer upgrades to retailer', () => assertSucceeds(updateDoc(doc(as(C), 'users', C), { role: 'retailer' })));
await check('customer upgrades to manufacturer', () => assertSucceeds(updateDoc(doc(as(C), 'users', C), { role: 'manufacturer' })));
await check('customer sets isPaid (invite flow, unchanged)', () => assertSucceeds(updateDoc(doc(as(C), 'users', C), { isPaid: true })));
await check('team member edits own name', () => assertSucceeds(updateDoc(doc(as(T), 'users', T), { name: 'y' })));

// Privilege grants a user must not make on their own doc
for (const role of ['admin', 'team', 'salesExecutive']) {
  await check(`customer sets own role ${role} (phone doc)`, () => assertFails(updateDoc(doc(as(C), 'users', C), { role })));
  await check(`customer sets own role ${role} (uid doc)`, () => assertFails(updateDoc(doc(as(C), 'users', uid(C)), { role })));
}
await check('customer sets own adminSections', () => assertFails(updateDoc(doc(as(C), 'users', C), { adminSections: ['users'] })));
await check('team member widens own adminSections', () => assertFails(updateDoc(doc(as(T), 'users', T), { adminSections: ['orders', 'users'] })));
await check('team member widens adminSections on uid doc', () => assertFails(updateDoc(doc(as(T), 'users', uid(T)), { adminSections: ['orders', 'payments'] })));
await check('team member promotes self to admin', () => assertFails(updateDoc(doc(as(T), 'users', T), { role: 'admin' })));
await check('customer removes role field', () => assertFails(setDoc(doc(as(C), 'users', C), { name: 'y' })));
await check('retailer downgrades to customer (existing rule)', () => assertFails(updateDoc(doc(as(R), 'users', R), { role: 'customer' })));

// Admins keep managing other accounts
await check('admin promotes a user to admin', () => assertSucceeds(updateDoc(doc(as(A), 'users', C), { role: 'admin' })));
await check('admin sets team sections', () => assertSucceeds(updateDoc(doc(as(A), 'users', uid(T)), { adminSections: ['orders', 'users'] })));

await env.cleanup();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
