import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/payments/app_razorpay.dart';

void main() {
  group('AppPaymentError', () {
    test('never shows the customer "undefined"', () {
      expect(AppPaymentError.customerMessage(null, 'undefined'),
          'Payment was not completed. Please try again.');
      expect(AppPaymentError.customerMessage(100, ''),
          'Payment was not completed. Please try again.');
      expect(AppPaymentError.customerMessage(100, 'Payment Error'),
          'Payment was not completed. Please try again.');
    });

    test('cancel code reads as a cancellation', () {
      expect(
          AppPaymentError.customerMessage(
              AppPaymentErrorCode.paymentCancelled, 'undefined'),
          'Payment cancelled. You have not been charged.');
    });

    test('a real description is kept', () {
      expect(AppPaymentError.customerMessage(100, 'Card declined by bank'),
          'Card declined by bank');
    });

    test('log body keeps the raw text and the SDK code', () {
      const e = AppPaymentError(
        'x',
        sdkCode: 2,
        rawDescription: 'undefined',
        reason: 'payment_cancelled',
      );
      final json = e.toLogJson();
      expect(json.containsKey('description'), isFalse);
      expect(json['rawDescription'], 'undefined');
      expect(json['sdkCode'], 2);
      expect(json['sdkCodeName'], 'payment_cancelled');
      expect(json['reason'], 'payment_cancelled');
      expect(e.isCancelled, isTrue);
    });
  });
}
