import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/constants/firestore_keys.dart';
import 'dealer.dart';

class DealerRepository {
  DealerRepository({FirebaseFirestore? db})
    : _db = db ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection(Collections.dealers);

  /// The whole active dealer master — shared across the field team, not scoped
  /// to the signed-in rep (the Firestore rules allow any sales exec to read it).
  /// Sorted newest-first, then by name, matching the web list order.
  Future<List<Dealer>> active() async {
    final snap = await _col.where('active', isEqualTo: true).get();
    final list = snap.docs.map(Dealer.fromDoc).toList();
    list.sort((a, b) {
      final ta = a.createdAt?.millisecondsSinceEpoch ?? 0;
      final tb = b.createdAt?.millisecondsSinceEpoch ?? 0;
      if (ta != tb) return tb.compareTo(ta);
      return a.shopName.toLowerCase().compareTo(b.shopName.toLowerCase());
    });
    return list;
  }

  Future<String> create(String uid, DealerInput input) async {
    final now = FieldValue.serverTimestamp();
    final ref = await _col.add({
      'shopName': input.shopName.trim(),
      'ownerName': input.ownerName.trim(),
      'phone': input.phone.trim(),
      'address': input.address.trim(),
      'type': input.type.name,
      'geo': input.geo == null
          ? null
          : GeoPoint(input.geo!.lat, input.geo!.lng),
      'active': true,
      'createdBy': uid,
      'createdAt': now,
      'updatedAt': now,
    });
    return ref.id;
  }

  Future<void> update(String dealerId, DealerInput input) async {
    await _col.doc(dealerId).update({
      'shopName': input.shopName.trim(),
      'ownerName': input.ownerName.trim(),
      'phone': input.phone.trim(),
      'address': input.address.trim(),
      'type': input.type.name,
      'geo': input.geo == null
          ? null
          : GeoPoint(input.geo!.lat, input.geo!.lng),
      'updatedAt': FieldValue.serverTimestamp(),
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
}
