// Run from repo root:
// firebase emulators:exec --only firestore --project demo-sales-rules "node functions/scripts/rules-test-sales.mjs"
import { initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../node_modules/firebase-admin');
const projectId = 'demo-sales-rules';
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const adb = admin.initializeApp({ projectId }).firestore();

function client(uid) {
  const db = getFirestore(initializeApp({ projectId, apiKey: 'test' }, uid));
  connectFirestoreEmulator(db, host, Number(port), {
    mockUserToken: { user_id: uid, sub: uid },
  });
  return db;
}

await Promise.all([
  adb.collection('users').doc('repA').set({ role: 'salesExecutive' }),
  adb.collection('users').doc('repB').set({ role: 'salesExecutive' }),
  adb.collection('users').doc('admin').set({ role: 'admin' }),
]);
await Promise.all([
  adb.collection('dealers').doc('dealerA').set({
    createdBy: 'repA', active: true, shopName: 'A',
  }),
  adb.collection('dealers').doc('dealerB').set({
    createdBy: 'repB', active: true, shopName: 'B',
  }),
  adb.collection('dealerNotes').doc('noteA').set({
    dealerId: 'dealerA', salesExecutiveId: 'repA', note: 'Private A',
    createdAt: admin.firestore.Timestamp.now(),
  }),
  adb.collection('dealerNotes').doc('noteB').set({
    dealerId: 'dealerB', salesExecutiveId: 'repB', note: 'Private B',
    createdAt: admin.firestore.Timestamp.now(),
  }),
  adb.collection('daySessions').doc('dayA').set({
    salesExecutiveId: 'repA', status: 'ACTIVE', trackPoints: [],
  }),
]);

const repA = client('repA');
const repB = client('repB');
const boss = client('admin');
let failures = 0;
async function check(name, allowed, action) {
  let worked = true;
  try {
    await action();
  } catch (error) {
    if (error.code !== 'permission-denied') console.error(name, error);
    worked = false;
  }
  const passed = worked === allowed;
  if (!passed) failures++;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
}

await check('rep lists own dealers', true, () => getDocs(query(
  collection(repA, 'dealers'), where('createdBy', '==', 'repA'),
  where('active', '==', true),
)));
await check('rep cannot list all dealers', false, () => getDocs(query(
  collection(repA, 'dealers'), where('active', '==', true),
)));
await check('rep cannot read another dealer by ID', false, () =>
  getDoc(doc(repA, 'dealers', 'dealerB')));
await check('admin can read dealer', true, () =>
  getDoc(doc(boss, 'dealers', 'dealerB')));
await check('rep can edit own dealer', true, () =>
  updateDoc(doc(repA, 'dealers', 'dealerA'), { shopName: 'A updated' }));
await check('rep cannot edit another dealer', false, () =>
  updateDoc(doc(repA, 'dealers', 'dealerB'), { shopName: 'stolen' }));
await check('rep cannot transfer dealer ownership', false, () =>
  updateDoc(doc(repA, 'dealers', 'dealerA'), { createdBy: 'repB' }));
await check('rep cannot create dealer for another rep', false, () =>
  setDoc(doc(repA, 'dealers', 'forged'), { createdBy: 'repB', active: true }));
await check('rep lists own notes for own dealer', true, () => getDocs(query(
  collection(repA, 'dealerNotes'), where('dealerId', '==', 'dealerA'),
  where('salesExecutiveId', '==', 'repA'), orderBy('createdAt'),
)));
await check('rep cannot list notes without owner filter', false, () => getDocs(query(
  collection(repA, 'dealerNotes'), where('dealerId', '==', 'dealerB'),
)));
await check('rep cannot read another note by ID', false, () =>
  getDoc(doc(repA, 'dealerNotes', 'noteB')));
await check('rep cannot add note to another dealer', false, () =>
  setDoc(doc(repA, 'dealerNotes', 'forged'), {
    dealerId: 'dealerB', salesExecutiveId: 'repA', note: 'x',
  }));
await check('rep cannot log visit to another dealer', false, () =>
  setDoc(doc(repA, 'dealerVisits', 'forged'), {
    dealerId: 'dealerB', salesExecutiveId: 'repA',
  }));
await check('rep can add a route point to own day', true, () =>
  updateDoc(doc(repA, 'daySessions', 'dayA'), { trackPoints: [{ lat: 12, lng: 77 }] }));
await check('rep cannot transfer session ownership', false, () =>
  updateDoc(doc(repA, 'daySessions', 'dayA'), { salesExecutiveId: 'repB' }));
await check('rep writes initial status and history atomically', true, async () => {
  const batch = writeBatch(repA);
  batch.update(doc(repA, 'dealers', 'dealerA'), { status: 'Pitching' });
  batch.set(doc(repA, 'dealerStatusHistory', 'statusA'), {
    dealerId: 'dealerA', salesExecutiveId: 'repA', changedBy: 'repA',
    fromStatus: null, toStatus: 'Pitching', source: 'EDIT',
    changedAt: serverTimestamp(),
  });
  await batch.commit();
});
await check('rep creates a dealer with its first status event', true, async () => {
  const batch = writeBatch(repA);
  batch.set(doc(repA, 'dealers', 'newDealer'), {
    createdBy: 'repA', active: true, shopName: 'New', status: 'Interested',
  });
  batch.set(doc(repA, 'dealerStatusHistory', 'newDealerStatus'), {
    dealerId: 'newDealer', salesExecutiveId: 'repA', changedBy: 'repA',
    fromStatus: null, toStatus: 'Interested', source: 'CREATED',
    changedAt: serverTimestamp(),
  });
  await batch.commit();
});
await check('rep reads own status history', true, () => getDocs(query(
  collection(repA, 'dealerStatusHistory'), where('dealerId', '==', 'dealerA'),
  where('salesExecutiveId', '==', 'repA'), orderBy('changedAt', 'desc'),
)));
await check('another rep cannot read status history', false, () =>
  getDoc(doc(repB, 'dealerStatusHistory', 'statusA')));
await check('rep cannot forge status history for another dealer', false, () =>
  setDoc(doc(repA, 'dealerStatusHistory', 'forged'), {
    dealerId: 'dealerB', salesExecutiveId: 'repA', changedBy: 'repA',
    toStatus: 'Closed', source: 'VISIT', changedAt: serverTimestamp(),
  }));
await check('rep stores reusable custom status choices', true, () =>
  setDoc(doc(repA, 'dealerStatusOptions', 'repA'), {
    statuses: ['Awaiting documents'], updatedAt: serverTimestamp(),
  }));
await check('another rep cannot read custom status choices', false, () =>
  getDoc(doc(repB, 'dealerStatusOptions', 'repA')));
await check('admin can edit a dealer note', true, () =>
  updateDoc(doc(boss, 'dealerNotes', 'noteA'), { note: 'Corrected' }));
await check('admin can update status with a history event', true, async () => {
  const batch = writeBatch(boss);
  batch.update(doc(boss, 'dealers', 'dealerA'), { status: 'Closed' });
  batch.set(doc(boss, 'dealerStatusHistory', 'adminStatusA'), {
    dealerId: 'dealerA', salesExecutiveId: 'repA', changedBy: 'admin',
    fromStatus: 'Pitching', toStatus: 'Closed', source: 'ADMIN_EDIT',
    changedAt: serverTimestamp(),
  });
  await batch.commit();
});

console.log(failures ? `${failures} sales rules checks failed` : 'Sales rules checks passed');
process.exit(failures ? 1 : 0);
