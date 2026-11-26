// lib/core/ads/ad_service.dart
import 'dart:async';
// import 'dart:io' show Platform; // Removed for web compatibility
import 'package:flutter/foundation.dart'
    show
        SynchronousFuture,
        debugPrint,
        kIsWeb,
        defaultTargetPlatform,
        TargetPlatform;
import 'package:google_mobile_ads/google_mobile_ads.dart';
import '../../services/ad_config.dart';
import 'ad_ids.dart';
import 'ad_remote_config.dart';

/// Default to false. Enable special diagnostics explicitly with
/// --dart-define=DIAG_BUILD=true (does not skip iOS init).
const bool kDiagBuild = bool.fromEnvironment('DIAG_BUILD', defaultValue: false);

String maskAdIdentifier(String value) {
  if (value.isEmpty) {
    return value;
  }
  if (value.length <= 10) {
    return value;
  }
  final prefix = value.substring(0, 8);
  final suffix = value.substring(value.length - 4);
  return '$prefix…$suffix';
}

class AdService {
  AdService._();
  static final AdService I = AdService._();
  static bool _ready = false;
  static bool get isReady => _ready;
  static void updateConsent({required bool authorized}) {
    AdConfig.authorized = authorized;
  }

  static AdRequest buildAdRequest() => AdConfig.adRequest();

  InterstitialAd? _inter;
  RewardedAd? _rewarded;

  DateTime _lastInterShown = DateTime.fromMillisecondsSinceEpoch(0);
  int _actionsSinceInter = 0;

  bool _adsEnabled = false;
  Future<void>? _inFlightInit;

  /// SDK initialised AND ads allowed right now by the remote `app/ads` doc
  /// (master switch, team accounts in `noAdsUsers`).
  bool get isEnabled => _adsEnabled && AdRemoteConfig.I.adsAllowed;

  bool _remoteListenerAttached = false;

  void _attachRemoteListener() {
    if (_remoteListenerAttached) return;
    _remoteListenerAttached = true;
    AdRemoteConfig.I.addListener(_onRemoteConfigChanged);
  }

  void _onRemoteConfigChanged() {
    if (!_adsEnabled) return;
    unawaited(_applyRequestConfiguration());
    if (!AdRemoteConfig.I.interstitialsAllowed) {
      _inter?.dispose();
      _inter = null;
    }
    if (!AdRemoteConfig.I.rewardedAllowed) {
      _rewarded?.dispose();
      _rewarded = null;
    } else {
      preloadRewarded();
    }
  }

  Future<void> _applyRequestConfiguration() {
    return MobileAds.instance.updateRequestConfiguration(
      RequestConfiguration(
        // Team phones listed in Firestore app/ads.testDeviceIds get test ads,
        // so their own views/taps never count against the AdMob account.
        testDeviceIds: AdRemoteConfig.I.testDeviceIds,
        maxAdContentRating: MaxAdContentRating.pg,
      ),
    );
  }

  Future<void> init() {
    if (_adsEnabled) {
      return SynchronousFuture<void>(null);
    }
    final pending = _inFlightInit;
    if (pending != null) {
      return pending;
    }

    final future = _initializeInternal();
    _inFlightInit = future;
    return future.whenComplete(() {
      if (identical(_inFlightInit, future)) _inFlightInit = null;
    });
  }

  static Future<void> initLater() async {
    try {
      if (kIsWeb) {
        _ready = false;
        return;
      }

      final bannerId = AdIds.banner;
      final appId = AdIds.appId;
      final missingIds = bannerId.isEmpty ||
          appId.isEmpty ||
          bannerId.contains('xxxx') ||
          appId.contains('xxxx') ||
          bannerId.contains('zzzz') ||
          appId.contains('zzzz') ||
          bannerId.contains('fill') ||
          appId.contains('fill');

      assert(() {
        debugPrint(
          '[AdService] initLater -> appId=${maskAdIdentifier(appId)} '
          'banner=${maskAdIdentifier(bannerId)} inter=${maskAdIdentifier(AdIds.interstitial)} '
          'rewarded=${maskAdIdentifier(AdIds.rewarded)} '
          'forceTestAds=$forceTestAds '
          'hasReal=${AdIds.hasRealIdsForCurrentPlatform}',
        );
        return true;
      }());

      if (!kIsWeb &&
          defaultTargetPlatform == TargetPlatform.iOS &&
          missingIds) {
        debugPrint('[AdService] iOS AdMob IDs missing – skipping init.');
        _ready = false;
        return;
      }

      await AdService.I.init();
      _ready = AdService.I.isEnabled;
    } catch (err, stackTrace) {
      _ready = false;
      debugPrint('[AdService] initLater failed: $err\n$stackTrace');
    }
  }

