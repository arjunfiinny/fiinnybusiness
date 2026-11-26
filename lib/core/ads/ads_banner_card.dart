// lib/core/ads/ads_banner_card.dart
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'package:provider/provider.dart';
import '../../services/subscription_service.dart';
import 'ad_remote_config.dart';
import 'ad_slots.dart';

/// Card around an inline banner. Shows nothing at all until an ad has loaded,
/// and nothing when ads are off (premium, remote switch, no fill).
class AdsBannerCard extends StatefulWidget {
  /// Identifier for the placement. Used in the default placeholder copy.
  final String placement;

  /// Whether the banner is inline (adaptive inline) or anchored.
  final bool inline;

  /// Optional max height hint for inline banners.
  final int? inlineMaxHeight;

  /// Margin applied outside of the card.
  final EdgeInsets margin;

  /// Padding applied inside the card around the ad widget.
  final EdgeInsets padding;

  /// Minimum height to reserve for the card so layouts do not collapse.
  final double minHeight;

  /// Background color for the card container.
  final Color backgroundColor;

  /// Border radius for the card container.
  final BorderRadius borderRadius;

  /// Optional card shadow. Pass empty list to remove.
  final List<BoxShadow> boxShadow;

  /// Alignment for both placeholder and banner.
  final Alignment alignment;

  /// No longer shown: the card stays hidden until an ad loads. Kept so
  /// existing call sites compile.
  final Widget? placeholder;

  /// Duration for fade/size transitions.
  final Duration animationDuration;

  /// Curve for fade transitions.
  final Curve animationCurve;

  /// Forward banner load state changes to parent listeners.
  final void Function(bool isLoaded)? onLoadChanged;

  const AdsBannerCard({
    super.key,
    required this.placement,
    this.inline = true,
    this.inlineMaxHeight,
    this.margin = EdgeInsets.zero,
    this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    this.minHeight = 96,
    this.backgroundColor = Colors.white,
    this.borderRadius = const BorderRadius.all(Radius.circular(18)),
    this.boxShadow = const [
      BoxShadow(color: Color(0x12000000), blurRadius: 18, offset: Offset(0, 10)),
    ],
    this.alignment = Alignment.center,
    this.placeholder,
    this.animationDuration = const Duration(milliseconds: 200),
    this.animationCurve = Curves.easeInOut,
    this.onLoadChanged,
  });

  @override
  State<AdsBannerCard> createState() => _AdsBannerCardState();
}

class _AdsBannerCardState extends State<AdsBannerCard> with AutomaticKeepAliveClientMixin {
  bool _loaded = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    AdRemoteConfig.I.addListener(_onRemoteConfig);
  }

  @override
  void dispose() {
    AdRemoteConfig.I.removeListener(_onRemoteConfig);
    super.dispose();
  }

  void _onRemoteConfig() {
    if (mounted) setState(() {});
  }

  void _handleLoad(bool loaded) {
    if (!mounted) {
      _loaded = loaded;
      return;
    }

    void updateState() {
      if (!mounted) return;
      if (_loaded != loaded) {
        setState(() => _loaded = loaded);
      } else {
        _loaded = loaded;
      }
      widget.onLoadChanged?.call(loaded);
    }

    final scheduler = SchedulerBinding.instance;
    if (scheduler.schedulerPhase == SchedulerPhase.idle ||
        scheduler.schedulerPhase == SchedulerPhase.postFrameCallbacks) {
      updateState();
    } else {
      scheduler.addPostFrameCallback((_) => updateState());
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    // Globally hide ads for Premium/Pro users
    final isPremium = Provider.of<SubscriptionService>(context).isPremium;
    if (isPremium) return const SizedBox.shrink();

    // Switched off from Firestore app/ads (or a team account): no empty card.
    if (!AdRemoteConfig.I.adsAllowed) return const SizedBox.shrink();

    // The card is invisible and takes no space until an ad has actually
    // loaded, so users never see an empty card with a spinner (slow load,
    // no fill, suspended account). The slot stays mounted offstage so the
    // ad can still load in the background.
    return Visibility(
      visible: _loaded,
      maintainState: true,
      maintainAnimation: true,
      maintainSize: false,
      child: Container(
        margin: widget.margin,
        padding: widget.padding,
        constraints: BoxConstraints(minHeight: widget.minHeight),
        decoration: BoxDecoration(
          color: widget.backgroundColor,
          borderRadius: widget.borderRadius,
          boxShadow: widget.boxShadow,
        ),
        alignment: widget.alignment,
        child: AdsBannerSlot(
          key: ValueKey('ads-banner-${widget.placement}'),
          inline: widget.inline,
          inlineMaxHeight: widget.inlineMaxHeight,
          padding: EdgeInsets.zero,
          alignment: widget.alignment,
          onLoadChanged: _handleLoad,
        ),
      ),
    );
  }
}

