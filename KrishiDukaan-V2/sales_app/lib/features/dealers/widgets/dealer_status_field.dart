import 'package:flutter/material.dart';

import '../data/dealer_status.dart';

/// Shared status picker for Add Dealer and Mark as Visited.
class DealerStatusField extends StatefulWidget {
  const DealerStatusField({
    super.key,
    required this.initialStatus,
    required this.customStatuses,
    required this.onChanged,
  });

  final String? initialStatus;
  final List<String> customStatuses;
  final ValueChanged<String?> onChanged;

  @override
  State<DealerStatusField> createState() => _DealerStatusFieldState();
}

class _DealerStatusFieldState extends State<DealerStatusField> {
  static const _customKey = '__custom__';
  late final TextEditingController _custom;
  String? _selected;

  @override
  void initState() {
    super.initState();
    _custom = TextEditingController();
    _selected = DealerStatus.clean(widget.initialStatus);
  }

  @override
  void dispose() {
    _custom.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final choices = <String>[...DealerStatus.presets];
    for (final option in widget.customStatuses) {
      if (option == _customKey ||
          option.toLowerCase() == _selected?.toLowerCase() ||
          choices.any((v) => v.toLowerCase() == option.toLowerCase())) {
        continue;
      }
      choices.add(option);
    }
    if (_selected != null &&
        _selected != _customKey &&
        !choices.contains(_selected)) {
      choices.add(_selected!);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButtonFormField<String>(
          initialValue: _selected,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Dealer status'),
          hint: const Text('Select status'),
          items: [
            for (final choice in choices)
              DropdownMenuItem(value: choice, child: Text(choice)),
            const DropdownMenuItem(
              value: _customKey,
              child: Text('Create custom status…'),
            ),
          ],
          onChanged: (value) {
            setState(() => _selected = value);
            widget.onChanged(
              value == _customKey ? DealerStatus.clean(_custom.text) : value,
            );
          },
          validator: (value) => value == null ? 'Select a status.' : null,
        ),
        if (_selected == _customKey) ...[
          const SizedBox(height: 12),
          TextFormField(
            controller: _custom,
            autofocus: true,
            maxLength: 50,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Custom status',
              hintText: 'e.g. Awaiting documents',
            ),
            onChanged: (value) => widget.onChanged(DealerStatus.clean(value)),
            validator: (value) => DealerStatus.clean(value) == null
                ? 'Enter a custom status.'
                : null,
          ),
        ],
      ],
    );
  }
}