  Future<void> _initializeInternal() async {
    if (!_shouldEnableAds()) {
      _adsEnabled = false;
      _ready = false;
      return;
    }
    _attachRemoteListener();
    await AdRemoteConfig.I.ensureLoaded();
    if (!AdRemoteConfig.I.adsAllowed) {
      // Switched off remotely (or this is a team account): make no ad requests.
      // A later banner load calls initLater() again, so turning the switch
      // back on resumes ads without a restart.
      _adsEnabled = false;
      _ready = false;
      return;
    }
    try {
      // --- Google UMP Consent Flow ---
      final consentManager = ConsentInformation.instance;
      final params = ConsentRequestParameters(
        consentDebugSettings: ConsentDebugSettings(
            debugGeography: DebugGeography.debugGeographyDisabled,
            testIdentifiers: []),
      );

      final completer = Completer<void>();

      Future<void> initializeMobileAds() async {
        try {
          final canRequest = await consentManager.canRequestAds();
          final status = await consentManager.getConsentStatus();
          
          debugPrint('[AdService] UMP Status: $status, canRequestAds: $canRequest');

          if (canRequest) {
            final initStatus = await MobileAds.instance.initialize();
            assert(() {
              final entries = initStatus.adapterStatuses.entries.map((entry) {
                final state = entry.value.state.toString().split('.').last;
                return '${entry.key}:$state(${entry.value.description})';
              }).join(', ');
              debugPrint('[AdService] MobileAds initialised (adapters: $entries)');
              return true;
            }());
            
            await _applyRequestConfiguration();

            _adsEnabled = true;
            _ready = true;
            // Interstitials are loaded lazily by maybeShowInterstitial(); no
            // screen shows one at the moment, so don't request them up front.
            preloadRewarded();
          } else {
            debugPrint('[AdService] UMP Consent state does not allow ad requests yet.');
            _adsEnabled = false;
            _ready = false;
          }
        } catch (err, stackTrace) {
          debugPrint('[AdService] initializeMobileAds error: $err\n$stackTrace');
          _adsEnabled = false;
          _ready = false;
        } finally {
          if (!completer.isCompleted) completer.complete();
        }
      }

      consentManager.requestConsentInfoUpdate(
        params,
        () async {
          final status = await consentManager.getConsentStatus();
          if (status == ConsentStatus.required || await consentManager.isConsentFormAvailable()) {
            ConsentForm.loadAndShowConsentFormIfRequired(
              (FormError? formError) async {
                if (formError != null) {
                  debugPrint('[AdService] UMP Consent Form error: ${formError.message}');
                }
                await initializeMobileAds();
              },
            );
          } else {
             // Already has consent or not required (e.g. outside EEA/UK)
             await initializeMobileAds();
          }
        },
        (FormError formError) async {
          debugPrint('[AdService] UMP Consent update failed: ${formError.message}');
          // Attempt to initialize using cached consent if available
          await initializeMobileAds();
        },
      );

      await completer.future;
    } catch (err, stackTrace) {
      _adsEnabled = false;
      _ready = false;
      debugPrint(
          '[AdService] Google Mobile Ads init failed: $err\n$stackTrace');
    }
  }

  bool _shouldEnableAds() {
    if (kIsWeb) {
      return false;
    }
    if (!(defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS)) {
      return false;
    }

    // FORCE ENABLE for "original ads" request
    return true;
  }

