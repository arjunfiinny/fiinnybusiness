import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../../features/day_session/data/day_session.dart';
import '../../features/day_session/data/day_session_repository.dart';
import 'location_service.dart';

/// Records fresh, accurate fixes at roughly 15-minute intervals while a day
/// is open and the OS continues providing location updates.
///
/// Why: the end-of-day distance used to be start → visits → end, i.e. the
/// shortest road between the stops. A rep who took another road, or went
/// somewhere between visits, was credited the wrong distance. These breadcrumbs
/// let the route be rebuilt through the places the rep really was.
///
/// Android keeps this alive with a foreground service (hence the persistent
/// notification); iOS uses background location updates. If the OS or the rep
/// kills the app, tracking stops until the app is next opened. [ensureRunning]
/// resumes the stream; the next usable fix is saved after the interval gap.
class RouteTracker {
  RouteTracker._();

  static const interval = Duration(minutes: 15);

  /// A little under the interval, so a stream event arriving a few seconds
  /// early is still stored rather than skipped until the next cycle.
  static const _minGap = Duration(minutes: 14);

  static StreamSubscription<Position>? _sub;
  static String? _sessionId;
  static DateTime? _lastSavedAt;
  static int _generation = 0;
  static final Set<Future<void>> _pendingWrites = {};
  static final _repo = DaySessionRepository();

  static bool isTrackingSession(String sessionId) => _sessionId == sessionId;

  /// Starts (or keeps) tracking for [sessionId]. [lastPointAt] is the time of
  /// the newest point already stored, so a restart doesn't double-record.
  static Future<bool> ensureRunning(
    String sessionId, {
    DateTime? lastPointAt,
  }) async {
    if (isTrackingSession(sessionId)) return _sub != null;
    final generation = ++_generation;
    final oldSub = _sub;
    _sub = null;
    // Claim before awaiting cancellation so simultaneous callers cannot open
    // two streams for the same session.
    _sessionId = sessionId;
    try {
      await oldSub?.cancel();
      if (_generation != generation) return false;
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (_generation == generation) _sessionId = null;
        return false;
      }
      if (_generation != generation) return false;
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      // Android needs a separate background grant for updates after the app
      // leaves the screen. The foreground service still works when declined.
      if (!kIsWeb &&
          defaultTargetPlatform == TargetPlatform.android &&
          perm == LocationPermission.whileInUse) {
        perm = await Geolocator.requestPermission();
      }
      if (_generation != generation) return false;
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        _sessionId = null;
        return false;
      }

      _lastSavedAt = lastPointAt;

      _sub = Geolocator.getPositionStream(locationSettings: _settings()).listen(
        (p) {
          final write = _onPosition(sessionId, p);
          _pendingWrites.add(write);
          write.whenComplete(() => _pendingWrites.remove(write));
        },
        // A failed stream is no longer considered running, so reopening the
        // app can start a fresh one.
        onError: (_) {
          if (_generation == generation) {
            _sub = null;
            _sessionId = null;
          }
        },
        cancelOnError: true,
      );
      return true;
    } catch (_) {
      if (_generation == generation) {
        _sub = null;
        _sessionId = null;
      }
      return false;
    }
  }

  static Future<void> stop() async {
    ++_generation;
    final sub = _sub;
    _sub = null;
    _sessionId = null;
    _lastSavedAt = null;
    await sub?.cancel();
    // Cancellation does not await async Firestore callbacks. Wait before the
    // closing route reads the saved points.
    await Future.wait(_pendingWrites.toList());
  }

  static Future<void> _onPosition(String sessionId, Position p) async {
    if (_sessionId != sessionId) return;
    final now = DateTime.now();
    final age = now.difference(p.timestamp);
    if (age > const Duration(minutes: 2) ||
        age < const Duration(seconds: -30)) {
      return;
    }
    final last = _lastSavedAt;
    if (last != null && now.difference(last) < _minGap) return;
    if (p.accuracy > 200 || p.isMocked) return;
    _lastSavedAt = now;
    try {
      await _repo.addTrackPoint(
        sessionId,
        TrackPoint(
          point: LatLngPoint(p.latitude, p.longitude),
          at: p.timestamp,
          accuracyM: p.accuracy,
        ),
      );
    } catch (_) {
      // Allow the next event to retry instead of waiting out a full gap.
      if (_sessionId == sessionId) _lastSavedAt = last;
    }
  }

  static LocationSettings _settings() {
    if (kIsWeb) {
      return const LocationSettings(accuracy: LocationAccuracy.high);
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return AndroidSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 0,
          intervalDuration: interval,
          foregroundNotificationConfig: const ForegroundNotificationConfig(
            notificationTitle: 'Day in progress',
            notificationText:
                'KrishiDukaan Sales is recording your route. It stops when you end your day.',
            notificationIcon: AndroidResource(
              name: 'ic_launcher',
              defType: 'mipmap',
            ),
            enableWakeLock: true,
            setOngoing: true,
          ),
        );
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
        return AppleSettings(
          accuracy: LocationAccuracy.high,
          activityType: ActivityType.automotiveNavigation,
          distanceFilter: 0,
          pauseLocationUpdatesAutomatically: false,
          showBackgroundLocationIndicator: true,
          allowBackgroundLocationUpdates: true,
        );
      default:
        return const LocationSettings(accuracy: LocationAccuracy.high);
    }
  }
}
