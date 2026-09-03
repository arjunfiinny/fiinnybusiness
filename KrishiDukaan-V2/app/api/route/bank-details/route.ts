import { NextResponse } from 'next/server';
import { getAdminAuth } from '../../../lib/firebase-admin';
import {
  phoneForUid,
  razorpayClient,
  resolveSellerAccount,
  saveSellerRouteState,
} from '../../../lib/route-server';

/**
 * POST /api/route/bank-details
 *
 * Submits a seller's settlement account to Razorpay so their linked account can
 * be activated for payouts.
 *
 * DELIBERATELY A PASS-THROUGH. The account number, IFSC and beneficiary name
 * are read from the request, forwarded to Razorpay, and dropped. They are never
 * written to Firestore, never logged, and never returned in a response. Razorpay
 * is the system of record for settlement details; storing a copy here would add
 * a bank-account database to defend for no functional gain.
 *
 * Only the seller themselves can call this for their own account.
 */
export async function POST(request: Request) {
  try {
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
      return NextResponse.json({ error: 'No phone linked to this account.' }, { status: 400 });
    }

    const seller = await resolveSellerAccount(phone);
    if (!seller) {
      return NextResponse.json({ error: 'No seller profile found.' }, { status: 404 });
    }
    if (!seller.razorpayAccountId || !seller.data.routeProductId) {
      return NextResponse.json(
        { error: 'Set up payouts first, then add your bank account.' },
        { status: 409 },
      );
    }

    const body = (await request.json()) as {
      accountNumber?: string;
      ifscCode?: string;
      beneficiaryName?: string;
    };

    const accountNumber = String(body.accountNumber ?? '').replace(/\s/g, '');
    const ifscCode = String(body.ifscCode ?? '').trim().toUpperCase();
    const beneficiaryName = String(body.beneficiaryName ?? '').trim();

    // Validate before sending: Razorpay's rejection messages for these are
    // generic, and a seller retyping their account number three times because
    // "validation failed" is how a payouts flow gets abandoned.
    if (!/^\d{5,20}$/.test(accountNumber)) {
      return NextResponse.json(
        { error: 'Enter a valid bank account number.' },
        { status: 400 },
      );
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      return NextResponse.json(
        { error: 'Enter a valid IFSC code (for example SBIN0001234).' },
        { status: 400 },
      );
    }
    if (beneficiaryName.length < 3) {
      return NextResponse.json(
        { error: 'Enter the account holder name as it appears on the bank account.' },
        { status: 400 },
      );
    }

    const updated = (await razorpayClient.products.edit(
      seller.razorpayAccountId,
      String(seller.data.routeProductId),
      {
        settlements: {
          account_number: accountNumber,
          ifsc_code: ifscCode,
          beneficiary_name: beneficiaryName,
        },
        tnc_accepted: true,
      } as never,
    )) as { activation_status?: string; requirements?: unknown[] };

    // Only the activation state is persisted — never the details themselves.
    await saveSellerRouteState(seller, {
      routeStatus: updated.activation_status ?? 'under_review',
    });

    return NextResponse.json({
      activationStatus: updated.activation_status ?? 'under_review',
      requirements: updated.requirements ?? [],
    });
  } catch (error) {
    // The message is logged without the request body so account numbers cannot
    // reach the logs via an error path.
    console.error('[route/bank-details] submission failed');
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Could not save bank details: ${message}` },
      { status: 500 },
    );
  }
}
