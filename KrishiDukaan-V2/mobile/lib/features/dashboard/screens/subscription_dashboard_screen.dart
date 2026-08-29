import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/subscription_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../data/dashboard_repository.dart';
import '../providers/dashboard_provider.dart';

/// Seller-facing subscription management — the app's equivalent of web's
/// `/dashboard/subscription` page, which the app had no counterpart for at
/// all: `/subscription` on mobile goes straight to the PURCHASE screen, so a
/// seller could buy seats but never see what they had bought or what was
/// using them.
///
/// Three sections, matching web: seat summary, Subscription History, and
/// Active Listings (with per-row release).
class SubscriptionDashboardScreen extends ConsumerWidget {
  const SubscriptionDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const AppTopBar(title: 'Subscription'),
      body: userAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => const Center(child: Text('Not logged in.')),
        data: (user) {
          if (user == null) {
            return const Center(child: Text('Not logged in.'));
          }
          return _Body(phone: user.phone);
        },
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  final String phone;
  const _Body({required this.phone});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(seatStatsProvider(phone));
    ref.invalidate(subscriptionHistoryProvider(phone));
    ref.invalidate(activeSeatListingsProvider(phone));
    await Future.wait([
      ref.read(seatStatsProvider(phone).future),
      ref.read(subscriptionHistoryProvider(phone).future),
      ref.read(activeSeatListingsProvider(phone).future),
    ]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(seatStatsProvider(phone));
    final historyAsync = ref.watch(subscriptionHistoryProvider(phone));
    final listingsAsync = ref.watch(activeSeatListingsProvider(phone));

    return RefreshIndicator(
      onRefresh: () => _refresh(ref),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Seat summary ───────────────────────────────────────────────
          statsAsync.when(
            loading: () => const _SeatSkeleton(),
            error: (_, _) => const SizedBox.shrink(),
            data: (stats) => GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 2.1,
              children: [
                _StatTile(label: 'Seats purchased', value: '${stats.totalPurchased}'),
                _StatTile(label: 'Seats used', value: '${stats.activeUsed}'),
                _StatTile(
                  label: 'Available',
                  value: '${stats.available}',
                  highlight: stats.available > 0,
                ),
                _StatTile(
                  label: 'Expiring soon',
                  value: '${stats.expiringSoon}',
                  // Only worth drawing the eye when there's something to act on.
                  warning: stats.expiringSoon > 0,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () => context.push('/subscription'),
              icon: const Icon(Icons.add_shopping_cart, size: 18),
              label: const Text('Buy more seats'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),

          // ── Subscription history ───────────────────────────────────────
          Text('Subscription History', style: AppTextStyles.heading3),
          const SizedBox(height: 8),
          historyAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (_, _) => const _ErrorNote('Could not load your subscriptions.'),
            data: (subs) => subs.isEmpty
                ? const _EmptyNote(
                    icon: Icons.receipt_long_outlined,
                    text: 'No subscriptions yet.',
                  )
                : Column(
                    children: [for (final s in subs) _SubscriptionCard(sub: s)],
                  ),
          ),
          const SizedBox(height: 24),

          // ── Active listings ────────────────────────────────────────────
          Row(
            children: [
              Text('Active Listings', style: AppTextStyles.heading3),
              const SizedBox(width: 6),
              listingsAsync.maybeWhen(
                data: (l) => Text(
                  '(${l.length})',
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.onSurfaceVariant),
                ),
                orElse: () => const SizedBox.shrink(),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            'Each of these is using one of your seats.',
            style: AppTextStyles.bodySmall
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
          const SizedBox(height: 8),
          listingsAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (_, _) => const _ErrorNote('Could not load active listings.'),
            data: (listings) => listings.isEmpty
                ? const _EmptyNote(
                    icon: Icons.inventory_2_outlined,
                    text: 'No seats in use right now.',
                  )
                : Column(
                    children: [
                      for (final l in listings)
                        _SeatListingCard(
                          listing: l,
                          onReleased: () => _refresh(ref),
                        ),
                    ],
                  ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

// ── Pieces ───────────────────────────────────────────────────────────────────

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;
  final bool warning;

  const _StatTile({
    required this.label,
    required this.value,
    this.highlight = false,
    this.warning = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = warning
        ? Colors.orange.shade800
        : highlight
            ? AppColors.primary
            : AppColors.onSurface;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(value,
              style: AppTextStyles.heading2.copyWith(color: color)),
          const SizedBox(height: 2),
          Text(label,
              style: AppTextStyles.bodySmall
                  .copyWith(color: AppColors.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class _SeatSkeleton extends StatelessWidget {
  const _SeatSkeleton();
  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      );
}

String _fmtDate(DateTime? d) {
  if (d == null) return '—';
  return '${d.day.toString().padLeft(2, '0')}/'
      '${d.month.toString().padLeft(2, '0')}/${d.year}';
}

class _SubscriptionCard extends StatelessWidget {
  final SubscriptionModel sub;
  const _SubscriptionCard({required this.sub});

  @override
  Widget build(BuildContext context) {
    final (badgeText, badgeColor) = sub.isExpired
        ? ('Expired', AppColors.onSurfaceVariant)
        : sub.status == 'active'
            ? ('Active', AppColors.success)
            : (sub.status, Colors.orange.shade800);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  sub.planName,
                  style: AppTextStyles.bodyMedium
                      .copyWith(fontWeight: FontWeight.bold),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: badgeColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  badgeText,
                  style: AppTextStyles.caption.copyWith(
                    color: badgeColor,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 14,
            runSpacing: 4,
            children: [
              _Fact(
                label: 'Seats',
                value: '${sub.seatsPurchased}',
              ),
              if (sub.durationMonths > 0)
                _Fact(label: 'Duration', value: '${sub.durationMonths} mo'),
              if (sub.amountPaid > 0)
                _Fact(
                  label: 'Paid',
                  value: CurrencyUtils.format(sub.amountPaid),
                ),
              _Fact(label: 'Start', value: _fmtDate(sub.startDate)),
              _Fact(label: 'Expires', value: _fmtDate(sub.expiryDate)),
            ],
          ),
          if (sub.activatedByAdmin || sub.razorpayPaymentId != null) ...[
            const SizedBox(height: 6),
            Text(
              sub.activatedByAdmin
                  ? 'Activated by admin'
                  : 'Payment ${sub.razorpayPaymentId}',
              style: AppTextStyles.caption
                  .copyWith(color: AppColors.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  final String label;
  final String value;
  const _Fact({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return RichText(
      text: TextSpan(
        style: AppTextStyles.bodySmall,
        children: [
          TextSpan(
            text: '$label: ',
            style: AppTextStyles.bodySmall
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
          TextSpan(
            text: value,
            style: AppTextStyles.bodySmall
                .copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _SeatListingCard extends StatefulWidget {
  final SeatListingModel listing;
  final VoidCallback onReleased;
  const _SeatListingCard({required this.listing, required this.onReleased});

  @override
  State<_SeatListingCard> createState() => _SeatListingCardState();
}

class _SeatListingCardState extends State<_SeatListingCard> {
  bool _releasing = false;

  Future<void> _confirmRelease() async {
    final l = widget.listing;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Release this seat?'),
        content: Text(
          l.isAssigned
              ? 'This removes "${l.productName ?? 'the product'}" from that '
                  'retailer and frees the seat. The product itself is not deleted.'
              : 'This frees the seat used by "${l.productName ?? 'this product'}". '
                  'The product itself is not deleted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Release'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() => _releasing = true);
    try {
      await DashboardRepository().releaseSeatListing(l.id);
      if (mounted) widget.onReleased();
    } catch (e) {
      if (mounted) {
        setState(() => _releasing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not release: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.listing;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 46,
              height: 46,
              child: (l.productImage ?? '').isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: l.productImage!,
                      fit: BoxFit.cover,
                      memCacheWidth: 140,
                      errorWidget: (_, _, _) => _placeholder(),
                      placeholder: (_, _) => _placeholder(),
                    )
                  : _placeholder(),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l.productName?.isNotEmpty == true
                      ? l.productName!
                      : 'Product removed',
                  style: AppTextStyles.bodyMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: (l.isAssigned
                                ? AppColors.secondary
                                : AppColors.primary)
                            .withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        l.isAssigned ? 'Assigned' : 'Own',
                        style: AppTextStyles.caption.copyWith(
                          color: l.isAssigned
                              ? AppColors.secondary
                              : AppColors.primary,
                          fontWeight: FontWeight.w800,
                          fontSize: 9,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        'Expires ${_fmtDate(l.expiresAt)}',
                        style: AppTextStyles.caption
                            .copyWith(color: AppColors.onSurfaceVariant),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          _releasing
              ? const Padding(
                  padding: EdgeInsets.all(8),
                  child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              : IconButton(
                  tooltip: 'Release seat',
                  icon: const Icon(Icons.link_off, size: 20),
                  color: AppColors.error,
                  onPressed: _confirmRelease,
                ),
        ],
      ),
    );
  }

  Widget _placeholder() => Container(
        color: AppColors.primaryContainer.withValues(alpha: 0.3),
        child: const Icon(Icons.image_outlined,
            color: AppColors.primary, size: 20),
      );
}

class _EmptyNote extends StatelessWidget {
  final IconData icon;
  final String text;
  const _EmptyNote({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.divider),
        ),
        child: Column(
          children: [
            Icon(icon, size: 34, color: AppColors.onSurfaceVariant),
            const SizedBox(height: 8),
            Text(text,
                style: AppTextStyles.bodySmall
                    .copyWith(color: AppColors.onSurfaceVariant)),
          ],
        ),
      );
}

class _ErrorNote extends StatelessWidget {
  final String message;
  const _ErrorNote(this.message);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(16),
        child: Text(message,
            style: AppTextStyles.bodySmall.copyWith(color: AppColors.error)),
      );
}
