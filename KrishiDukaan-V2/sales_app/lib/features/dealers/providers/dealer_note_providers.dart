import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/auth_provider.dart';
import '../data/dealer_note.dart';
import '../data/dealer_note_repository.dart';

final dealerNoteRepositoryProvider = Provider<DealerNoteRepository>(
  (ref) => DealerNoteRepository(),
);

/// A dealer's notes, oldest first — keyed by dealerId so switching between
/// dealers never shows another dealer's notes.
final dealerNotesProvider = StreamProvider.family<List<DealerNote>, String>((
  ref,
  dealerId,
) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value(const []);
  return ref.watch(dealerNoteRepositoryProvider).forDealer(uid, dealerId);
});
