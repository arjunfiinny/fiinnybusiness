// Guards the fixes for stale subscriptions and credit cards (Nov 2026):
// parsed payments must land on the same fields the screens read.
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lifemap/models/subscription_item.dart';
import 'package:lifemap/services/ingest/entity_resolution_service.dart';
import 'package:lifemap/services/recurring/recurring_engine.dart';

void main() {
  group('SubscriptionItem reads engine-written docs', () {
    test('auto-detected doc shows name, amount and due date', () {
      final next = DateTime(2026, 12, 5);
      final item = SubscriptionItem.fromJson('s1', {
        'brand': 'NETFLIX',
        'expectedAmount': 649,
        'recurrence': 'monthly',
        'nextDue': Timestamp.fromDate(next),
        'lastPaidAt': Timestamp.fromDate(DateTime(2026, 11, 5)),
        'active': true,
      });
      expect(item.title, 'Netflix');
      expect(item.amount, 649);
      expect(item.nextDueAt, next);
      expect(item.frequency, 'monthly');
      expect(item.anchorDate, DateTime(2026, 11, 5));
    });

    test('manual doc keeps its own fields; nextDueAt wins over nextDue', () {
      final item = SubscriptionItem.fromJson('s2', {
        'title': 'Spotify Family',
        'amount': 179,
        'frequency': 'monthly',
        'anchorDate': Timestamp.fromDate(DateTime(2026, 1, 10)),
        'nextDueAt': Timestamp.fromDate(DateTime(2026, 12, 10)),
        'nextDue': Timestamp.fromDate(DateTime(2026, 6, 10)),
      });
      expect(item.title, 'Spotify Family');
      expect(item.amount, 179);
      expect(item.nextDueAt, DateTime(2026, 12, 10));
    });
  });

  group('RecurringEngine', () {
    test('monthly roll follows the calendar, clamping short months', () {
      expect(RecurringEngine.rollFrom(DateTime(2026, 1, 31), 'monthly', 30),
          DateTime(2026, 2, 28));
      expect(RecurringEngine.rollFrom(DateTime(2026, 11, 14), 'monthly', 30),
          DateTime(2026, 12, 14));
      expect(RecurringEngine.rollFrom(DateTime(2026, 12, 20), 'monthly', 30),
          DateTime(2027, 1, 20));
      expect(RecurringEngine.rollFrom(DateTime(2026, 3, 1), 'yearly', 365),
          DateTime(2027, 3, 1));
      expect(RecurringEngine.rollFrom(DateTime(2026, 3, 1), 'weekly', 7),
          DateTime(2026, 3, 8));
    });

    test('manual title matches parsed merchant names', () {
      final manual = RecurringEngine.brandKey('Netflix');
      expect(RecurringEngine.sameBrand(manual, RecurringEngine.brandKey('NETFLIX.COM')), isTrue);
      expect(RecurringEngine.sameBrand(manual, RecurringEngine.brandKey('Netflix India')), isTrue);
      expect(RecurringEngine.sameBrand(RecurringEngine.brandKey('Spotify'), manual), isFalse);
      // Short names must match exactly (no "JIO" inside "JIOSAAVN"-style accidents below 4 chars).
      expect(RecurringEngine.sameBrand('JIO', 'JIOSAAVN'), isFalse);
    });
  });

  group('EntityResolutionService.bankKey', () {
    test('bank name variants resolve to one card', () {
      final k = EntityResolutionService.bankKey;
      expect(k('HDFC Bank'), 'HDFC');
      expect(k('HDFCBANK'), 'HDFC');
      expect(k('hdfc'), 'HDFC');
      expect(k('SBI Card'), 'SBI');
      expect(k('ICICI Bank Ltd'), 'ICICI');
      expect(k('Axis Bank Credit Card'), 'AXIS');
      expect(k('HDFC'), isNot(k('ICICI')));
    });
  });
}
