import 'package:flutter/material.dart';
import '../../core/ads/ads_banner_card.dart';
import '../../services/b2b_language_service.dart';
import '../../services/local_database_helper.dart';
import 'package:intl/intl.dart';

class B2BOrderHistoryScreen extends StatefulWidget {
  final String userId;
  const B2BOrderHistoryScreen({required this.userId, super.key});

  @override
  State<B2BOrderHistoryScreen> createState() => _B2BOrderHistoryScreenState();
}

class _B2BOrderHistoryScreenState extends State<B2BOrderHistoryScreen> {
  final lang = B2BLanguageService();
  List<Map<String, dynamic>> _invoices = [];
  bool _isLoading = true;
  String _searchQuery = '';
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadInvoices();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadInvoices() async {
    setState(() => _isLoading = true);
    final db = await LocalDatabaseHelper.instance.database;
    final results = await db.query('invoices', orderBy: 'createdAt DESC');
    if (mounted) {
      setState(() {
        _invoices = results.map((r) => Map<String, dynamic>.from(r)).toList();
        _isLoading = false;
      });
    }
  }

  List<Map<String, dynamic>> get _filtered {
    if (_searchQuery.isEmpty) return _invoices;
    final q = _searchQuery.toLowerCase();
    return _invoices.where((inv) {
      final name = (inv['customerName'] as String? ?? '').toLowerCase();
      final phone = (inv['customerPhone'] as String? ?? '').toLowerCase();
      return name.contains(q) || phone.contains(q);
    }).toList();
  }

  double get _totalRevenue =>
      _invoices.fold(0.0, (sum, inv) => sum + ((inv['totalAmount'] as num?)?.toDouble() ?? 0.0));

  String _formatDate(String? iso) {
    if (iso == null) return '—';
    try {
      final dt = DateTime.parse(iso).toLocal();
      return DateFormat('dd MMM yyyy, hh:mm a').format(dt);
    } catch (_) {
      return iso;
    }
  }

