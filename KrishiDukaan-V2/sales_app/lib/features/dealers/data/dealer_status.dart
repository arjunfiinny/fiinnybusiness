import 'package:cloud_firestore/cloud_firestore.dart';

/// Stored as display text so the admin portal can filter/export the same value.
class DealerStatus {
  DealerStatus._();

  static const presets = <String>[
    'Pitching',
    'Interested',
    'Ongoing',
    'Pending',
    'Completed',
    'Closed',
    'Not Interested',
  ];

  static String? clean(String? raw) {
    final value = raw?.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (value == null || value.isEmpty) return null;
    for (final preset in presets) {
      if (preset.toLowerCase() == value.toLowerCase()) return preset;
    }
    return value;
  }

  static bool isCustom(String value) =>
      !presets.any((preset) => preset.toLowerCase() == value.toLowerCase());
}

class DealerStatusChange {
  static Map<String, dynamic> writeData({
    required String dealerId,
    required String salesExecutiveId,
    required String? fromStatus,
    required String toStatus,
    required String source,
    required String changedBy,
    String? visitId,
  }) => {
    'dealerId': dealerId,
    'salesExecutiveId': salesExecutiveId,
    'fromStatus': fromStatus,
    'toStatus': toStatus,
    'source': source,
    'changedBy': changedBy,
    'visitId': ?visitId,
    'changedAt': FieldValue.serverTimestamp(),
  };

  final String id;
  final String dealerId;
  final String salesExecutiveId;
  final String? fromStatus;
  final String toStatus;
  final String source;
  final String changedBy;
  final String? visitId;
  final DateTime? changedAt;

  const DealerStatusChange({
    required this.id,
    required this.dealerId,
    required this.salesExecutiveId,
    required this.fromStatus,
    required this.toStatus,
    required this.source,
    required this.changedBy,
    this.visitId,
    this.changedAt,
  });

  factory DealerStatusChange.fromDoc(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? const <String, dynamic>{};
    return DealerStatusChange(
      id: doc.id,
      dealerId: '${data['dealerId'] ?? ''}',
      salesExecutiveId: '${data['salesExecutiveId'] ?? ''}',
      fromStatus: DealerStatus.clean(data['fromStatus'] as String?),
      toStatus: '${data['toStatus'] ?? ''}',
      source: '${data['source'] ?? ''}',
      changedBy: '${data['changedBy'] ?? ''}',
      visitId: data['visitId'] as String?,
      changedAt: (data['changedAt'] as Timestamp?)?.toDate(),
    );
  }
}
