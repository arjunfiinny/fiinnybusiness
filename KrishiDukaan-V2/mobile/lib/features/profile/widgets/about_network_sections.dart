import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';

/// One brand logo from Admin > About page (`siteContent/about.partners`).
class AboutPartner {
  final String id;
  final String name;
  final String logoUrl;
  final String? website;

  const AboutPartner({required this.id, required this.name, required this.logoUrl, this.website});

  static AboutPartner? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final logo = (raw['logoUrl'] ?? '').toString();
    if (logo.isEmpty) return null;
    final site = (raw['website'] ?? '').toString();
    return AboutPartner(
      id: (raw['id'] ?? logo).toString(),
      name: (raw['name'] ?? '').toString(),
      logoUrl: logo,
      website: site.isEmpty ? null : site,
    );
  }
}

/// `siteContent/about` — the same doc web's AboutView.tsx reads, so an
/// admin's logo / image changes reach the app without a release.
class AboutPageContent {
  final bool partnersEnabled;
  final String? partnersTitle;
  final String? partnersSubtitle;
  final String? centerLogoUrl;
  final List<AboutPartner> partners;
  final bool presenceEnabled;
  final String? presenceTitle;
  final String? presenceSubtitle;
  final String? presenceImageUrl;

  const AboutPageContent({
    required this.partnersEnabled,
    this.partnersTitle,
    this.partnersSubtitle,
    this.centerLogoUrl,
    required this.partners,
    required this.presenceEnabled,
    this.presenceTitle,
    this.presenceSubtitle,
    this.presenceImageUrl,
  });

  factory AboutPageContent.fromMap(Map<String, dynamic>? d) {
    String? str(String key) {
      final v = (d?[key] ?? '').toString().trim();
      return v.isEmpty ? null : v;
    }

    final rawPartners = d?['partners'];
    return AboutPageContent(
      partnersEnabled: d?['partnersEnabled'] == true,
      partnersTitle: str('partnersTitle'),
      partnersSubtitle: str('partnersSubtitle'),
      centerLogoUrl: str('centerLogoUrl'),
      partners: rawPartners is List
          ? rawPartners.map(AboutPartner.fromMap).whereType<AboutPartner>().toList()
          : const [],
      presenceEnabled: d?['presenceEnabled'] == true,
      presenceTitle: str('presenceTitle'),
      presenceSubtitle: str('presenceSubtitle'),
      presenceImageUrl: str('presenceImageUrl'),
    );
  }

  bool get showPartners => partnersEnabled && partners.isNotEmpty;
  bool get showPresence => presenceEnabled && presenceImageUrl != null;
}

/// A single one-shot read, kept for the app session — About is rarely
/// opened twice, and it never needs a live listener.
final aboutContentProvider = FutureProvider<AboutPageContent>((ref) async {
  final snap = await FirebaseFirestore.instance.collection('siteContent').doc('about').get();
  return AboutPageContent.fromMap(snap.data());
});

const _maxOrbit = 8;
const _accent = AppColors.primaryLight;

Future<void> _open(String? url) async {
  if (url == null) return;
  final uri = Uri.tryParse(url);
  if (uri == null) return;
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

class _LogoCircle extends StatelessWidget {
  final String url;
  final String semanticLabel;
  final double size;
  final double borderWidth;

  const _LogoCircle({required this.url, required this.semanticLabel, required this.size, this.borderWidth = 1});

  @override
  Widget build(BuildContext context) {
    final cache = (size * MediaQuery.devicePixelRatioOf(context)).round();
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.16),
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.primaryContainer, width: borderWidth),
        boxShadow: const [BoxShadow(color: AppColors.cardShadow, blurRadius: 16, offset: Offset(0, 6))],
      ),
      child: CachedNetworkImage(
        imageUrl: url,
        fit: BoxFit.contain,
        memCacheWidth: cache,
        fadeInDuration: const Duration(milliseconds: 200),
        errorWidget: (_, _, _) => const Icon(Icons.storefront_outlined, color: AppColors.onSurfaceVariant),
        imageBuilder: (context, provider) => Semantics(
          label: semanticLabel,
          image: true,
          child: Image(image: provider, fit: BoxFit.contain),
        ),
      ),
    );
  }
}

/// Animated "brands connected with us": KrishiDukan in the centre, partner
/// logos orbiting it — mirrors web's AboutPartnersSection. Logos stay upright
/// (only their positions rotate); the animation stops when the system asks
/// for reduced motion and is paused by TickerMode when the route is hidden.
class AboutPartnersOrbit extends StatefulWidget {
  final String label;
  final String title;
  final String? subtitle;
  final List<AboutPartner> partners;
  final String? centerLogoUrl;

  const AboutPartnersOrbit({
    super.key,
    required this.label,
    required this.title,
    this.subtitle,
    required this.partners,
    this.centerLogoUrl,
  });

  @override
  State<AboutPartnersOrbit> createState() => _AboutPartnersOrbitState();
}