  // ---------- Preload ----------
  void preloadInterstitial() {
    if (!isEnabled || !AdRemoteConfig.I.interstitialsAllowed || _inter != null) {
      return;
    }
    final unitId = AdIds.interstitial;
    if (unitId.isEmpty) return;
    InterstitialAd.load(
      adUnitId: unitId,
      request: AdService.buildAdRequest(),
      adLoadCallback: InterstitialAdLoadCallback(
        onAdLoaded: (ad) {
          ad.fullScreenContentCallback = FullScreenContentCallback(
            onAdDismissedFullScreenContent: (ad) {
              ad.dispose();
              _inter = null;
              preloadInterstitial();
            },
            onAdFailedToShowFullScreenContent: (ad, err) {
              ad.dispose();
              _inter = null;
              preloadInterstitial();
            },
          );
          _inter = ad;
        },
        onAdFailedToLoad: (_) => _inter = null,
      ),
    );
  }

  void preloadRewarded() {
    if (!isEnabled || !AdRemoteConfig.I.rewardedAllowed || _rewarded != null) {
      return;
    }
    final unitId = AdIds.rewarded;
    if (unitId.isEmpty) return;
    RewardedAd.load(
      adUnitId: unitId,
      request: AdService.buildAdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) {
          ad.fullScreenContentCallback = FullScreenContentCallback(
            onAdDismissedFullScreenContent: (ad) {
              ad.dispose();
              _rewarded = null;
              preloadRewarded();
            },
            onAdFailedToShowFullScreenContent: (ad, err) {
              ad.dispose();
              _rewarded = null;
              preloadRewarded();
            },
          );
          _rewarded = ad;
        },
        onAdFailedToLoad: (_) => _rewarded = null,
      ),
    );
  }

  // ---------- Interstitial logic ----------
  /// Shows an interstitial at a natural break, frequency-capped.
  /// Only call this AFTER a task finishes (e.g. a save completed) — never on
  /// a button tap that should do something else, and never as a reward.
  Future<void> maybeShowInterstitial({
    int minActions = 6,
    Duration minGap = const Duration(minutes: 3),
  }) async {
    if (!isEnabled || !AdRemoteConfig.I.interstitialsAllowed) {
      return;
    }
    _actionsSinceInter++;
    final now = DateTime.now();

    final allowed = _actionsSinceInter >= minActions &&
        now.difference(_lastInterShown) >= minGap &&
        _inter != null;

    if (!allowed) {
      preloadInterstitial();
      return;
    }

    final ad = _inter!;
    _inter = null;
    await ad.show();
    _lastInterShown = now;
    _actionsSinceInter = 0;
  }

  // ---------- Rewarded logic ----------
  /// A rewarded ad is loaded and allowed — offer it to the user (opt-in).
  bool get isRewardedReady =>
      isEnabled && AdRemoteConfig.I.rewardedAllowed && _rewarded != null;

  /// Shows the loaded rewarded ad and completes when the user CLOSES it,
  /// with true only if they earned the reward. (The SDK's show() resolves as
  /// soon as the ad appears, so awaiting it alone always reported false.)
  Future<bool> showRewarded(
      {required void Function(int, String) onReward}) async {
    if (!isEnabled || !AdRemoteConfig.I.rewardedAllowed) {
      return false;
    }
    final ad = _rewarded;
    if (ad == null) {
      preloadRewarded();
      return false;
    }
    _rewarded = null;
    var granted = false;
    final closed = Completer<bool>();
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (ad) {
        ad.dispose();
        preloadRewarded();
        if (!closed.isCompleted) closed.complete(granted);
      },
      onAdFailedToShowFullScreenContent: (ad, err) {
        ad.dispose();
        preloadRewarded();
        if (!closed.isCompleted) closed.complete(false);
      },
    );
    try {
      await ad.show(onUserEarnedReward: (ad, rewardItem) {
        granted = true;
        onReward(rewardItem.amount.toInt(), rewardItem.type);
      });
    } catch (err) {
      debugPrint('[AdService] showRewarded failed: $err');
      ad.dispose();
      preloadRewarded();
      return false;
    }
    return closed.future;
  }
}
