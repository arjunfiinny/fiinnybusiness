import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/features/marketplace/data/market_rank.dart';

void main() {
  String id(String s) => s;

  test('ranked items first in ranking order, the rest keep their order', () {
    final items = ['newest', 'b', 'kit', 'jefha', 'old'];
    final out = applyMarketRank(items, ['kit', 'jefha', 'b'], id);
    expect(out, ['kit', 'jefha', 'b', 'newest', 'old']);
  });

  test('empty ranking keeps the original order', () {
    expect(applyMarketRank(['a', 'b'], const [], id), ['a', 'b']);
  });

  test('duplicate ids in the ranking use the first position; returns a new list', () {
    final items = ['a', 'b', 'c'];
    final out = applyMarketRank(items, ['c', 'a', 'c'], id);
    expect(out, ['c', 'a', 'b']);
    expect(identical(out, items), isFalse);
  });
}
