import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/services/location_service.dart';

/// What kind of trade partner this record is. The field team calls on
/// retailers, distributors and manufacturers — the people who actually buy —
/// so a visit list is far easier to work through when it can be filtered by type.
///
/// Stored as an OPTIONAL `type` string. Records created by the web /sales route
/// have no `type` at all, so [DealerType.from] treats a missing value as
/// [retailer] rather than dropping the record, and web edits (which write a
/// fixed field list) leave an existing value untouched.
enum DealerType {
  retailer('Retailer'),
  distributor('Distributor'),
  manufacturer('Manufacturer');

  const DealerType(this.label);
  final String label;

  static DealerType from(dynamic raw) {
    final v = '${raw ?? ''}'.toLowerCase();
    return DealerType.values.firstWhere(
      (t) => t.name == v,
      orElse: () => DealerType.retailer,
    );
  }
}

/// Shared dealer master. Same documents as the web /sales/dealers page
/// (app/sales/dealers/dealers-service.ts).
class Dealer {
  final String id;
  final String shopName;
  final String ownerName;
  final String phone;
  final String address;
  final DealerType type;
  final LatLngPoint? geo;
  final bool active;
  final String createdBy;
  final DateTime? createdAt;

  const Dealer({
    required this.id,
    required this.shopName,
    required this.ownerName,
    required this.phone,
    required this.address,
    required this.type,
    required this.geo,
    required this.active,
    required this.createdBy,
    this.createdAt,
  });

  factory Dealer.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? const {};
    final raw = d['geo'];
    return Dealer(
      id: doc.id,
      shopName: '${d['shopName'] ?? ''}',
      ownerName: '${d['ownerName'] ?? ''}',
      phone: '${d['phone'] ?? ''}',
      address: '${d['address'] ?? ''}',
      type: DealerType.from(d['type']),
      geo: raw is GeoPoint ? LatLngPoint(raw.latitude, raw.longitude) : null,
      active: d['active'] != false,
      createdBy: '${d['createdBy'] ?? ''}',
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
    );
  }

  /// Matches a free-text search across the fields a rep would actually type.
  bool matches(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    return shopName.toLowerCase().contains(q) ||
        ownerName.toLowerCase().contains(q) ||
        phone.contains(q) ||
        address.toLowerCase().contains(q);
  }
}

/// Payload for creating/updating a dealer.
class DealerInput {
  final String shopName;
  final String ownerName;
  final String phone;
  final String address;
  final DealerType type;
  final LatLngPoint? geo;

  const DealerInput({
    required this.shopName,
    required this.ownerName,
    required this.phone,
    required this.address,
    required this.type,
    required this.geo,
  });
}
