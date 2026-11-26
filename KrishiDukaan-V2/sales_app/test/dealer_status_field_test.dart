import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_sales/features/dealers/data/dealer_status.dart';
import 'package:krishidukaan_sales/features/dealers/widgets/dealer_status_field.dart';

void main() {
  test('preset values read back with canonical spelling', () {
    expect(DealerStatus.clean('  not   interested '), 'Not Interested');
    expect(DealerStatus.isCustom('Awaiting documents'), isTrue);
  });

  testWidgets(
    'visit picker defaults to the dealer status and accepts a custom one',
    (tester) async {
      String? selected;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Form(
              child: DealerStatusField(
                initialStatus: 'Interested',
                customStatuses: const ['Awaiting documents'],
                onChanged: (value) => selected = value,
              ),
            ),
          ),
        ),
      );

      expect(find.text('Interested'), findsOneWidget);
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Create custom status…').last);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextFormField),
        '  Awaiting   payment  ',
      );
      expect(selected, 'Awaiting payment');
    },
  );
}
