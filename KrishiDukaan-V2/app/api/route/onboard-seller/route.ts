import { NextResponse } from 'next/server';
import { getAdminAuth } from '../../../lib/firebase-admin';
import {
  loadRouteConfig,
  phoneForUid,
  razorpayClient,
  resolveSellerAccount,
  saveSellerRouteState,
} from '../../../lib/route-server';

/**
 * POST /api/route/onboard-seller
 *
 * Creates the seller's Razorpay Route linked account and requests the `route`
 * product on it, then reports back what Razorpay still needs before payouts can
 * be activated.
 *
 * A seller is onboarded LAZILY — this is called when they get their first order,
 * not in bulk. There are 434 seller records and almost none of them have an
 * order waiting; chasing all of them through KYC up front would take months and
 * produce nothing. Until a seller is onboarded their orders settle the old way.
 *
 * NO BANK DETAILS PASS THROUGH HERE. This endpoint only establishes the account.
 * Settlement details are submitted separately (see ../bank-details) and are
 * never written to Firestore.
 */
export async function POST(request: Request) {
  try {
    // ── Caller must be the seller themselves ────────────────────────────────
    const authHeader = request.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 });
    }

    let uid: string;
    try {
      uid = (await getAdminAuth().verifyIdToken(authHeader.slice(7))).uid;
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 401 });
    }

    const phone = await phoneForUid(uid);
    if (!phone) {
      return NextResponse.json(
        { error: 'No phone number is linked to this account.' },
        { status: 400 },
      );
    }

    const seller = await resolveSellerAccount(phone);
    if (!seller) {
      return NextResponse.json(
        { error: 'No seller profile found for this account.' },
        { status: 404 },
      );
    }

    // ── Already onboarded: report status rather than creating a duplicate ────
    // Creating a second linked account for one seller would split their payouts
    // across two Razorpay accounts with no way to tell which one an order paid.
    if (seller.razorpayAccountId) {
      const status = await fetchRouteStatus(seller.razorpayAccountId);
      await saveSellerRouteState(seller, { routeStatus: status.activationStatus });
      return NextResponse.json({
        accountId: seller.razorpayAccountId,
        alreadyOnboarded: true,
        ...status,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      legalBusinessName?: string;
      businessType?: string;
    };

    const email = (body.email ?? seller.email ?? '').trim();
    if (!email) {
      return NextResponse.json(
        { error: 'An email address is required to create a payouts account.' },
        { status: 400 },
      );
    }

    // Razorpay requires a legal business name of at least 4 characters. Shop
    // names in this dataset are real ("KISAN SHAKTI KENDRA"), but 9 of 434 are
    // blank — fail with a clear message rather than sending a name Razorpay
    // will reject with a generic validation error.
    const legalName = (body.legalBusinessName ?? seller.shopName ?? '').trim();
    if (legalName.length < 4) {
      return NextResponse.json(
        { error: 'Please set your shop name (at least 4 characters) before enabling payouts.' },
        { status: 400 },
      );
    }

    const config = await loadRouteConfig();

    const account = await razorpayClient.accounts.create({
      email,
      phone: phone.replace(/^\+/, ''),
      type: 'route',
      legal_business_name: legalName,
      customer_facing_business_name: legalName,
      business_type: body.businessType ?? 'proprietorship',
      // Lets us find the seller from a Razorpay-side record without a reverse
      // lookup table, and makes the linked account self-describing in their
      // dashboard.
      reference_id: seller.phone,
      profile: {
        category: 'ecommerce',
        subcategory: 'agriculture',
        addresses: {
          registered: {
            street1: String(seller.data.address ?? seller.data.street ?? 'NA'),
            street2: String(seller.data.area ?? ''),
            city: String(seller.data.city ?? ''),
            state: String(seller.data.state ?? ''),
            postal_code: String(seller.data.pincode ?? ''),
            country: 'IN',
          },
        },
      },
      ...(seller.data.gstin ? { legal_info: { gst: String(seller.data.gstin) } } : {}),
    } as never);

    const accountId = (account as { id: string }).id;

    // Request the route product straight away: without it the linked account
    // exists but cannot receive transfers.
    let productId: string | undefined;
    let activationStatus = 'requested';
    let requirements: unknown[] = [];
    try {
      const product = (await razorpayClient.products.requestProductConfiguration(accountId, {
        product_name: 'route',
        tnc_accepted: true,
      } as never)) as { id?: string; activation_status?: string; requirements?: unknown[] };
      productId = product.id;
      activationStatus = product.activation_status ?? 'requested';
      requirements = product.requirements ?? [];
    } catch (e) {
      // The account is real and saved below even if the product request fails,
      // so a retry does not orphan a linked account at Razorpay.
      console.error('[route/onboard-seller] product config failed:', e);
    }

    await saveSellerRouteState(seller, {
      razorpayAccountId: accountId,
      routeStatus: activationStatus,
      ...(productId ? { routeProductId: productId } : {}),
    });

    return NextResponse.json({
      accountId,
      productId,
      activationStatus,
      requirements,
      alreadyOnboarded: false,
      commissionPercent: config.commissionPercent,
      feeBearer: config.feeBearer,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[route/onboard-seller] failed:', error);
    return NextResponse.json(
      { error: `Could not set up payouts: ${message}` },
      { status: 500 },
    );
  }
}

/** Current activation state and outstanding requirements for a linked account. */
async function fetchRouteStatus(accountId: string): Promise<{
  activationStatus: string;
  requirements: unknown[];
}> {
  try {
    const products = (await razorpayClient.products.fetch(accountId, 'route')) as {
      activation_status?: string;
      requirements?: unknown[];
    };
    return {
      activationStatus: products.activation_status ?? 'unknown',
      requirements: products.requirements ?? [],
    };
  } catch (e) {
    console.error('[route/onboard-seller] status fetch failed:', e);
    return { activationStatus: 'unknown', requirements: [] };
  }
}
