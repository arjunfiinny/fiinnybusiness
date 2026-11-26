import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/bank_account_model.dart';
import '../../models/credit_card_model.dart';
import '../../models/loan_model.dart';
import '../bank_account_service.dart';
import '../credit_card_service.dart';
import '../loan_service.dart';

/// The "Brain" of Phase 5.
/// Responsible for taking raw signals (Bank Name, Last 4, Type)
/// and resolving them to a persistent Entity (Model).
///
/// If the entity exists -> Returns it.
/// If not -> Creates it.
/// Also handles "State Updates" (Balances, Limits, Due Dates).
class EntityResolutionService {
  final _bankService = BankAccountService();
  final _cardService = CreditCardService();
  final _loanService = LoanService();

  static final EntityResolutionService _instance =
      EntityResolutionService._internal();

  factory EntityResolutionService() => _instance;

  EntityResolutionService._internal();

  // ---------------------------------------------------------------------------
  // 🏦 Bank Accounts
  // ---------------------------------------------------------------------------

  /// Resolve a Bank Account from raw signals.
  /// [bankName]: "HDFC", "SBI", etc.
  /// [last4]: "1234"
  /// Returns the persistent model (fetched or newly created).
  Future<BankAccountModel> resolveBankAccount({
    required String userId,
    required String bankName,
    required String last4,
    double? currentBalance,
  }) async {
    // 1. Try to find existing
    final existing = await _bankService.findAccount(userId, bankName, last4);
    if (existing != null) {
      // 2. Found? Check if we need to update balance immediately
      if (currentBalance != null) {
        // Only update if it's "newer" or we just trust the latest SMS
        // For simplicity, we trust the latest ingested signal
        await _bankService.updateBalance(userId, existing.id, currentBalance);
        return existing.copyWith(currentBalance: currentBalance);
      }
      return existing;
    }

    // 3. Not Found -> Create New
    // ID format: BANK-LAST4 (Simple, readable, consistent)
    final id = '${bankName.toUpperCase().replaceAll(' ', '')}-${last4.trim()}';

    final newAccount = BankAccountModel(
      id: id,
      bankName: bankName,
      last4Digits: last4,
      currentBalance: currentBalance,
      balanceUpdatedAt: currentBalance != null ? DateTime.now() : null,
      accountType: 'Savings', // Default assumption, user can change
    );

    await _bankService.saveAccount(userId, newAccount);
    debugPrint('[EntityResolution] Created new Bank Account: $id');
    return newAccount;
  }

  // ---------------------------------------------------------------------------
  // 💳 Credit Cards
  // ---------------------------------------------------------------------------

  /// Bank name reduced to its core so "HDFC Bank", "HDFCBANK" and "hdfc"
  /// match (exact-name matching created duplicate cards that took the
  /// updates while the user's real card went stale).
  @visibleForTesting
  static String bankKey(String raw) {
    var k = raw.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
    for (final w in const [
      'CREDITCARDS',
      'CREDITCARD',
      'CARDS',
      'CARD',
      'BANKLTD',
      'LIMITED',
      'LTD',
      'BANK',
    ]) {
      if (k.endsWith(w) && k.length > w.length) {
        k = k.substring(0, k.length - w.length);
      }
    }
    return k;
  }

  static bool _isRealLast4(String v) => RegExp(r'^\d{4}$').hasMatch(v.trim());

