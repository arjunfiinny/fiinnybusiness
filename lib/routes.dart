// lib/routes.dart
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart'; // NEW: to derive userPhone when missing

// ---------- Static screens (no arguments) ----------
import 'screens/onboarding_screen.dart';
import 'screens/launcher_screen.dart';
import 'screens/profile_screen.dart';

// ---------- Screens that need arguments ----------
import 'screens/dashboard_screen.dart';
import 'screens/expenses_screen.dart';
import 'screens/goals_screen.dart';
import 'screens/add_transaction_screen.dart';
import 'screens/add_loan_screen.dart';
import 'screens/add_asset_screen.dart'; // legacy AddAsset (still supported)
import 'screens/loans_screen.dart';
import 'screens/assets_screen.dart';
import 'screens/crisis_mode_screen.dart';
import 'screens/insight_feed_screen.dart';
import 'screens/transaction_count_screen.dart';
import 'screens/transaction_amount_screen.dart';
import 'screens/analytics_screen.dart'; // ✅ we’ll instantiate this in onGenerate
import 'screens/gmail_link_screen.dart';
import 'screens/transactions_screen.dart';
import 'screens/subscriptions/subscriptions_screen.dart'; // ✅ NEW Subscription Screen
import 'screens/cards_management_screen.dart'; // ✅ NEW Cards Management Screen
import 'screens/premium/upgrade_screen.dart'; // [NEW]

// ---------- Services for typed args ----------
import 'services/user_data.dart';

// ---------- Portfolio module (no-arg) ----------
import 'fiinny_assets/modules/portfolio/screens/portfolio_screen.dart';
import 'fiinny_assets/modules/portfolio/screens/asset_type_picker_screen.dart';
import 'fiinny_assets/modules/portfolio/screens/add_asset_entry_screen.dart';

// ---------- Devtools ----------
import 'ui_devtools/parse_debug_screen.dart';

// ---------- Settings screens ----------
import 'screens/notification_prefs_screen.dart'; // ✅ correct import

// ---------- Friend recurring (NEW route target) ----------
import 'details/recurring/friend_recurring_screen.dart';
import 'details/friend_detail_route_screen.dart';
import 'details/group_detail_route_screen.dart';
import 'details/friend_detail_screen.dart';
import 'details/group_detail_screen.dart';

import 'screens/tx_day_details_screen.dart';
import 'details/recurring/add_recurring_basic_screen.dart';
import 'details/models/recurring_scope.dart';
import 'screens/subscriptions/add_subscription_screen.dart';

import 'screens/b2b/b2b_dashboard.dart'; // [NEW] Native B2B Mode
import 'screens/b2b/pos_billing.dart';
import 'screens/friends_screen.dart';
import 'sharing/screens/sharing_screen.dart';
import 'screens/b2b/inventory_screen.dart';
import 'screens/b2b/b2b_khata_dashboard.dart';
import 'screens/b2b/b2b_khata_detail.dart';
import 'screens/b2b/b2b_profile.dart';
import 'screens/b2b/b2b_role_selection.dart';
import 'screens/b2b/b2b_onboarding.dart';
import 'screens/b2b/b2b_add_customer.dart'; // [NEW]
import 'screens/b2b/b2b_account.dart'; // [NEW]
import 'screens/b2b/b2b_order_history.dart'; // [NEW]
import 'screens/b2b/b2b_ai_chat_screen.dart'; // [NEW]
import 'screens/b2b/b2b_settings.dart'; // [NEW]
import 'screens/b2b/b2b_multi_devices.dart'; // [NEW]
import 'screens/b2b/b2b_account_statement.dart'; // [NEW]
import 'screens/b2b/b2b_search_screen.dart'; // [NEW]
import 'screens/b2b/b2b_analytics.dart'; // [NEW]
import 'screens/budgeting_screen.dart'; // [NEW] Budgeting
import 'screens/project_budgets_screen.dart'; // [NEW] Project Budgets

