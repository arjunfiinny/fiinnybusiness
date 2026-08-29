import 'package:cloud_firestore/cloud_firestore.dart';

/// One purchased subscription — a row in the Subscription History list.
///
/// Mirrors the `subscriptions/{id}` doc as written by BOTH platforms
/// (subscription_screen.dart on mobile, updateSubscriptionStatus /
/// adminManualActivate on web). Owner identity is dual-written as `ownerId`
/// (auth uid) AND `ownerPhone`, so any query must cover both axes.
class SubscriptionModel {
  final String id;
  final String planName;
  final int seatsPurchased;
  final int durationMonths;
  final double amountPaid;
  final String currency;
  final String status;
  final DateTime? startDate;
  final DateTime? expiryDate;
  final DateTime? createdAt;
  final String? razorpayPaymentId;

  /// True when an admin granted this rather than it being paid for.
  final bool activatedByAdmin;

  const SubscriptionModel({
    required this.id,
    required this.planName,
    required this.seatsPurchased,
    required this.durationMonths,
    required this.amountPaid,
    required this.currency,
    required this.status,
    this.startDate,
    this.expiryDate,
    this.createdAt,
    this.razorpayPaymentId,
    this.activatedByAdmin = false,
  });

  bool get isExpired =>
      expiryDate != null && expiryDate!.isBefore(DateTime.now());

  /// Active and not past its expiry — the only state that contributes seats.
  bool get isActive => status == 'active' && !isExpired;

  /// Within [days] of expiring. Web's dashboard flags 5 days.
  bool expiresWithin(int days) {
    if (expiryDate == null || isExpired) return false;
    return expiryDate!.difference(DateTime.now()).inDays <= days;
  }

  static DateTime? _date(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  factory SubscriptionModel.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>? ?? {};
    return SubscriptionModel(
      id: doc.id,
      planName: (d['planName'] ?? 'Standard').toString(),
      seatsPurchased: (d['seatsPurchased'] as num?)?.toInt() ?? 0,
      durationMonths: (d['durationMonths'] as num?)?.toInt() ?? 0,
      amountPaid: (d['amountPaid'] as num?)?.toDouble() ?? 0,
      currency: (d['currency'] ?? 'INR').toString(),
      status: (d['subscriptionStatus'] ?? 'unknown').toString(),
      startDate: _date(d['startDate']),
      expiryDate: _date(d['expiryDate']),
      createdAt: _date(d['createdAt']),
      razorpayPaymentId: d['razorpayPaymentId']?.toString(),
      activatedByAdmin: d['activatedByAdmin'] == true,
    );
  }
}

/// One seat currently consumed by a listing — a row in Active Listings.
///
/// `listingType` is `'own'` (the seller's own product) or `'assigned'` (a
/// manufacturer assigned it to a retailer).
class SeatListingModel {
  final String id;
  final String listingType;
  final String status;
  final String productId;
  final String? manufacturerProductId;
  final String? retailerDocId;
  final String? retailerPhone;
  final DateTime? assignedAt;
  final DateTime? expiresAt;

  /// Hydrated separately from the product doc — seat listings store no name.
  final String? productName;
  final String? productImage;

  const SeatListingModel({
    required this.id,
    required this.listingType,
    required this.status,
    required this.productId,
    this.manufacturerProductId,
    this.retailerDocId,
    this.retailerPhone,
    this.assignedAt,
    this.expiresAt,
    this.productName,
    this.productImage,
  });

  bool get isAssigned => listingType == 'assigned';

  bool get isCurrentlyActive =>
      status == 'active' &&
      expiresAt != null &&
      expiresAt!.isAfter(DateTime.now());

  SeatListingModel copyWith({String? productName, String? productImage}) =>
      SeatListingModel(
        id: id,
        listingType: listingType,
        status: status,
        productId: productId,
        manufacturerProductId: manufacturerProductId,
        retailerDocId: retailerDocId,
        retailerPhone: retailerPhone,
        assignedAt: assignedAt,
        expiresAt: expiresAt,
        productName: productName ?? this.productName,
        productImage: productImage ?? this.productImage,
      );

  static DateTime? _date(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  factory SeatListingModel.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>? ?? {};
    return SeatListingModel(
      id: doc.id,
      listingType: (d['listingType'] ?? 'own').toString(),
      status: (d['status'] ?? 'active').toString(),
      productId: (d['productId'] ?? '').toString(),
      manufacturerProductId: d['manufacturerProductId']?.toString(),
      retailerDocId: d['retailerDocId']?.toString(),
      retailerPhone: d['retailerPhone']?.toString(),
      // Web's type expects `assignedAt`, but mobile's assignment writer stores
      // `createdAt` — read either so a listing created on either platform
      // shows a date instead of a blank cell.
      assignedAt: _date(d['assignedAt']) ?? _date(d['createdAt']),
      expiresAt: _date(d['expiresAt']),
    );
  }
}
