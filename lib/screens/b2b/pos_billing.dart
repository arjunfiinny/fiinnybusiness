import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import '../../services/b2b_offline_sync_service.dart';
import '../../services/b2b_language_service.dart';
import '../../services/local_database_helper.dart';
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';
import 'barcode_scanner_screen.dart';

class POSBillingScreen extends StatefulWidget {
  final String userId;
  const POSBillingScreen({required this.userId, super.key});

  @override
  State<POSBillingScreen> createState() => _POSBillingScreenState();
}

class _POSBillingScreenState extends State<POSBillingScreen> {
  final _syncSvc = B2BOfflineSyncService();
  bool _isSaving = false;

  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();

  // Payment mode toggle
  bool _isUdhari = false;
  List<Map<String, dynamic>> _allCustomers = [];
  List<Map<String, dynamic>> _suggestions = [];
  bool _showSuggestions = false;

  List<Map<String, dynamic>> _cartItems = [];

  @override
  void initState() {
    super.initState();
    _loadCustomers();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _loadCustomers() async {
    final db = await LocalDatabaseHelper.instance.database;
    final rows = await db.query('b2b_contacts', orderBy: 'name ASC');
    if (mounted) {
      setState(() {
        _allCustomers = rows.map((r) => Map<String, dynamic>.from(r)).toList();
      });
    }
  }

  void _onPhoneChanged(String val) {
    final q = val.trim();
    if (q.length < 3) {
      setState(() { _suggestions = []; _showSuggestions = false; });
      return;
    }
    
    // Auto-fill exact match
    final exactMatch = _allCustomers.where((c) => (c['phone'] as String? ?? '') == q).toList();
    if (exactMatch.isNotEmpty && exactMatch.length == 1) {
      _nameController.text = exactMatch.first['name'] as String? ?? '';
      setState(() { _suggestions = []; _showSuggestions = false; });
      return;
    }

    final matched = _allCustomers.where((c) {
      final phone = (c['phone'] as String? ?? '');
      final name = (c['name'] as String? ?? '').toLowerCase();
      return phone.contains(q) || name.contains(q.toLowerCase());
    }).take(5).toList();
    setState(() {
      _suggestions = matched;
      _showSuggestions = matched.isNotEmpty;
    });
  }

  void _selectCustomer(Map<String, dynamic> customer) {
    _phoneController.text = customer['phone'] as String? ?? '';
    _nameController.text = customer['name'] as String? ?? '';
    setState(() { _showSuggestions = false; _suggestions = []; });
  }

  double get _cartTotal =>
      _cartItems.fold(0.0, (sum, item) => sum + ((item['price'] as double) * (item['qty'] as int)));

  // ── Save bill offline ────────────────────────────────────────────────────
  Future<void> _saveBill() async {
    if (_cartItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Cart is empty!')));
      return;
    }
    if (_isUdhari && _phoneController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Phone number required for Udhari!')));
      return;
    }

    setState(() => _isSaving = true);
    final invId = const Uuid().v4();
    await _syncSvc.saveInvoiceOffline({
      '_id': invId,
      'customerName': _nameController.text.isNotEmpty ? _nameController.text : 'Walk-in Customer',
      'customerPhone': _phoneController.text,
      'totalAmount': _cartTotal,
      'items': _cartItems,
    });
    if (_isUdhari) await _saveToKhataIfNeeded(_cartTotal);
    
    if (mounted) {
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_isUdhari ? 'Bill saved to Udhari ✅' : 'Bill saved on device ✅')),
      );
      Navigator.pop(context);
    }
  }

  Future<void> _saveToKhataIfNeeded(double amount) async {
    final phone = _phoneController.text.trim();
    final name = _nameController.text.isNotEmpty ? _nameController.text.trim() : 'Customer';
    final db = await LocalDatabaseHelper.instance.database;

    // Save contact if they don't exist
    await db.insert('b2b_contacts', {
      'contactId': phone,
      'name': name,
      'phone': phone,
      'type': 'CUSTOMER',
      'createdAt': DateTime.now().toIso8601String()
    }, conflictAlgorithm: ConflictAlgorithm.ignore);

    // Save as given (Udhari/Due)
    await db.insert('khata', {
      '_id': const Uuid().v4(),
      'customerId': phone,
      'customerName': name,
      'amount': amount,
      'type': 'given',
      'note': 'POS Invoice',
      'synced': 0,
      'createdAt': DateTime.now().toIso8601String(),
    });
  }

  // ── Generate the WhatsApp bill text ─────────────────────────────────────
  String _buildBillText() {
    final customerName = _nameController.text.isNotEmpty ? _nameController.text : 'Customer';
    final lines = StringBuffer();
    lines.writeln('🧾 *Bill from Fiinny POS*');
    lines.writeln('📅 ${DateTime.now().toLocal().toString().substring(0, 16)}');
    lines.writeln('👤 Customer: $customerName');
    if (_phoneController.text.isNotEmpty) {
      lines.writeln('📱 Phone: ${_phoneController.text}');
    }
    lines.writeln('');
    lines.writeln('*Items:*');
    for (final item in _cartItems) {
      final price = (item['price'] as double).toStringAsFixed(2);
      final qty = item['qty'] as int;
      final subtotal = ((item['price'] as double) * qty).toStringAsFixed(2);
      lines.writeln('• ${item['name']} × $qty = ₹$subtotal  (₹$price each)');
    }
    lines.writeln('');
    lines.writeln('━━━━━━━━━━━━━━━━━');
    lines.writeln('*Total: ₹${_cartTotal.toStringAsFixed(2)}*');
    lines.writeln('');
    lines.writeln('Thanks for your purchase! 🙏');
    lines.writeln('Powered by Fiinny — fiinny.com');
    return lines.toString();
  }

  // ── Share on WhatsApp (uses phone number if present) ────────────────────
  Future<void> _shareOnWhatsApp() async {
    if (_cartItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Add items first!')));
      return;
    }
    if (_isUdhari && _phoneController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Phone number required for Udhari!')));
      return;
    }
    setState(() => _isSaving = true);

    final billText = _buildBillText();
    final phone = _phoneController.text.replaceAll(RegExp(r'\D'), '');

    // Save the bill first before sharing
    final invId = const Uuid().v4();
    await _syncSvc.saveInvoiceOffline({
      '_id': invId,
      'customerName': _nameController.text.isNotEmpty ? _nameController.text : 'Walk-in Customer',
      'customerPhone': _phoneController.text,
      'totalAmount': _cartTotal,
      'items': _cartItems,
    });

    if (_isUdhari) await _saveToKhataIfNeeded(_cartTotal);

    if (!mounted) return;

    // If we have a phone number, share directly to that contact via WhatsApp
    if (phone.isNotEmpty) {
      // Normalize phone - ensure it's 10 digits for Indian numbers
      final normalized = phone.length >= 10 ? phone.substring(phone.length - 10) : phone;
      final waUrl = 'whatsapp://send?phone=91$normalized&text=${Uri.encodeComponent(billText)}';
      // ignore: deprecated_member_use
      final launched = await Share.shareUri(Uri.parse(waUrl)).then((_) => true).catchError((_) => false);
      if (!launched && mounted) {
        // Fallback – general share sheet
        // ignore: deprecated_member_use
        Share.share(billText, subject: 'Your Bill from Fiinny');
      }
    } else {
      // No phone — open general share sheet
      // ignore: deprecated_member_use
      Share.share(billText, subject: 'Your Bill from Fiinny');
    }

    if (mounted) {
      setState(() => _isSaving = false);
      Navigator.pop(context);
    }
  }

  Future<void> _scanBarcode() async {
    final result = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (context) => const BarcodeScannerScreen()),
    );
    if (result != null && mounted) {
      setState(() {
        _cartItems.add({'name': 'Scanned: $result', 'price': 100.0, 'qty': 1, 'barcode': result});
      });
    }
  }

  void _showAddItemOptions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(8)),
            ),
            ListTile(
              leading: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.indigo.shade50, shape: BoxShape.circle),
                child: Icon(Icons.qr_code_scanner_rounded, color: Colors.indigo.shade700),
              ),
              title: const Text('Scan Barcode', style: TextStyle(fontWeight: FontWeight.bold)),
              subtitle: const Text('Use camera to scan product barcode'),
              onTap: () { Navigator.pop(ctx); _scanBarcode(); },
            ),
            const Divider(indent: 72, endIndent: 16),
            ListTile(
              leading: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.green.shade50, shape: BoxShape.circle),
                child: Icon(Icons.inventory_2_outlined, color: Colors.green.shade700),
              ),
              title: const Text('Pick from Inventory', style: TextStyle(fontWeight: FontWeight.bold)),
              subtitle: const Text('Browse and select from your stock'),
              onTap: () { Navigator.pop(ctx); _showInventoryPicker(); },
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  void _showInventoryPicker() async {
    final db = await LocalDatabaseHelper.instance.database;
    final items = await db.query('inventory', orderBy: 'name ASC');
    if (!mounted) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _InventoryPickerSheet(
        items: items,
        onAddToCart: (item, qty) {
          setState(() {
            final existing = _cartItems.indexWhere((c) => c['_id'] == item['_id']);
            if (existing >= 0) {
              _cartItems[existing]['qty'] = (_cartItems[existing]['qty'] as int) + qty;
            } else {
              _cartItems.add({
                '_id': item['_id'],
                'name': item['name'],
                'price': (item['rate'] as double?) ?? (item['price'] as double?) ?? 0.0,
                'qty': qty,
              });
            }
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${item['name']} × $qty added')),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final lang = B2BLanguageService();
    final hasPhone = _phoneController.text.trim().isNotEmpty;
    return Scaffold(
      backgroundColor: Colors.grey[100],
      appBar: AppBar(
        title: Text(lang.t('New Invoice (POS)'), style: const TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
        elevation: 1,
        actions: [
          Padding(padding: const EdgeInsets.only(right: 8.0), child: buildB2BLanguageDropdown()),
          IconButton(
            icon: const Icon(Icons.add_shopping_cart_rounded, color: Colors.indigo),
            tooltip: 'Add Item',
            onPressed: _showAddItemOptions,
          ),
        ],
      ),
      body: GestureDetector(
        onTap: () => setState(() => _showSuggestions = false),
        child: Column(
          children: [
            // ── Customer Info ────────────────────────────────────────────
            Container(
              color: Colors.white,
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  // Phone field with autocomplete
                  TextField(
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    decoration: InputDecoration(
                      labelText: 'Customer Phone',
                      prefixIcon: const Icon(Icons.phone),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      contentPadding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onChanged: _onPhoneChanged,
                  ),
                  // Autocomplete dropdown
                  if (_showSuggestions && _suggestions.isNotEmpty)
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border.all(color: Colors.grey.shade200),
                        borderRadius: BorderRadius.circular(8),
                        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.07), blurRadius: 8)],
                      ),
                      child: ListView.separated(
                        shrinkWrap: true,
                        itemCount: _suggestions.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (ctx, i) {
                          final c = _suggestions[i];
                          return ListTile(
                            dense: true,
                            leading: CircleAvatar(
                              radius: 16,
                              backgroundColor: Colors.indigo.shade50,
                              child: Text(
                                (c['name'] as String? ?? '?')[0].toUpperCase(),
                                style: TextStyle(fontSize: 12, color: Colors.indigo.shade700, fontWeight: FontWeight.bold),
                              ),
                            ),
                            title: Text(c['name'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                            subtitle: Text(c['phone'] as String? ?? '', style: const TextStyle(fontSize: 12)),
                            onTap: () => _selectCustomer(c),
                          );
                        },
                      ),
                    ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _nameController,
                    textCapitalization: TextCapitalization.words,
                    decoration: InputDecoration(
                      labelText: 'Customer Name (Optional)',
                      prefixIcon: const Icon(Icons.person),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      contentPadding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),

            // ── Cart Header ──────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Cart (${_cartItems.length} items)',
                      style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.grey)),
                  TextButton.icon(
                    onPressed: _showAddItemOptions,
                    icon: const Icon(Icons.add),
                    label: const Text('Add Item'),
                  )
                ],
              ),
            ),

            // ── Cart List ────────────────────────────────────────────────
            Expanded(
              child: _cartItems.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.shopping_cart_outlined, size: 64, color: Colors.grey[300]),
                          const SizedBox(height: 12),
                          Text(
                            'Tap "Add Item" to add products\nfrom inventory or scan a barcode.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.grey[500]),
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      itemCount: _cartItems.length,
                      itemBuilder: (context, index) {
                        final item = _cartItems[index];
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          child: ListTile(
                            title: Text(item['name'], style: const TextStyle(fontWeight: FontWeight.bold)),
                            subtitle: Row(
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.remove_circle_outline, size: 20, color: Colors.grey),
                                  padding: EdgeInsets.zero,
                                  visualDensity: VisualDensity.compact,
                                  onPressed: () {
                                    setState(() {
                                      if ((item['qty'] as int) > 1) {
                                        _cartItems[index]['qty'] = (item['qty'] as int) - 1;
                                      }
                                    });
                                  },
                                ),
                                Text('${item['qty']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                IconButton(
                                  icon: const Icon(Icons.add_circle_outline, size: 20, color: Colors.grey),
                                  padding: EdgeInsets.zero,
                                  visualDensity: VisualDensity.compact,
                                  onPressed: () {
                                    setState(() => _cartItems[index]['qty'] = (item['qty'] as int) + 1);
                                  },
                                ),
                                Text('× ₹${(item['price'] as double).toStringAsFixed(2)}',
                                    style: const TextStyle(fontSize: 12, color: Colors.grey)),
                              ],
                            ),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  '₹${((item['price'] as double) * (item['qty'] as int)).toStringAsFixed(2)}',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline, color: Colors.red, size: 20),
                                  onPressed: () => setState(() => _cartItems.removeAt(index)),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),

      // ── Bottom Action Bar ────────────────────────────────────────────────
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          decoration: BoxDecoration(
            color: Colors.white,
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, -5))],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Total', style: TextStyle(fontSize: 16, color: Colors.grey)),
                  Text(
                    '₹${_cartTotal.toStringAsFixed(2)}',
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Colors.green),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              
              // Payment Mode Toggle
              Container(
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                padding: const EdgeInsets.all(4),
                child: Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setState(() => _isUdhari = false),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: !_isUdhari ? Colors.white : Colors.transparent,
                            borderRadius: BorderRadius.circular(8),
                            boxShadow: !_isUdhari ? [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4)] : [],
                          ),
                          alignment: Alignment.center,
                          child: Text(lang.t('Paid (Cash/Online)'), 
                            style: TextStyle(fontWeight: FontWeight.bold, color: !_isUdhari ? Colors.green.shade700 : Colors.grey.shade600, fontSize: 13)
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setState(() => _isUdhari = true),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: _isUdhari ? Colors.white : Colors.transparent,
                            borderRadius: BorderRadius.circular(8),
                            boxShadow: _isUdhari ? [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4)] : [],
                          ),
                          alignment: Alignment.center,
                          child: Text(lang.t('Add to Udhari'), 
                            style: TextStyle(fontWeight: FontWeight.bold, color: _isUdhari ? Colors.orange.shade700 : Colors.grey.shade600, fontSize: 13)
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // Two action buttons
              Row(
                children: [
                  // Save on device
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _isSaving ? null : _saveBill,
                      icon: const Icon(Icons.save_alt_rounded, size: 20),
                      label: const Text('Save Bill'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.indigo,
                        side: const BorderSide(color: Colors.indigo),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  // Share on WhatsApp
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: _isSaving ? null : _shareOnWhatsApp,
                      icon: const Icon(Icons.send_rounded, size: 20),
                      label: Text(
                        hasPhone ? 'WhatsApp Bill' : 'Share Bill',
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF25D366), // WhatsApp green
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Inventory Picker Sheet ──────────────────────────────────────────────────

class _InventoryPickerSheet extends StatefulWidget {
  final List<Map<String, Object?>> items;
  final void Function(Map<String, Object?> item, int qty) onAddToCart;

  const _InventoryPickerSheet({required this.items, required this.onAddToCart});

  @override
  State<_InventoryPickerSheet> createState() => _InventoryPickerSheetState();
}

class _InventoryPickerSheetState extends State<_InventoryPickerSheet> {
  String _search = '';
  final Map<String, int> _quantities = {};

  List<Map<String, Object?>> get _filtered {
    if (_search.isEmpty) return widget.items;
    final q = _search.toLowerCase();
    return widget.items.where((i) => (i['name'] as String? ?? '').toLowerCase().contains(q)).toList();
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (ctx, scrollController) {
        return Column(
          children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.only(top: 12, bottom: 8),
              decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(8)),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Icon(Icons.inventory_2_outlined, color: Colors.green.shade700),
                  const SizedBox(width: 8),
                  const Text('Pick from Inventory', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: TextField(
                autofocus: false,
                decoration: InputDecoration(
                  hintText: 'Search products...',
                  prefixIcon: const Icon(Icons.search),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  contentPadding: const EdgeInsets.symmetric(vertical: 8),
                ),
                onChanged: (v) => setState(() => _search = v),
              ),
            ),
            const Divider(height: 1),
            if (_filtered.isEmpty)
              const Expanded(child: Center(child: Text('No products in inventory.', style: TextStyle(color: Colors.grey))))
            else
              Expanded(
                child: ListView.builder(
                  controller: scrollController,
                  itemCount: _filtered.length,
                  itemBuilder: (ctx, i) {
                    final item = _filtered[i];
                    final id = item['_id'] as String? ?? i.toString();
                    final qty = _quantities[id] ?? 1;
                    final price = (item['rate'] as double?) ?? (item['price'] as double?) ?? 0.0;
                    final stock = item['stockCount'] as int? ?? 0;

                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: Colors.green.shade50,
                        child: Text(
                          (item['name'] as String? ?? '?')[0].toUpperCase(),
                          style: TextStyle(color: Colors.green.shade700, fontWeight: FontWeight.bold),
                        ),
                      ),
                      title: Text(item['name'] as String? ?? 'Unknown',
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text('₹${price.toStringAsFixed(2)}  •  Stock: $stock',
                          style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.remove_circle_outline, size: 20),
                            padding: EdgeInsets.zero,
                            visualDensity: VisualDensity.compact,
                            onPressed: qty > 1 ? () => setState(() => _quantities[id] = qty - 1) : null,
                          ),
                          Text('$qty', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          IconButton(
                            icon: const Icon(Icons.add_circle_outline, size: 20),
                            padding: EdgeInsets.zero,
                            visualDensity: VisualDensity.compact,
                            onPressed: () => setState(() => _quantities[id] = qty + 1),
                          ),
                          const SizedBox(width: 4),
                          ElevatedButton(
                            onPressed: () { widget.onAddToCart(item, qty); Navigator.pop(ctx); },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.green.shade700,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            child: const Text('Add', style: TextStyle(fontSize: 13)),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
          ],
        );
      },
    );
  }
}
