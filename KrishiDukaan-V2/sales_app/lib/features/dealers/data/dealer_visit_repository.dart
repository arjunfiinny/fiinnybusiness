import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/constants/firestore_keys.dart';
import '../../../core/services/location_service.dart';
import '../../../core/utils/ist_date.dart';
import 'dealer_visit.dart';
import 'dealer_status.dart';

class MarkVisitInput {
  final String dealerId;
  final String dealerName;
  final String purpose;
  final String? purposeOther;
  final String? notes;
  final LatLngPoint geo;
  final String? daySessionId;
  final int? visitSequence;
  final String status;
  final bool statusChanged;

  const MarkVisitInput({
    required this.dealerId,
    required this.dealerName,
    required this.purpose,
    this.purposeOther,
    this.notes,
    required this.geo,
    this.daySessionId,
    this.visitSequence,
    required this.status,
    this.statusChanged = false,
  });
}

class DealerVisitRepository {
  DealerVisitRepository({FirebaseFirestore? db})
    : _db = db ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection(Collections.dealerVisits);

  Future<String> markVisited(String uid, MarkVisitInput input) async {
    final requested = DealerStatus.clean(input.status);
    if (requested == null || requested.length > 50) {
      throw ArgumentError(
        'A dealer status of up to 50 characters is required.',
      );
    }
    final ref = _col.doc();
    final dealerRef = _db.collection(Collections.dealers).doc(input.dealerId);
    final historyRef = _db.collection(Collections.dealerStatusHistory).doc();
    await _db.runTransaction((tx) async {
      final dealer = await tx.get(dealerRef);
      if (!dealer.exists || dealer.data()?['active'] == false) {
        throw StateError('Dealer is no longer active.');
      }
      final oldStatus = DealerStatus.clean(dealer.data()?['status'] as String?);
      final status = input.statusChanged ? requested : oldStatus ?? requested;
      final now = FieldValue.serverTimestamp();
      tx.set(ref, {
        'dealerId': input.dealerId,
        'dealerName': '${dealer.data()?['shopName'] ?? input.dealerName}',
        'salesExecutiveId': uid,
        if (input.daySessionId != null) 'daySessionId': input.daySessionId,
        if (input.visitSequence != null) 'visitSequence': input.visitSequence,
        'purpose': input.purpose,
        'dealerStatus': status,
        if (input.purpose == 'Other' &&
            (input.purposeOther?.trim().isNotEmpty ?? false))
          'purposeOther': input.purposeOther!.trim(),
        if (input.notes?.trim().isNotEmpty ?? false)
          'notes': input.notes!.trim(),
        'geo': GeoPoint(input.geo.lat, input.geo.lng),
        'visitedAt': now,
        'createdAt': now,
        'updatedAt': now,
      });
      if (status != oldStatus) {
        tx.update(dealerRef, {
          'status': status,
          'updatedAt': FieldValue.serverTimestamp(),
        });
        tx.set(
          historyRef,
          DealerStatusChange.writeData(
            dealerId: input.dealerId,
            salesExecutiveId: uid,
            fromStatus: oldStatus,
            toStatus: status,
            source: 'VISIT',
            changedBy: uid,
            visitId: ref.id,
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
    return ref.id;
  }

  /// Visits on one IST calendar day, oldest first (timeline order).
  Future<List<DealerVisit>> forDate(String uid, String dateKey) async {
    final snap = await _col
        .where('salesExecutiveId', isEqualTo: uid)
        .where(
          'visitedAt',
          isGreaterThanOrEqualTo: Timestamp.fromDate(
            IstDate.startOfDayUtc(dateKey),
          ),
        )
        .where(
          'visitedAt',
          isLessThan: Timestamp.fromDate(IstDate.endOfDayUtc(dateKey)),
        )
        .orderBy('visitedAt')
        .get();
    return snap.docs.map(DealerVisit.fromDoc).toList();
  }

  Future<List<DealerVisit>> today(String uid) => forDate(uid, IstDate.today());

  /// Visits from [fromDate] 00:00 IST onwards, newest first. One query backs
  /// both the reports range and the "last visit per dealer" lookup below.
  Future<List<DealerVisit>> since(String uid, String fromDate) async {
    final snap = await _col
        .where('salesExecutiveId', isEqualTo: uid)
        .where(
          'visitedAt',
          isGreaterThanOrEqualTo: Timestamp.fromDate(
            IstDate.startOfDayUtc(fromDate),
          ),
        )
        .orderBy('visitedAt', descending: true)
        .get();
    return snap.docs.map(DealerVisit.fromDoc).toList();
  }

  /// Latest visit per dealer for this rep, as `dealerId -> visit`.
  ///
  /// One ordered query walked in memory rather than a query per dealer — with
  /// a few hundred dealers the N+1 version would be hundreds of reads every
  /// time the list opens.
  Future<Map<String, DealerVisit>> lastVisitByDealer(String uid) async {
    final snap = await _col
        .where('salesExecutiveId', isEqualTo: uid)
        .orderBy('visitedAt', descending: true)
        .get();

    final out = <String, DealerVisit>{};
    for (final doc in snap.docs) {
      final visit = DealerVisit.fromDoc(doc);
      if (visit.dealerId.isEmpty) continue;
      out.putIfAbsent(visit.dealerId, () => visit);
    }
    return out;
  }
}