  /// Resolve a Credit Card from raw signals and apply any state we caught
  /// (limits, statement, payment). Returns null when the signal can't be
  /// tied to one card (we no longer invent "UNKNOWN ••XXXX" cards).
  Future<CreditCardModel?> resolveCreditCard({
    required String userId,
    required String bankName,
    required String last4,
    String? cardType, // Visa, Master
    // State updates we might have caught simultaneously:
    double? availableLimit,
    double? totalLimit,
    double? totalDue,
    double? minDue,
    DateTime? dueDate,
    DateTime? statementDate,
    double? currentBalance, // Outstanding amount
    double? paymentAmount, // Bill payment received on the card
    DateTime? paymentAt,
  }) async {
    final cards = await _cardService.getUserCards(userId);
    final bankKnown =
        bankName.trim().isNotEmpty && bankName.toUpperCase() != 'UNKNOWN';
    final last4Known = _isRealLast4(last4);
    final bankK = bankKnown ? bankKey(bankName) : '';

    CreditCardModel? match;
    if (last4Known) {
      final byLast4 =
          cards.where((c) => c.last4Digits.trim() == last4.trim()).toList();
      if (bankKnown) {
        final both =
            byLast4.where((c) => bankKey(c.bankName) == bankK).toList();
        if (both.isNotEmpty) match = both.first;
      }
      // Bank name missing/spelled differently but only one card has these digits.
      if (match == null && byLast4.length == 1) match = byLast4.first;
    } else if (bankKnown) {
      final byBank = cards.where((c) => bankKey(c.bankName) == bankK).toList();
      if (byBank.length == 1) match = byBank.first;
    }

    if (match != null) {
      await _updateCreditCardState(
        userId,
        match,
        availableLimit: availableLimit,
        totalLimit: totalLimit,
        totalDue: totalDue,
        minDue: minDue,
        dueDate: dueDate,
        statementDate: statementDate,
        currentBalance: currentBalance,
        paymentAmount: paymentAmount,
        paymentAt: paymentAt,
      );
      return match;
    }

    // Can't create a real card without both a bank and real last 4 digits.
    if (!bankKnown || !last4Known) return null;
    // A payment alone isn't enough to create a card.
    if (paymentAmount != null &&
        totalDue == null &&
        availableLimit == null &&
        totalLimit == null) {
      return null;
    }

    final id =
        '${bankName.toUpperCase().replaceAll(' ', '')}-${last4.trim()}-CC';

    final newCard = CreditCardModel(
      id: id,
      bankName: bankName,
      last4Digits: last4,
      cardType: cardType ?? 'Unknown',
      cardholderName: 'My Card', // User to edit
      dueDate: dueDate ??
          DateTime.now().add(const Duration(days: 20)), // Placeholder
      totalDue: totalDue ?? 0.0,
      minDue: minDue ?? 0.0,
      statementDate: statementDate,
      creditLimit: totalLimit,
      availableCredit: availableLimit,
      currentBalance: currentBalance, // Initial outstanding
      balanceUpdatedAt: DateTime.now(),
    );

    await _cardService.saveCard(userId, newCard);
    debugPrint('[EntityResolution] Created new Credit Card: $id');
    return newCard;
  }

