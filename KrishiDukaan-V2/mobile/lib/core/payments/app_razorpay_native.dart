// Native (Android/iOS) Razorpay checkout via the razorpay_flutter plugin.
// Selected by app_razorpay.dart on every non-web platform.

import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'app_razorpay.dart';

AppRazorpay createAppRazorpay({
  required void Function(AppPaymentSuccess) onSuccess,
  required void Function(AppPaymentError) onError,
}) =>
    _NativeRazorpay(onSuccess, onError);

class _NativeRazorpay implements AppRazorpay {
  final Razorpay _razorpay = Razorpay();

  _NativeRazorpay(
    void Function(AppPaymentSuccess) onSuccess,
    void Function(AppPaymentError) onError,
  ) {
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) {
      onSuccess(AppPaymentSuccess(
        orderId: r.orderId ?? '',
        paymentId: r.paymentId ?? '',
        signature: r.signature ?? '',
      ));
    });
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse r) {
      // r.error is Razorpay's error object (code, description, reason,
      // source, step, metadata) when the SDK could parse one; keep all of it.
      final e = r.error ?? const {};
      String? str(String k) => e[k]?.toString();

      final meta = e['metadata'];
      onError(AppPaymentError(
        AppPaymentError.customerMessage(r.code, r.message),
        sdkCode: r.code,
        rawDescription: r.message,
        errorCode: str('code'),
        reason: str('reason'),
        source: str('source'),
        step: str('step'),
        metadata: meta is Map
            ? meta.map((k, v) => MapEntry(k.toString(), v))
            : null,
      ));
    });
    _razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, (_) {});
  }

  @override
  void open(Map<String, dynamic> options) => _razorpay.open(options);

  @override
  void clear() => _razorpay.clear();
}