/// Static routes that don't require arguments.
/// (Do NOT put `/analytics` here because it requires a userPhone.)
final Map<String, WidgetBuilder> appRoutes = {
  // Core
  '/launcher': (_) => const LauncherScreen(),
  '/onboarding': (_) => const OnboardingScreen(),
  '/profile': (_) => const ProfileScreen(),

  // Portfolio flow
  '/portfolio': (_) => const PortfolioScreen(),
  '/asset-type-picker': (_) => const AssetTypePickerScreen(),
  '/add-asset-entry': (_) => const AddAssetEntryScreen(),

  // Devtools
  '/parse-debug': (_) => const ParseDebugScreen(),

  // Subscription Feature

  // Settings
  '/settings/notifications': (_) => const NotificationPrefsScreen(),
  '/settings/gmail': (ctx) {
    final args = ModalRoute.of(ctx)!.settings.arguments as String;
    return GmailLinkScreen(userPhone: args);
  },

  // ------- Deeplink targets (push notification taps) -------
  // These used to be "(stub)" placeholder pages, so tapping a friend or
  // partner notification led nowhere.
  '/partner-dashboard': (_) =>
      SharingScreen(currentUserPhone: _signedInPhone()),
  '/friends': (_) => FriendsScreen(userPhone: _signedInPhone()),
  '/budget': (ctx) {
    final phone = ModalRoute.of(ctx)?.settings.arguments as String? ?? '';
    return BudgetingScreen(userId: phone);
  },
  '/project-budgets': (ctx) {
    final phone = ModalRoute.of(ctx)?.settings.arguments as String? ?? '';
    return ProjectBudgetsScreen(userId: phone);
  },
  '/transactions': (ctx) {
    final phone = ModalRoute.of(ctx)?.settings.arguments as String? ?? '';
    return TransactionsScreen(userPhone: phone);
  },

  '/friend-detail': (context) => FriendDetailScreen(
      userPhone: '', userName: '', friend: null as dynamic), // Placeholder
  '/group-detail': (context) =>
      GroupDetailScreen(userId: '', group: null as dynamic), // Placeholder
      
  // B2B Static routes
  '/b2b/settings': (_) => const B2BSettingsScreen(),
};