  Color _syncColor(int? synced) => synced == 1 ? Colors.green : Colors.orange;
  String _syncLabel(int? synced) => synced == 1 ? 'Synced' : 'Offline';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[50],
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
        elevation: 1,
        title: Text(lang.t('Order History'), style: const TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh',
            onPressed: _loadInvoices,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // ── Summary Banner ──────────────────────────────────────────
                Container(
                  color: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                  child: Row(
                    children: [
                      Expanded(
                        child: _StatChip(
                          icon: Icons.receipt_long_rounded,
                          iconColor: Colors.purple.shade700,
                          bgColor: Colors.purple.shade50,
                          label: 'Total Orders',
                          value: '${_invoices.length}',
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _StatChip(
                          icon: Icons.currency_rupee_rounded,
                          iconColor: Colors.green.shade700,
                          bgColor: Colors.green.shade50,
                          label: 'Total Revenue',
                          value: '₹${_totalRevenue.toStringAsFixed(0)}',
                        ),
                      ),
                    ],
                  ),
                ),

                // ── Ad Banner ───────────────────────────────────────────────
                const AdsBannerCard(
                  placement: 'b2b_order_history_top',
                  inline: true,
                  inlineMaxHeight: 60,
                  margin: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  padding: EdgeInsets.zero,
                  backgroundColor: Colors.transparent,
                  boxShadow: [],
                  minHeight: 52,
                ),

                // ── Search ──────────────────────────────────────────────────
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Search by name or phone...',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: _searchQuery.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: () {
                                _searchController.clear();
                                setState(() => _searchQuery = '');
                              },
                            )
                          : null,
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                    onChanged: (v) => setState(() => _searchQuery = v),
                  ),
                ),

                // ── List ────────────────────────────────────────────────────
                Expanded(
                  child: _filtered.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.receipt_long_outlined, size: 72, color: Colors.grey[300]),
                              const SizedBox(height: 12),
                              Text(
                                _searchQuery.isNotEmpty ? 'No orders match your search.' : 'No orders yet.\nCreate a POS bill to see it here.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: Colors.grey[500], height: 1.5),
                              ),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _loadInvoices,
                          child: ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                            itemCount: _filtered.length + (_filtered.length > 4 ? 1 : 0), // extra slot for mid-list ad
                            itemBuilder: (ctx, i) {
                              // One ad slot after the 4th invoice (itemCount reserves exactly one).
                              // The old `i % 5 == 4` showed an ad at 9, 14, ... and hid those invoices.
                              if (_filtered.length > 4 && i == 4) {
                                return const Padding(
                                  padding: EdgeInsets.symmetric(vertical: 8),
                                  child: AdsBannerCard(
                                    placement: 'b2b_order_history_inline',
                                    inline: true,
                                    inlineMaxHeight: 60,
                                    margin: EdgeInsets.zero,
                                    padding: EdgeInsets.zero,
                                    backgroundColor: Colors.transparent,
                                    boxShadow: [],
                                    minHeight: 52,
                                  ),
                                );
                              }
                              final idx = i > 4 ? i - 1 : i; // offset after the ad slot
                              if (idx >= _filtered.length) return const SizedBox.shrink();
                              final inv = _filtered[idx];
                              final amount = (inv['totalAmount'] as num?)?.toDouble() ?? 0.0;
                              final synced = inv['synced'] as int?;
                              final customerName = inv['customerName'] as String? ?? 'Walk-in Customer';
                              final customerPhone = inv['customerPhone'] as String? ?? '';

                              return Card(
                                margin: const EdgeInsets.only(bottom: 10),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                elevation: 0,
                                child: ListTile(
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                  leading: CircleAvatar(
                                    backgroundColor: Colors.purple.shade50,
                                    radius: 24,
                                    child: Text(
                                      customerName[0].toUpperCase(),
                                      style: TextStyle(color: Colors.purple.shade700, fontWeight: FontWeight.bold, fontSize: 18),
                                    ),
                                  ),
                                  title: Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          customerName,
                                          style: const TextStyle(fontWeight: FontWeight.bold),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      Text(
                                        '₹${amount.toStringAsFixed(0)}',
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 16,
                                          color: Colors.green.shade700,
                                        ),
                                      ),
                                    ],
                                  ),
                                  subtitle: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      if (customerPhone.isNotEmpty)
                                        Text(customerPhone, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                                      const SizedBox(height: 4),
                                      Row(
                                        children: [
                                          Icon(Icons.access_time_rounded, size: 12, color: Colors.grey[400]),
                                          const SizedBox(width: 4),
                                          Text(
                                            _formatDate(inv['createdAt'] as String?),
                                            style: TextStyle(fontSize: 11, color: Colors.grey[500]),
                                          ),
                                          const Spacer(),
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: _syncColor(synced).withOpacity(0.12),
                                              borderRadius: BorderRadius.circular(20),
                                            ),
                                            child: Text(
                                              _syncLabel(synced),
                                              style: TextStyle(fontSize: 10, color: _syncColor(synced), fontWeight: FontWeight.bold),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                ),

                // ── Bottom Ad ───────────────────────────────────────────────
                SafeArea(
                  child: const AdsBannerCard(
                    placement: 'b2b_order_history_bottom',
                    inline: false,
                    inlineMaxHeight: 60,
                    margin: EdgeInsets.fromLTRB(12, 4, 12, 8),
                    padding: EdgeInsets.zero,
                    backgroundColor: Colors.transparent,
                    boxShadow: [],
                    minHeight: 52,
                  ),
                ),
              ],
            ),
    );
  }
}

// ── Stat chip widget ─────────────────────────────────────────────────────────
class _StatChip extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color bgColor;
  final String label;
  final String value;

  const _StatChip({
    required this.icon,
    required this.iconColor,
    required this.bgColor,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(icon, color: iconColor, size: 28),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(fontSize: 11, color: iconColor)),
              Text(value, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: iconColor)),
            ],
          ),
        ],
      ),
    );
  }
}
