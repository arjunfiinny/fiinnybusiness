import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../constants/app_config.dart';

/// App side of Admin > Search insights — posts to the same
/// /api/analytics/search endpoint web's app/lib/search-analytics.ts uses,
/// which folds each call into one daily aggregate doc (searchStats/{day}).
///
/// A search is sent only after it SETTLES (no newer term for [_settle]), so
/// typing "u", "ur", "urea" records just "urea"; each term and category is
/// sent at most once per app session. Fire-and-forget: never awaited by UI
/// and failures are ignored.
class SearchAnalyticsService {
  SearchAnalyticsService._();
  static final instance = SearchAnalyticsService._();

  static const _settle = Duration(milliseconds: 1500);

  final _logged = <String>{};
  Timer? _pending;

  /// Call when results for [query] are ready; [results] is how many matched.
  void scheduleSearch(String query, int results) {
    _pending?.cancel();
    final q = query.trim().toLowerCase();
    if (q.length < 2) return;
    _pending = Timer(_settle, () {
      if (_logged.add('q:$q')) {
        _send({'kind': 'search', 'q': q, 'results': results});
      }
    });
  }

  /// Call when the shopper picks a category chip.
  void logCategory(String? category) {
    final c = category?.trim() ?? '';
    if (c.isEmpty || c.toLowerCase() == 'all') return;
    if (_logged.add('c:${c.toLowerCase()}')) {
      _send({'kind': 'category', 'category': c});
    }
  }

  void _send(Map<String, Object?> body) {
    http
        .post(
          Uri.parse('${AppConfig.apiBaseUrl}/api/analytics/search'),
          headers: const {'Content-Type': 'application/json'},
          body: jsonEncode({...body, 'source': 'app'}),
        )
        .timeout(const Duration(seconds: 10))
        .then((_) {}, onError: (_) {});
  }
}