/// Routes that require arguments (or custom building) are handled here.
Route<dynamic>? appOnGenerateRoute(RouteSettings settings) {
  final args = settings.arguments;

  switch (settings.name) {
    case '/tx-day-details':
      if (args is String) {
        return MaterialPageRoute(
          builder: (_) => TxDayDetailsScreen(userPhone: args),
        );
      }
      if (args is Map<String, dynamic> && args['userPhone'] is String) {
        return MaterialPageRoute(
          builder: (_) =>
              TxDayDetailsScreen(userPhone: args['userPhone'] as String),
        );
      }
      break;

    case '/dashboard':
      if (args is String) {
        return MaterialPageRoute(
            builder: (_) => DashboardScreen(userPhone: args));
      }
      break;

    case '/b2b/analytics':
      if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(
          builder: (_) => B2BAnalyticsScreen(userId: args['userId'] as String),
        );
      }
      break;

    case '/subscriptions':
      if (args is String) {
        return MaterialPageRoute(
            builder: (_) => SubscriptionsScreen(userId: args));
      }
      break;

    // Accept both '/expense' and '/expenses'
    case '/expense':
    case '/expenses':
      if (args is String) {
        return MaterialPageRoute(
            builder: (_) => ExpensesScreen(userPhone: args));
      }
      break;

    case '/analytics':
      // Accept either a raw String phone or a Map {'userPhone': '<phone>'}
      if (args is String) {
        return MaterialPageRoute(
            builder: (_) => AnalyticsScreen(userPhone: args));
      }
      if (args is Map<String, dynamic> && args['userPhone'] is String) {
        return MaterialPageRoute(
            builder: (_) =>
                AnalyticsScreen(userPhone: args['userPhone'] as String));
      }
      break;

    case '/premium':
      // UpgradeScreen handles logic internally, we don't strictly need the phone argument but we accept it to avoid errors if passed.
      return MaterialPageRoute(builder: (_) => const UpgradeScreen());

    // --- NEW: Native B2B Routes ---
    case '/business':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => B2BRoleSelectionScreen(userId: args));
      } else if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(builder: (_) => B2BRoleSelectionScreen(userId: args['userId'] as String));
      }
      break;

    case '/b2b/dashboard':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => B2BDashboardScreen(userId: args));
      } else if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(builder: (_) => B2BDashboardScreen(userId: args['userId'] as String));
      }
      break;
      
    case '/b2b/onboarding':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => B2BOnboardingScreen(userId: args));
      }
      break;

    case '/b2b/profile':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => B2BProfileScreen(userId: args));
      }
      break;

    case '/b2b/pos':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => POSBillingScreen(userId: args));
      } else if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(builder: (_) => POSBillingScreen(userId: args['userId'] as String));
      }
      break;

    case '/b2b/history':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => B2BOrderHistoryScreen(userId: args));
      } else if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(builder: (_) => B2BOrderHistoryScreen(userId: args['userId'] as String));
      }
      break;

    case '/b2b/ai':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => B2BAiChatScreen(userId: args));
      } else if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(builder: (_) => B2BAiChatScreen(userId: args['userId'] as String));
      }
      break;
      
    case '/b2b/inventory':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => InventoryScreen(userId: args));
      } else if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(builder: (_) => InventoryScreen(userId: args['userId'] as String));
      }
      break;

    case '/b2b/khata':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => B2BKhataDashboardScreen(userId: args));
      }
      break;

    case '/b2b/khata/detail':
      if (args is Map<String, dynamic> &&
          args['userId'] is String &&
          args['customerId'] is String &&
          args['customerName'] is String) {
        return MaterialPageRoute(
          builder: (_) => B2BKhataDetailScreen(
            userId: args['userId'] as String,
            customerId: args['customerId'] as String,
            customerName: args['customerName'] as String,
          ),
        );
      }
      break;
      
    case '/b2b/add-customer':
      if (args is Map<String, dynamic> &&
          args['userId'] is String &&
          args['isCustomer'] is bool) {
        return MaterialPageRoute(
          builder: (_) => B2BAddCustomerScreen(
            userId: args['userId'] as String,
            isCustomer: args['isCustomer'] as bool,
          ),
        );
      }
      break;
      
    case '/b2b/account':
      if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(
          builder: (_) => B2BAccountScreen(userId: args['userId'] as String),
        );
      }
      break;
      
    case '/b2b/multi-devices':
      if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(
          builder: (_) => B2BMultiDevicesScreen(userId: args['userId'] as String),
        );
      }
      break;
    // ------------------------------

    // Optional aliases: route them to AnalyticsScreen as well (no preset filter needed)
    case '/analytics-weekly':
    case '/analytics-monthly':
      if (args is String) {
        return MaterialPageRoute(
            builder: (_) => AnalyticsScreen(userPhone: args));
      }
      if (args is Map<String, dynamic> && args['userPhone'] is String) {
        return MaterialPageRoute(
            builder: (_) =>
                AnalyticsScreen(userPhone: args['userPhone'] as String));
      }
      break;

    case '/notifications':
      // Optional String userId
      final userId = args is String ? args : null;
      return MaterialPageRoute(
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Notifications')),
          body: Center(
            child: Text(
              userId == null ? 'Notifications' : 'Notifications for $userId',
              style: const TextStyle(fontSize: 16),
            ),
          ),
        ),
      );

    case '/goals':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => GoalsScreen(userId: args));
      }
      break;

    case '/add':
      if (args is String) {
        return MaterialPageRoute(
            builder: (_) => AddTransactionScreen(userId: args));
      }
      break;

    case '/addLoan':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => AddLoanScreen(userId: args));
      }
      break;

    // Legacy AddAsset (kept for backward compat)
    case '/addAsset':
      if (args is String) {
        return MaterialPageRoute(builder: (_) => AddAssetScreen(userId: args));
      }
      break;

    case '/loans':
      if (args is String && args.isNotEmpty) {
        return MaterialPageRoute(builder: (_) => LoansScreen(userId: args));
      }
      if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(
            builder: (_) => LoansScreen(userId: args['userId'] as String));
      }
      break;

    case '/assets':
      if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(
            builder: (_) => AssetsScreen(userId: args['userId'] as String));
      }
      break;

    case '/crisisMode':
      if (args is Map<String, dynamic> &&
          args['userId'] is String &&
          args['creditCardBill'] is num &&
          args['salary'] is num) {
        return MaterialPageRoute(
          builder: (_) => CrisisModeScreen(
            userId: args['userId'] as String,
            creditCardBill: (args['creditCardBill'] as num).toDouble(),
            salary: (args['salary'] as num).toDouble(),
          ),
        );
      }
      break;

    case '/insights':
      if (args is Map<String, dynamic> &&
          args['userId'] is String &&
          args['userData'] is UserData) {
        return MaterialPageRoute(
          builder: (_) => InsightFeedScreen(
            userId: args['userId'] as String,
            userData: args['userData'] as UserData,
          ),
        );
      }
      break;

    case '/transactionCount':
      if (args is String) {
        return MaterialPageRoute(
            builder: (_) => TransactionCountScreen(userId: args));
      }
      break;

    case '/transactionAmount':
      if (args is String) {
        return MaterialPageRoute(
            builder: (_) => TransactionAmountScreen(userId: args));
      }
      break;

    case '/cards-management':
      if (args is String) {
        return MaterialPageRoute(
            builder: (_) => CardsManagementScreen(userId: args));
      }
      break;

    case '/addRecurringGeneric':
    case '/addBill':
      if (args is Map<String, dynamic> &&
          args['userId'] is String &&
          args['friendId'] is String) {
        return MaterialPageRoute(
          builder: (_) => AddRecurringBasicScreen(
            userPhone: args['userId'] as String,
            scope: RecurringScope.friend(
              args['userId'] as String,
              args['friendId'] as String,
            ),
          ),
        );
      }
      break;

    case '/addSubscription':
      if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(
          builder: (_) => AddSubscriptionScreen(
            userId: args['userId'] as String,
          ),
        );
      }
      break;

    /* ------------------ NEW: Friend Recurring (deeplink target) ------------------ */
    case '/friend-recurring':
      // Accept:
      //   - String friendId
      //   - Map { friendId, userPhone?, friendName?, section? }
      {
        String? friendId;
        String? userPhone;
        String? friendName;

        if (args is String) {
          friendId = args;
        } else if (args is Map<String, dynamic>) {
          if (args['friendId'] is String) friendId = args['friendId'] as String;
          if (args['userPhone'] is String) {
            userPhone = args['userPhone'] as String?;
          }
          if (args['friendName'] is String) {
            friendName = args['friendName'] as String?;
          }
          // args['section'] is optional; if you need it later, read it in the screen via settings.arguments
        }

        // Derive userPhone if missing (phoneNumber first, fallback to uid)
        userPhone ??= FirebaseAuth.instance.currentUser?.phoneNumber ??
            FirebaseAuth.instance.currentUser?.uid ??
            '';

        if (friendId != null && friendId.isNotEmpty) {
          return MaterialPageRoute(
            builder: (_) => FriendRecurringScreen(
              userPhone: userPhone!,
              friendId: friendId!,
              friendName: friendName,
            ),
            settings:
                settings, // keep settings so screen can inspect section if needed
          );
        }
      }
      break;

    case '/friend-detail':
      {
        String? friendId;
        String? friendName;
        if (args is String) {
          friendId = args;
        } else if (args is Map<String, dynamic>) {
          if (args['friendId'] is String) {
            friendId = (args['friendId'] as String).trim();
          }
          if (args['friendName'] is String) {
            friendName = (args['friendName'] as String).trim();
          }
        }
        if (friendId != null && friendId.isNotEmpty) {
          return MaterialPageRoute(
            builder: (_) => FriendDetailRouteScreen(
              friendId: friendId!,
              friendNameHint: friendName,
            ),
            settings: settings,
          );
        }
      }
      break;

    case '/group-detail':
      {
        String? groupId;
        String? groupName;
        if (args is String) {
          groupId = args;
        } else if (args is Map<String, dynamic>) {
          if (args['groupId'] is String) {
            groupId = (args['groupId'] as String).trim();
          }
          if (args['groupName'] is String) {
            groupName = (args['groupName'] as String).trim();
          }
        }
        if (groupId != null && groupId.isNotEmpty) {
          return MaterialPageRoute(
            builder: (_) => GroupDetailRouteScreen(
              groupId: groupId!,
              groupNameHint: groupName,
            ),
            settings: settings,
          );
        }
      }
      break;

    case '/b2b/add_customer':
      if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(
          builder: (_) => B2BAddCustomerScreen(
            userId: args['userId'] as String,
            isCustomer: args['isCustomer'] ?? true,
          ),
        );
      }
      break;

    case '/b2b/account-statement':
      if (args is Map<String, dynamic> &&
          args['userId'] is String &&
          args['customerId'] is String &&
          args['customerName'] is String) {
        return MaterialPageRoute(
          builder: (_) => B2BAccountStatementScreen(
            userId: args['userId'] as String,
            customerId: args['customerId'] as String,
            customerName: args['customerName'] as String,
          ),
        );
      }
      break;

    case '/b2b/search':
      if (args is Map<String, dynamic> && args['userId'] is String) {
        return MaterialPageRoute(
          builder: (_) => B2BSearchScreen(userId: args['userId'] as String),
        );
      }
      break;

    default:
      return null;
  }

  // If we reached here, the arguments were missing/wrong type.
  return MaterialPageRoute(
    builder: (_) => _BadRouteArgsScreen(
      routeName: settings.name ?? 'unknown',
      args: args,
    ),
  );
}

class _BadRouteArgsScreen extends StatelessWidget {
  final String routeName;
  final Object? args;
  const _BadRouteArgsScreen({required this.routeName, this.args});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Navigation error')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline_rounded, size: 48),
            const SizedBox(height: 12),
            Text('Invalid or missing arguments for route "$routeName".'),
            const SizedBox(height: 8),
            Text('Received: $args'),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Go back'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Phone the app keys user data by (falls back to uid, as onGenerateRoute does).
String _signedInPhone() {
  final u = FirebaseAuth.instance.currentUser;
  final phone = u?.phoneNumber ?? '';
  return phone.isNotEmpty ? phone : (u?.uid ?? '');
}

