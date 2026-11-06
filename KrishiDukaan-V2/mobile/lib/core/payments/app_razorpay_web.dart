// Web Razorpay checkout via checkout.js (loaded in web/index.html).
// Selected by app_razorpay.dart only when dart.library.html is available, so
// this file — and the JS interop libraries — are never compiled into a native
// build.

import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'app_razorpay.dart';

AppRazorpay createAppRazorpay({
  required void Function(AppPaymentSuccess) onSuccess,
  required void Function(AppPaymentError) onError,
}) =>
    _WebRazorpay(onSuccess, onError);

/// Binding to the global `Razorpay` constructor provided by checkout.js.
@JS('Razorpay')
extension type _RazorpayJS._(JSObject _) implements JSObject {
  external factory _RazorpayJS(JSObject options);
  external void open();
  external void on(String event, JSFunction handler);
}

String _readString(JSObject obj, String key) {
  final value = obj.getProperty(key.toJS);
  if (value == null) return '';
  return (value as JSString).toDart;
}

class _WebRazorpay implements AppRazorpay {
  final void Function(AppPaymentSuccess) _onSuccess;
  final void Function(AppPaymentError) _onError;

  _WebRazorpay(this._onSuccess, this._onError);

  @override
  void open(Map<String, dynamic> options) {
    if (globalContext.getProperty('Razorpay'.toJS) == null) {
      _onError(const AppPaymentError(
        'Razorpay checkout.js is not loaded. Add '
        '<script src="https://checkout.razorpay.com/v1/checkout.js"></script> '
        'to web/index.html.',
        sdkCode: AppPaymentErrorCode.invalidOptions,
        rawDescription: 'checkout.js not loaded',
      ));
      return;
    }

    final jsOptions = options.jsify() as JSObject;
    final fallbackOrderId = (options['order_id'] ?? '').toString();

    // checkout.js calls `handler` on a successful payment.
    jsOptions.setProperty(
      'handler'.toJS,
      ((JSObject response) {
        final orderId = _readString(response, 'razorpay_order_id');
        _onSuccess(AppPaymentSuccess(
          orderId: orderId.isNotEmpty ? orderId : fallbackOrderId,
          paymentId: _readString(response, 'razorpay_payment_id'),
          signature: _readString(response, 'razorpay_signature'),
        ));
      }).toJS,
    );

    // Closing the modal without paying is treated as a cancellation.
    final modal = JSObject();
    modal.setProperty(
      'ondismiss'.toJS,
      (() {
        _onError(AppPaymentError(
          AppPaymentError.customerMessage(
              AppPaymentErrorCode.paymentCancelled, null),
          sdkCode: AppPaymentErrorCode.paymentCancelled,
          rawDescription: 'modal dismissed',
        ));
      }).toJS,
    );
    jsOptions.setProperty('modal'.toJS, modal);

    final rzp = _RazorpayJS(jsOptions);

    rzp.on(
      'payment.failed',
      ((JSObject response) {
        final raw = response.getProperty('error'.toJS);
        final error = raw == null ? null : raw as JSObject;
        String? field(String k) {
          if (error == null) return null;
          final v = _readString(error, k);
          return v.isEmpty ? null : v;
        }

        final desc = field('description');
        _onError(AppPaymentError(
          AppPaymentError.customerMessage(null, desc),
          rawDescription: desc,
          errorCode: field('code'),
          reason: field('reason'),
          source: field('source'),
          step: field('step'),
        ));
      }).toJS,
    );

    rzp.open();
  }

  @override
  void clear() {
    // No persistent listeners to release on web.
  }
}
