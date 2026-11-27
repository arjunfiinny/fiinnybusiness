import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/constants/app_config.dart';

/// The Market's default order, shared with the website: online first, then
/// most bought, then A→Z. The website computes it (app/lib/marketplace-rank.ts)
/// and serves it at /api/marketplace/rank as a list of product ids, so the app
/// and the website always agree.

/// Product ids, top of the Market first, or null when the call fails (the
/// caller then keeps its own order, so nothing breaks offline).
Future<List<String>?> fetchMarketRank({Duration timeout = const Duration(seconds: 8)}) async {
  try {
    final res = await http
        .get(Uri.parse('${AppConfig.apiBaseUrl}/api/marketplace/rank'))
        .timeout(timeout);
    if (res.statusCode != 200) return null;
    final ids = (jsonDecode(res.body) as Map<String, dynamic>)['ids'];
    if (ids is! List) return null;
    return ids.map((e) => e.toString()).where((e) => e.isNotEmpty).toList();
  } catch (_) {
    return null;
  }
}

/// [items] reordered by [rankIds]: ranked items first in that order, then the
/// rest in the order they already had (e.g. a card built after the ranking
/// was computed). Stable, and returns a new list.
List<T> applyMarketRank<T>(List<T> items, List<String> rankIds, String Function(T) idOf) {
  final pos = <String, int>{};
  for (var i = 0; i < rankIds.length; i++) {
    pos.putIfAbsent(rankIds[i], () => i);
  }
  final indexed = [for (var i = 0; i < items.length; i++) (i, items[i])];
  indexed.sort((a, b) {
    final pa = pos[idOf(a.$2)];
    final pb = pos[idOf(b.$2)];
    if (pa != null && pb != null) return pa != pb ? pa.compareTo(pb) : a.$1.compareTo(b.$1);
    if (pa != null) return -1;
    if (pb != null) return 1;
    return a.$1.compareTo(b.$1);
  });
  return [for (final e in indexed) e.$2];
}
