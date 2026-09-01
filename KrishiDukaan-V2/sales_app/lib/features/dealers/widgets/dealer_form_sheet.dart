import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/services/location_service.dart';
import '../data/dealer.dart';

/// Add / edit sheet for the dealer master.
///
/// Returns the [DealerInput] to save, or null if dismissed — the caller owns
/// the write so the list can refresh itself once.
class DealerFormSheet extends StatefulWidget {
  const DealerFormSheet({super.key, this.initial});

  final Dealer? initial;

  static Future<DealerInput?> show(BuildContext context, {Dealer? initial}) {
    return showModalBottomSheet<DealerInput>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => DealerFormSheet(initial: initial),
    );
  }

  @override
  State<DealerFormSheet> createState() => _DealerFormSheetState();
}

class _DealerFormSheetState extends State<DealerFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _shop;
  late final TextEditingController _owner;
  late final TextEditingController _phone;
  late final TextEditingController _address;
  late DealerType _type;

  LatLngPoint? _geo;
  bool _locating = false;
  String? _geoError;

  bool get _isEdit => widget.initial != null;

  @override
  void initState() {
    super.initState();
    final d = widget.initial;
    _shop = TextEditingController(text: d?.shopName ?? '');
    _owner = TextEditingController(text: d?.ownerName ?? '');
    _phone = TextEditingController(text: d?.phone ?? '');
    _address = TextEditingController(text: d?.address ?? '');
    _type = d?.type ?? DealerType.retailer;
    _geo = d?.geo;
  }

  @override
  void dispose() {
    _shop.dispose();
    _owner.dispose();
    _phone.dispose();
    _address.dispose();
    super.dispose();
  }

  Future<void> _capture() async {
    setState(() {
      _locating = true;
      _geoError = null;
    });
    try {
      final point = await LocationService.current();
      if (mounted) setState(() => _geo = point);
    } on LocationException catch (e) {
      if (mounted) setState(() => _geoError = e.message);
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_geo == null) {
      setState(
        () => _geoError =
            'Capture the shop location — it is what puts this dealer on your route map.',
      );
      return;
    }
    Navigator.pop(
      context,
      DealerInput(
        shopName: _shop.text,
        ownerName: _owner.text,
        phone: _phone.text,
        address: _address.text,
        type: _type,
        geo: _geo,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: DraggableScrollableSheet(
        initialChildSize: 0.92,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, controller) => Form(
          key: _formKey,
          child: ListView(
            controller: controller,
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 28),
            children: [
              Center(
                child: Container(
                  height: 4,
                  width: 40,
                  decoration: BoxDecoration(
                    color: AppColors.divider,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _isEdit ? 'Edit Dealer' : 'Add Dealer',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: AppColors.onSurface,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded, size: 20),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              const _Label('Type'),
              SegmentedButton<DealerType>(
                segments: [
                  for (final t in DealerType.values)
                    ButtonSegment(value: t, label: Text(t.label)),
                ],
                selected: {_type},
                showSelectedIcon: false,
                onSelectionChanged: (s) => setState(() => _type = s.first),
                style: SegmentedButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  textStyle: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(height: 18),

              const _Label('Shop name'),
              TextFormField(
                controller: _shop,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  hintText: 'e.g. Sharma Agro Store',
                ),
                validator: (v) => (v?.trim().isEmpty ?? true)
                    ? 'Shop name is required.'
                    : null,
              ),
              const SizedBox(height: 14),

              const _Label('Owner name'),
              TextFormField(
                controller: _owner,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  hintText: 'e.g. Ramesh Sharma',
                ),
                validator: (v) => (v?.trim().isEmpty ?? true)
                    ? 'Owner name is required.'
                    : null,
              ),
              const SizedBox(height: 14),

              const _Label('Phone'),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(10),
                ],
                decoration: const InputDecoration(
                  hintText: '10-digit mobile number',
                  prefixText: '+91 ',
                ),
                validator: (v) {
                  final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                  if (digits.isEmpty) return 'Phone number is required.';
                  if (digits.length != 10) {
                    return 'Enter a valid 10-digit mobile number.';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 14),

              const _Label('Address'),
              TextFormField(
                controller: _address,
                maxLines: 2,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText: 'Shop address, village/town, district',
                ),
                validator: (v) =>
                    (v?.trim().isEmpty ?? true) ? 'Address is required.' : null,
              ),
              const SizedBox(height: 18),

              const _Label('Shop location'),
              _LocationButton(
                geo: _geo,
                busy: _locating,
                error: _geoError,
                onTap: _capture,
              ),

              const SizedBox(height: 26),
              FilledButton(
                onPressed: _submit,
                child: Text(_isEdit ? 'Save Changes' : 'Add Dealer'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 7),
    child: Text(
      text.toUpperCase(),
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.9,
        color: AppColors.onSurfaceVariant,
      ),
    ),
  );
}

class _LocationButton extends StatelessWidget {
  const _LocationButton({
    required this.geo,
    required this.busy,
    required this.error,
    required this.onTap,
  });

  final LatLngPoint? geo;
  final bool busy;
  final String? error;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ok = geo != null;
    final color = error != null
        ? AppColors.error
        : ok
        ? AppColors.success
        : AppColors.onSurfaceVariant;
    final background = error != null
        ? AppColors.errorContainer
        : ok
        ? AppColors.successContainer
        : AppColors.surfaceContainerLow;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Material(
          color: background,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            onTap: busy ? null : onTap,
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
              child: Row(
                children: [
                  if (busy)
                    const SizedBox(
                      height: 17,
                      width: 17,
                      child: CircularProgressIndicator(strokeWidth: 2.2),
                    )
                  else
                    Icon(
                      ok
                          ? Icons.check_circle_rounded
                          : Icons.my_location_rounded,
                      size: 18,
                      color: color,
                    ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      busy
                          ? 'Getting location…'
                          : ok
                          ? 'Captured · ${geo!.lat.toStringAsFixed(5)}, ${geo!.lng.toStringAsFixed(5)}'
                          : 'Use current location',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: color,
                      ),
                    ),
                  ),
                  if (ok && !busy)
                    const Text(
                      'Retake',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 7, left: 4),
            child: Text(
              error!,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.error,
                height: 1.35,
              ),
            ),
          ),
      ],
    );
  }
}
