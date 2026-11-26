import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/constants/firestore_keys.dart';
import 'dealer_status.dart';

class DealerStatusRepository {
  DealerStatusRepository({FirebaseFirestore? db})
    : _db = db ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  Stream<List<String>> customStatuses(String uid) => _db
      .collection(Collections.dealerStatusOptions)
      .doc(uid)
      .snapshots()
      .map((doc) {
        final raw = doc.data()?['statuses'];
        if (raw is! List) return const <String>[];
        final out = <String>[];
        for (final item in raw) {
          final value = DealerStatus.clean(item is String ? item : null);
          if (value != null &&
              DealerStatus.isCustom(value) &&
              !out.any((other) => other.toLowerCase() == value.toLowerCase())) {
            out.add(value);
          }
        }
        out.sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
        return out;
      });

  Stream<List<DealerStatusChange>> history(String uid, String dealerId) => _db
      .collection(Collections.dealerStatusHistory)
      .where('dealerId', isEqualTo: dealerId)
      .where('salesExecutiveId', isEqualTo: uid)
      .orderBy('changedAt', descending: true)
      .snapshots()
      .map((snap) => snap.docs.map(DealerStatusChange.fromDoc).toList());
}
