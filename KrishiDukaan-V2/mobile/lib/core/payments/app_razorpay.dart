// Cross-platform Razorpay checkout.
//
// Native (Android/iOS) delegates to the razorpay_flutter plugin.
// Web uses Razorpay's checkout.js (loaded in web/index.html) via JS interop,
// because razorpay_flutter has no web implementation.
//
// The conditional import below selects the platform implementation at compile
// time, so razorpay_flutter is never referenced in a web build (and dart:js is
// never referenced in a native build).

import 'app_razorpay_native.dart'
    if (dart.library.html) 'app_razorpay_web.dart';

/// Fields the backend needs to verify a successful payment.
class AppPaymentSuccess {
  final String orderId;
  final String paymentId;
  final String signature;
  const AppPaymentSuccess({
    required this.orderId,
    required this.paymentId,
    required this.signature,
  });
}

/// The checkout SDK's own error codes (razorpay_flutter's constants; the web
/// wrapper maps onto the same values). Kept here so neither the screens nor
/// the logging need to import the plugin.
class AppPaymentErrorCode {
  static const networkError = 0;
  static const invalidOptions = 1;
  static const paymentCancelled = 2;
  static const tlsError = 3;
  static const incompatiblePlugin = 4;
  static const unknownError = 100;

  static String name(int? code) => switch (code) {
        networkError => 'network_error',
        invalidOptions => 'invalid_options',
        paymentCancelled => 'payment_cancelled',
        tlsError => 'tls_error',
        incompatiblePlugin => 'incompatible_plugin',
        unknownError => 'unknown_error',
        null => 'none',
        _ => 'code_$code',
      };
}

/// A failed or cancelled payment.
///
/// [message] is what the customer sees. Everything else is diagnostics for
/// Admin -> Payments: until these were kept, only the SDK's description text
/// reached the server, and that text is often the literal string "undefined"
/// or a bare "Payment Error" — so a customer pressing back, a dropped network
/// and a sheet that never loaded all looked identical.
class AppPaymentError {
  final String message;

  /// SDK error code, see [AppPaymentErrorCode].
  final int? sdkCode;

  /// The SDK's description exactly as received (may be "undefined").
  final String? rawDescription;

  /// Razorpay's error object fields, when the SDK sent one.
  final String? errorCode;
  final String? reason;
  final String? source;
  final String? step;
  final Map<String, dynamic>? metadata;

  const AppPaymentError(
    this.message, {
    this.sdkCode,
    this.rawDescription,
    this.errorCode,
    this.reason,
    this.source,
    this.step,
    this.metadata,
  });

  bool get isCancelled =>
      sdkCode == AppPaymentErrorCode.paymentCancelled ||
      reason == 'payment_cancelled';

  /// Body for /api/payment/attempt-failed's `error` field.
  Map<String, dynamic> toLogJson() => {
        'description': ?_meaningful(rawDescription),
        // Verbatim, even when it is "undefined": that itself is a signal.
        'rawDescription': ?rawDescription,
        'code': ?errorCode,
        'reason': ?reason,
        'source': ?source,
        'step': ?step,
        'sdkCode': ?sdkCode,
        'sdkCodeName': AppPaymentErrorCode.name(sdkCode),
        if (metadata != null && metadata!.isNotEmpty) 'metadata': metadata,
      };

  /// Builds the customer-facing text from whatever the SDK sent, never
  /// showing "undefined" or an empty string.
  static String customerMessage(int? sdkCode, String? description) {
    final d = _meaningful(description);
    if (sdkCode == AppPaymentErrorCode.paymentCancelled) {
      return 'Payment cancelled. You have not been charged.';
    }
    if (sdkCode == AppPaymentErrorCode.networkError) {
      return d ?? 'Network problem while paying. Please check your internet and try again.';
    }
    return d ?? 'Payment was not completed. Please try again.';
  }
}

/// Null for the placeholder strings the checkout sheet sends when it has no
/// real description.
String? _meaningful(String? s) {
  final t = s?.trim();
  if (t == null || t.isEmpty) return null;
  final lower = t.toLowerCase();
  if (lower == 'undefined' || lower == 'null' || lower == 'payment error') {
    return null;
  }
  return t;
}

/// Platform-agnostic Razorpay checkout handle.
abstract class AppRazorpay {
  /// Opens the Razorpay checkout. [options] uses the same keys as
  /// razorpay_flutter: `key`, `order_id`, `amount`, `currency`, `name`,
  /// `description`, `prefill`, `theme`.
  void open(Map<String, dynamic> options);

  /// Releases listeners/resources. Call from `State.dispose()`.
  void clear();

  factory AppRazorpay({
    required void Function(AppPaymentSuccess) onSuccess,
    required void Function(AppPaymentError) onError,
  }) =>
      createAppRazorpay(onSuccess: onSuccess, onError: onError);
}
