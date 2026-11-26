import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/features/marketplace/data/listing_repository.dart';

// The app must treat an availability[] store as orderable online only when
// its entry is not `isOnline: false` — the checkout server rejects the rest
// with seller_not_eligible (Karan Arjun Power Plus, 26 Nov 2026: 99 of 104
// stores offline, the app picked the nearest offline one).
void main() {
  test('store key prefers storePhone, falls back to storeId', () {
    expect(availabilityStoreKey({'storePhone': '+918658031942', 'storeId': 'uid1'}), '+918658031942');
    expect(availabilityStoreKey({'storePhone': '', 'storeId': 'uid1'}), 'uid1');
    expect(availabilityStoreKey({}), '');
  });

  test('only an explicit isOnline:false marks a store offline', () {
    final m = availabilityOnlineByStore([
      {'storePhone': '+911111111111', 'isOnline': true},
      {'storePhone': '+912222222222', 'isOnline': false},
      {'storePhone': '+913333333333'}, // no flag: online, as on the web
    ]);
    expect(m['+911111111111'], isTrue);
    expect(m['+912222222222'], isFalse);
    expect(m['+913333333333'], isTrue);
  });

  test('a store listed twice is online if any entry is online', () {
    final m = availabilityOnlineByStore([
      {'storePhone': '+917620391466', 'isOnline': false},
      {'storePhone': '+917620391466', 'storeId': 'VrHo', 'isOnline': false},
      {'storePhone': '+918658031942', 'isOnline': false},
      {'storePhone': '+918658031942', 'isOnline': true},
    ]);
    expect(m['+917620391466'], isFalse);
    expect(m['+918658031942'], isTrue);
  });
}