class _AboutPartnersOrbitState extends State<AboutPartnersOrbit> with SingleTickerProviderStateMixin {
  late final AnimationController _spin = AnimationController(vsync: this, duration: const Duration(seconds: 60));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _spin.stop();
    } else if (!_spin.isAnimating) {
      _spin.repeat();
    }
  }

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final orbit = widget.partners.take(_maxOrbit).toList();
    final extra = widget.partners.skip(_maxOrbit).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(widget.label.toUpperCase(),
            textAlign: TextAlign.center,
            style: AppTextStyles.caption.copyWith(
              color: AppColors.primary,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.2,
            )),
        const SizedBox(height: 6),
        Text(widget.title, textAlign: TextAlign.center, style: AppTextStyles.heading2),
        if (widget.subtitle != null) ...[
          const SizedBox(height: 8),
          Text(widget.subtitle!,
              textAlign: TextAlign.center,
              style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant)),
        ],
        const SizedBox(height: 16),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: AspectRatio(
              aspectRatio: 1,
              child: LayoutBuilder(builder: (context, box) {
                final side = box.maxWidth;
                final radius = side * 0.38;
                final item = side * (orbit.length <= 6 ? 0.24 : 0.21);
                final center = side * 0.36;
                // Built once; only their positions change per frame.
                final logos = [
                  for (final p in orbit)
                    GestureDetector(
                      onTap: p.website == null ? null : () => _open(p.website),
                      child: _LogoCircle(url: p.logoUrl, semanticLabel: p.name, size: item),
                    ),
                ];

                return RepaintBoundary(
                  child: AnimatedBuilder(
                    animation: _spin,
                    builder: (context, _) {
                      final offset = _spin.value * 2 * math.pi;
                      final angles = [
                        for (var i = 0; i < orbit.length; i++)
                          (i / orbit.length) * 2 * math.pi - math.pi / 2 + offset,
                      ];
                      return Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Positioned.fill(
                            child: CustomPaint(
                              painter: _OrbitPainter(
                                angles: angles,
                                radius: radius,
                                innerGap: center / 2,
                                outerGap: item / 2,
                              ),
                            ),
                          ),
                          for (var i = 0; i < orbit.length; i++)
                            Positioned(
                              left: side / 2 + radius * math.cos(angles[i]) - item / 2,
                              top: side / 2 + radius * math.sin(angles[i]) - item / 2,
                              child: logos[i],
                            ),
                          Positioned(
                            left: (side - center) / 2,
                            top: (side - center) / 2,
                            child: widget.centerLogoUrl != null
                                ? _LogoCircle(url: widget.centerLogoUrl!, semanticLabel: 'KrishiDukan', size: center, borderWidth: 4)
                                : _CenterAppIcon(size: center),
                          ),
                        ],
                      );
                    },
                  ),
                );
              }),
            ),
          ),
        ),
        if (extra.isNotEmpty) ...[
          const SizedBox(height: 12),
          SizedBox(
            height: 84,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(vertical: 6),
              itemCount: extra.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, i) => GestureDetector(
                onTap: extra[i].website == null ? null : () => _open(extra[i].website),
                child: _LogoCircle(url: extra[i].logoUrl, semanticLabel: extra[i].name, size: 72),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _CenterAppIcon extends StatelessWidget {
  final double size;
  const _CenterAppIcon({required this.size});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.14),
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.primaryContainer, width: 4),
        boxShadow: const [BoxShadow(color: AppColors.cardShadow, blurRadius: 24, offset: Offset(0, 8))],
      ),
      child: ClipOval(child: Image.asset('assets/icons/app_icon.png', fit: BoxFit.contain, semanticLabel: 'KrishiDukan')),
    );
  }
}

class _OrbitPainter extends CustomPainter {
  final List<double> angles;
  final double radius;
  final double innerGap;
  final double outerGap;

  _OrbitPainter({required this.angles, required this.radius, required this.innerGap, required this.outerGap});

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    canvas.drawCircle(c, radius + size.width * 0.09, ring..color = _accent.withValues(alpha: 0.10));
    canvas.drawCircle(c, radius, ring..color = _accent.withValues(alpha: 0.25));
    canvas.drawCircle(c, radius - size.width * 0.13, ring..color = _accent.withValues(alpha: 0.12));

    final spoke = Paint()
      ..color = _accent.withValues(alpha: 0.45)
      ..strokeWidth = 1;
    final dot = Paint()..color = _accent;
    for (final a in angles) {
      final dir = Offset(math.cos(a), math.sin(a));
      final end = c + dir * (radius - outerGap);
      canvas.drawLine(c + dir * innerGap, end, spoke);
      canvas.drawCircle(end, 3, dot);
    }
  }

  @override
  bool shouldRepaint(_OrbitPainter old) => old.angles != angles || old.radius != radius;
}

/// "Presence across India" — an admin-uploaded image, never a live map, so
/// opening About doesn't read any retailer/store data.
class AboutPresenceCard extends StatelessWidget {
  final String label;
  final String title;
  final String? subtitle;
  final String imageUrl;
  final String imageAlt;

  const AboutPresenceCard({
    super.key,
    required this.label,
    required this.title,
    this.subtitle,
    required this.imageUrl,
    required this.imageAlt,
  });

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(color: _accent, shape: BoxShape.circle),
            ),
            const SizedBox(width: 8),
            Text(label.toUpperCase(),
                style: AppTextStyles.caption.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.2,
                )),
          ],
        ),
        const SizedBox(height: 6),
        Text(title, style: AppTextStyles.heading2),
        if (subtitle != null) ...[
          const SizedBox(height: 8),
          Text(subtitle!, style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant)),
        ],
        const SizedBox(height: 12),
        ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: CachedNetworkImage(
            imageUrl: imageUrl,
            width: double.infinity,
            fit: BoxFit.fitWidth,
            memCacheWidth: (width * MediaQuery.devicePixelRatioOf(context)).round(),
            placeholder: (_, _) => Container(height: 200, color: AppColors.surfaceVariant),
            errorWidget: (_, _, _) => const SizedBox.shrink(),
            imageBuilder: (context, provider) => Semantics(
              label: imageAlt,
              image: true,
              child: Image(image: provider, width: double.infinity, fit: BoxFit.fitWidth),
            ),
          ),
        ),
      ],
    );
  }
}
