import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../../../core/constants/firestore_keys.dart';
import '../../expenses/data/bill_image.dart';
import 'dealer.dart';
import 'dealer_status.dart';

class DealerChangedException implements Exception {}

class DealerRepository {
  DealerRepository({FirebaseFirestore? db, FirebaseStorage? storage})
    : _db = db ?? FirebaseFirestore.instance,
      _storage = storage ?? FirebaseStorage.instance;

  final FirebaseFirestore _db;
  final FirebaseStorage _storage;

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection(Collections.dealers);

  /// Only dealers created by this rep. Keep the owner filter in the Firestore
  /// query so owner-scoped security rules can authorize the whole result set.
  Stream<List<Dealer>> active(String uid) => _col
      .where('createdBy', isEqualTo: uid)
      .where('active', isEqualTo: true)
      .snapshots()
      .map((snap) {
        final list = snap.docs.map(Dealer.fromDoc).toList();
        list.sort((a, b) {
          final ta = a.createdAt?.millisecondsSinceEpoch ?? 0;
          final tb = b.createdAt?.millisecondsSinceEpoch ?? 0;
          if (ta != tb) return tb.compareTo(ta);
          return a.shopName.toLowerCase().compareTo(b.shopName.toLowerCase());
        });
        return list;
      });

  /// A single dealer by id, or null when it doesn't exist — used by the
  /// detail page, which links here from a list item that already has this id.
  Stream<Dealer?> byId(String dealerId) => _col
      .doc(dealerId)
      .snapshots()
      .map((doc) => doc.exists ? Dealer.fromDoc(doc) : null);

  /// Creates the dealer first, then uploads the photo under the new document's
  /// id — same ordering as expense bills, so a failed upload still leaves a
  /// usable dealer behind instead of losing what the rep typed.
  Future<String> create(
    String uid,
    DealerInput input, {
    BillImage? image,
  }) async {
    final status = DealerStatus.clean(input.status);
    if (status == null || status.length > 50) {
      throw ArgumentError(
        'A dealer status of up to 50 characters is required.',
      );
    }
    final now = FieldValue.serverTimestamp();
    final ref = _col.doc();
    final batch = _db.batch();
    batch.set(ref, {
      'shopName': input.shopName.trim(),
      'ownerName': input.ownerName.trim(),
      'phone': input.phone.trim(),
      'address': input.address.trim(),
      'type': input.type.name,
      'geo': input.geo == null
          ? null
          : GeoPoint(input.geo!.lat, input.geo!.lng),
      'active': true,
      'status': status,
      'createdBy': uid,
      'createdAt': now,
      'updatedAt': now,
      if (input.interest != null) 'interest': input.interest!.name,
    });
    batch.set(
      _db.collection(Collections.dealerStatusHistory).doc(),
      DealerStatusChange.writeData(
        dealerId: ref.id,
        salesExecutiveId: uid,
        fromStatus: null,
        toStatus: status,
        source: 'CREATED',
        changedBy: uid,
      ),
    );
    if (DealerStatus.isCustom(status)) {
      batch.set(_db.collection(Collections.dealerStatusOptions).doc(uid), {
        'statuses': FieldValue.arrayUnion([status]),
        'updatedAt': now,
      }, SetOptions(merge: true));
    }
    await batch.commit();

    if (image != null) {
      await attachImage(uid: uid, dealerId: ref.id, image: image);
    }
    return ref.id;
  }

  Future<void> update(
    String uid,
    String dealerId,
    DealerInput input, {
    DateTime? expectedUpdatedAt,
  }) async {
    final requested = DealerStatus.clean(input.status);
    if (requested == null || requested.length > 50) {
      throw ArgumentError(
        'A dealer status of up to 50 characters is required.',
      );
    }
    final ref = _col.doc(dealerId);
    final historyRef = _db.collection(Collections.dealerStatusHistory).doc();
    await _db.runTransaction((tx) async {
      final doc = await tx.get(ref);
      if (!doc.exists || doc.data()?['active'] == false) {
        throw DealerChangedException();
      }
      final savedAt = (doc.data()?['updatedAt'] as Timestamp?)?.toDate();
      if (expectedUpdatedAt != null &&
          savedAt != null &&
          !savedAt.isAtSameMomentAs(expectedUpdatedAt)) {
        throw DealerChangedException();
      }
      final current = DealerStatus.clean(doc.data()?['status'] as String?);
      final status = input.statusChanged ? requested : current ?? requested;
      tx.update(ref, {
        'shopName': input.shopName.trim(),
        'ownerName': input.ownerName.trim(),
        'phone': input.phone.trim(),
        'address': input.address.trim(),
        'type': input.type.name,
        'geo': input.geo == null
            ? null
            : GeoPoint(input.geo!.lat, input.geo!.lng),
        'status': status,
        'updatedAt': FieldValue.serverTimestamp(),
        // Omitted (not written as null) when unset, so leaving the picker
        // untouched on an edit never clobbers a previously recorded interest.
        if (input.interest != null) 'interest': input.interest!.name,
      });
      if (status != current) {
        tx.set(
          historyRef,
          DealerStatusChange.writeData(
            dealerId: dealerId,
            salesExecutiveId: uid,
            fromStatus: current,
            toStatus: status,
            source: 'EDIT',
            changedBy: uid,
          ),
        );
      }
      if (DealerStatus.isCustom(status)) {
        tx.set(_db.collection(Collections.dealerStatusOptions).doc(uid), {
          'statuses': FieldValue.arrayUnion([status]),
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
      }
    });
  }

  /// Soft delete — the rules only allow a hard delete for admins, and past
  /// visits still reference the dealer, so deactivating is the correct removal.
  Future<void> deactivate(String dealerId) async {
    await _col.doc(dealerId).update({
      'active': false,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Uploads the dealer photo and patches the doc with its URL/path. The
  /// filename is fixed per dealer (not per-upload), so replacing a photo on
  /// edit overwrites the same Storage object instead of leaving the old one
  /// orphaned. The Firestore doc is only touched after the upload succeeds, so
  /// a failed upload never disturbs an existing photo reference.
  Future<void> attachImage({
    required String uid,
    required String dealerId,
    required BillImage image,
  }) async {
    final path = 'dealers/$dealerId/photo${image.extension}';
    final ref = _storage.ref(path);
    await ref.putData(
      image.bytes,
      SettableMetadata(contentType: image.contentType),
    );
    final url = await ref.getDownloadURL();
    await _col.doc(dealerId).update({
      'imageUrl': url,
      'imagePath': path,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }
}