  /// Helper to push state updates to an existing card.
  ///
  /// - A statement with a later due date starts a new cycle: clears the old
  ///   "Paid" flag (it used to stay "Paid" forever after one manual mark).
  /// - A payment that covers the amount due marks the bill paid.
  Future<void> _updateCreditCardState(
    String userId,
    CreditCardModel card, {
    double? availableLimit,
    double? totalLimit,
    double? totalDue,
    double? minDue,
    DateTime? dueDate,
    DateTime? statementDate,
    double? currentBalance,
    double? paymentAmount,
    DateTime? paymentAt,
  }) async {
    if (availableLimit == null &&
        totalLimit == null &&
        totalDue == null &&
        minDue == null &&
        dueDate == null &&
        statementDate == null &&
        currentBalance == null &&
        paymentAmount == null) {
      return;
    }
    final now = DateTime.now();

    final updates = <String, dynamic>{
      if (availableLimit != null) 'availableCredit': availableLimit,
      if (totalLimit != null) 'creditLimit': totalLimit,
      if (totalLimit != null || availableLimit != null)
        'limitUpdatedAt': now.toIso8601String(),
      if (totalDue != null) 'totalDue': totalDue,
      if (minDue != null) 'minDue': minDue,
      if (dueDate != null) 'dueDate': dueDate.toIso8601String(),
      if (statementDate != null)
        'statementDate': statementDate.toIso8601String(),
      if (currentBalance != null) 'currentBalance': currentBalance,
    };

    // New statement cycle?
    final newCycle = dueDate != null &&
        dueDate.isAfter(card.dueDate.add(const Duration(days: 2)));
    if (newCycle) {
      updates['isPaid'] = false;
      updates['paidDate'] = FieldValue.delete();
      if (totalDue != null) updates['lastStatementBalance'] = totalDue;
    }

    // Bill payment received on the card.
    if (paymentAmount != null && paymentAmount > 0) {
      final paidOn = paymentAt ?? now;
      updates['lastPaymentAmount'] = paymentAmount;
      updates['lastPaymentAt'] = paidOn.toIso8601String();
      final due = totalDue ?? card.totalDue;
      if (!newCycle && due > 0 && paymentAmount >= due - 1) {
        updates['isPaid'] = true;
        updates['paidDate'] = paidOn.toIso8601String();
      }
      final outstanding = currentBalance ?? card.currentBalance;
      if (currentBalance == null && outstanding != null) {
        updates['currentBalance'] =
            (outstanding - paymentAmount).clamp(0.0, double.infinity);
      }
    }

    // Also derive "Current Balance" (Outstanding) if we have Total & Available
    // Outstanding = Total Limit - Available Limit
    // Only derive if NOT explicitly provided
    if (currentBalance == null &&
        availableLimit != null &&
        totalLimit != null) {
      final outstanding =
          (totalLimit - availableLimit).clamp(0.0, double.infinity);
      updates['currentBalance'] = outstanding;
      updates['balanceUpdatedAt'] = now.toIso8601String();
    } else if (updates.containsKey('currentBalance')) {
      updates['balanceUpdatedAt'] = now.toIso8601String();
    }

    await FirebaseFirestore.instance
        .collection('users')
        .doc(userId)
        .collection('credit_cards')
        .doc(card.id)
        .set(updates, SetOptions(merge: true));
  }

  // ---------------------------------------------------------------------------
  // 💰 Loans
  // ---------------------------------------------------------------------------

  Future<LoanModel> resolveLoan({
    required String userId,
    required String lenderName,
    String? accountLast4,
    double? emiAmount,
    double? outstandingAmount,
  }) async {
    // Loans are tricker. We usually check active loans first.
    final loans = await _loanService.getLoans(userId);
    final match = loans.cast<LoanModel?>().firstWhere((l) {
      if (l == null) return false;
      if (l.isClosed) return false;
      // Match by title/lender
      final nameMatch =
          l.lenderName?.toLowerCase() == lenderName.toLowerCase() ||
              l.title.toLowerCase().contains(lenderName.toLowerCase());

      // If last4 provided, it MUST match (if the loan has it recorded)
      // Note: LoanModel might need 'accountLast4' field if not present.
      // Assuming title matching for now as primary heuristic from user request.
      return nameMatch;
    }, orElse: () => null);

    if (match != null) {
      // Update logic (e.g. record payment or update outstanding)
      // usually handled by 'recordPayment' but here we just return the entity.
      return match;
    }

    // If new -> We usually don't auto-create Loans fully confirmed
    // because we need EMI date, tenure etc.
    // BUT user asked for "Maintain loan state".
    // For now, we created "Loan Suggestions" effectively.
    // We will return a temporary model or create a 'Detected Loan'.

    // Strategy: Create a "Detected" loan
    final id = 'LOAN-${DateTime.now().millisecondsSinceEpoch}';
    final newLoan = LoanModel(
      id: id,
      userId: userId,
      title: lenderName,
      lenderName: lenderName,
      amount: outstandingAmount ??
          (emiAmount != null ? emiAmount * 12 : 0), // Estimate
      emi: emiAmount,
      startDate: DateTime.now(),
      isClosed: false,
      tags: ['detected', 'auto-created'],
      note: 'Auto-created from entity resolution',
      createdAt: DateTime.now(), paymentDayOfMonth: null,
      autopay: false, lenderType: 'Other',
    );

    await _loanService
        .addLoan(newLoan); // This actually generates ID inside usually
    return newLoan;
  }
}
