// lib/core/ads/ad_remote_config.dart
//
// Remote control for ads, edited from the Firebase console (Firestore,
// project lifemap-72b21, document `app/ads`). No app release needed.
//
// Every field is optional; a missing doc or field keeps today's behaviour.
//
//   enabled              bool      master switch. false = no ad requests at all.
//   interstitialsEnabled bool      false = never show full-screen interstitials.
//   rewardedEnabled      bool      false = never offer rewarded ads.
//   noAdsUsers           [string]  Firebase Auth UIDs that never see ads — put the
//                                  team's own accounts here so their taps can't
//                                  count as invalid traffic. UIDs only: this doc is
//                                  publicly readable, so never put phone numbers here.
//   testDeviceIds        [string]  AdMob test-device hashes (from logcat:
//                                  "Use RequestConfiguration...setTestDeviceIds").
//                                  These devices get test ads.
//   units                map       ad-unit overrides: androidBanner, androidInterstitial,
//                                  androidNative, androidRewarded, iosBanner,
//                                  iosInterstitial, iosNative, iosRewarded.
//
// Unit overrides must belong to the SAME AdMob account (publisher id) as the
// app ID compiled into AndroidManifest.xml / Info.plist. Units from another
// account are ignored: the SDK can't serve them under this app ID, and moving
// a suspended app's traffic to another account gets both accounts disabled.
import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

enum AdUnitKind { banner, interstitial, native, rewarded }

class AdRemoteConfig extends ChangeNotifier {
  AdRemoteConfig._();
  static final AdRemoteConfig I = AdRemoteConfig._();

  static const _collection = 'app';
  static const _doc = 'ads';

  bool _enabled = true;
  bool _interstitialsEnabled = true;
  bool _rewardedEnabled = true;
  Set<String> _noAdsUsers = const {};
  List<String> _testDeviceIds = const [];
  Map<String, String> _units = const {};

  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _sub;
  Future<void>? _firstLoad;

  List<String> get testDeviceIds => _testDeviceIds;

  /// Ads may be requested/shown for the current user right now.
  bool get adsAllowed => _enabled && !_currentUserExcluded();
  bool get interstitialsAllowed => adsAllowed && _interstitialsEnabled;
  bool get rewardedAllowed => adsAllowed && _rewardedEnabled;

  bool _currentUserExcluded() {
    if (_noAdsUsers.isEmpty) return false;
    try {
      final uid = FirebaseAuth.instance.currentUser?.uid;
      return uid != null && _noAdsUsers.contains(uid);
    } catch (_) {
      return false;
    }
  }

  /// Raw override for [kind] on the current platform, or null.
  String? unitOverride(AdUnitKind kind, {required bool android}) {
    final key = '${android ? 'android' : 'ios'}'
        '${kind.name[0].toUpperCase()}${kind.name.substring(1)}';
    final v = _units[key];
    return (v == null || v.isEmpty) ? null : v;
  }

  /// Loads the doc once (bounded by [timeout]) and keeps listening for edits.
  /// Never throws; on any failure the defaults (ads on) stay in place.
  Future<void> ensureLoaded({Duration timeout = const Duration(seconds: 3)}) {
    if (kIsWeb) return Future.value();
    return _firstLoad ??= _start(timeout);
  }

  Future<void> _start(Duration timeout) async {
    final first = Completer<void>();
    try {
      _sub = FirebaseFirestore.instance
          .collection(_collection)
          .doc(_doc)
          .snapshots()
          .listen((snap) {
        _apply(snap.data());
        if (!first.isCompleted) first.complete();
      }, onError: (Object err) {
        debugPrint('[AdRemoteConfig] listen error: $err');
        if (!first.isCompleted) first.complete();
      });
      await first.future.timeout(timeout, onTimeout: () {});
    } catch (err) {
      debugPrint('[AdRemoteConfig] load failed: $err');
    }
  }

  void _apply(Map<String, dynamic>? data) {
    final d = data ?? const <String, dynamic>{};
    bool flag(String k) => d[k] is bool ? d[k] as bool : true;
    List<String> strings(String k) => d[k] is List
        ? (d[k] as List)
            .whereType<String>()
            .map((s) => s.trim())
            .where((s) => s.isNotEmpty)
            .toList()
        : const <String>[];

    _enabled = flag('enabled');
    _interstitialsEnabled = flag('interstitialsEnabled');
    _rewardedEnabled = flag('rewardedEnabled');
    _noAdsUsers = strings('noAdsUsers').toSet();
    _testDeviceIds = strings('testDeviceIds');
    final rawUnits = d['units'];
    _units = rawUnits is Map
        ? {
            for (final e in rawUnits.entries)
              if (e.key is String && e.value is String)
                e.key as String: (e.value as String).trim(),
          }
        : const {};
    notifyListeners();
  }

  @visibleForTesting
  void debugApply(Map<String, dynamic>? data) => _apply(data);

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
