import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import corsLib from 'cors';
import type { Request, Response } from 'express';

/**
 * resetTenantUserPassword — Business Admin password reset, tenant-scoped.
 *
 * Exposed as an `onRequest` HTTP function invoked through a Firebase Hosting
 * rewrite (`/api/users/reset-password`), NOT as a public callable. Hosting
 * invokes same-project functions via its own service identity, so the function
 * never needs an `allUsers` invoker binding — this is required because the org
 * policy (Domain Restricted Sharing) forbids `allUsers`. This mirrors the
 * payments.ts endpoints.
 *
 * Security model (all enforced server-side; nothing from the client is trusted):
 *  1. Caller must present a valid Firebase ID token (Authorization: Bearer …).
 *  2. Caller's role + tenant are read from `users/{callerUid}` in Firestore —
 *     NOT taken from the request payload.
 *  3. Caller must be a Business Admin (role === 'admin') of a real tenant.
 *  4. The target user's tenant is read from `users/{targetUid}` and must equal
 *     the caller's tenant. A caller can never reset a user in another tenant.
 *  5. The new password is validated, applied via the Admin SDK, and NEVER
 *     written to Firestore or logged.
 */

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://finny-erp-uat.web.app',
  'https://karanarjun-pvt-ltd.web.app',
  'https://fiinny.com',
];

const cors = corsLib({ origin: ALLOWED_ORIGINS, methods: ['POST', 'OPTIONS'] });

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Verify the Firebase ID token from the Authorization header. */
async function authenticate(req: Request): Promise<admin.auth.DecodedIdToken> {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Missing or malformed Authorization header');
  try {
    return await admin.auth().verifyIdToken(header.slice(7));
  } catch {
    throw new HttpError(401, 'Invalid or expired ID token');
  }
}

export const resetTenantUserPassword = functions
  .region('asia-south1')
  .https.onRequest((req: Request, res: Response) => {
    cors(req, res, async () => {
      try {
        if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

        const decoded = await authenticate(req);
        const callerUid = decoded.uid;
        const { targetUid, newPassword } = req.body as {
          targetUid?: string;
          newPassword?: string;
        };

        if (!targetUid || typeof targetUid !== 'string') throw new HttpError(400, 'Missing target user');
        if (typeof newPassword !== 'string' || newPassword.length < 6) {
          throw new HttpError(400, 'Password must be at least 6 characters');
        }
        if (newPassword.length > 4096) throw new HttpError(400, 'Password is too long');

        const db = admin.firestore();

        // ── Resolve caller identity from the server, never from the client ──────
        const callerSnap = await db.doc(`users/${callerUid}`).get();
        const caller = callerSnap.data();
        const callerTenantId = caller?.tenantId;
        if (!caller || caller.role !== 'admin' || !callerTenantId) {
          throw new HttpError(403, 'Only a business admin can reset passwords');
        }

        // ── Verify the target belongs to the caller's tenant ───────────────────
        const targetSnap = await db.doc(`users/${targetUid}`).get();
        const target = targetSnap.data();
        if (!target) throw new HttpError(404, 'Target user not found');
        if (target.tenantId !== callerTenantId) {
          // Do not leak whether the user exists in another tenant.
          throw new HttpError(403, 'You can only reset passwords for users in your own business');
        }

        // ── Apply the new password via the Admin SDK. Never stored/logged. ─────
        try {
          await admin.auth().updateUser(targetUid, { password: newPassword });
        } catch (err: any) {
          functions.logger.error('[userAdmin] Password reset failed', {
            callerUid, targetUid, tenantId: callerTenantId, code: err?.code,
          });
          throw new HttpError(500, 'Could not reset password');
        }

        functions.logger.info('[userAdmin] Password reset', {
          callerUid, targetUid, tenantId: callerTenantId,
        });

        res.json({ success: true });
      } catch (err) {
        if (err instanceof HttpError) {
          res.status(err.status).json({ error: err.message });
        } else {
          functions.logger.error('[userAdmin] Unhandled error', err);
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });
  });
