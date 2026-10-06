"use client";

/**
 * Scoped reads for admin pages that used to filter whole collections in the
 * browser: sellers by role, docs by owner, subscriptions that are active.
 */

import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";

export type AdminUser = { id: string; [key: string]: any };

/** Users whose role is one of `roles` (at most 30), e.g. the sellers. */
export async function fetchUsersByRoles(roles: string[]): Promise<AdminUser[]> {
  const snap = await getDocs(query(collection(db, "users"), where("role", "in", roles)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Retailers and manufacturers. */
export function fetchSellers(): Promise<AdminUser[]> {
  return fetchUsersByRoles(["retailer", "manufacturer"]);
}

/** Subscriptions with status "active" that have not expired yet, soonest expiry first. */
export async function fetchActiveSubscriptions(): Promise<any[]> {
  const snap = await getDocs(query(
    collection(db, "subscriptions"),
    where("subscriptionStatus", "==", "active"),
    where("expiryDate", ">", Timestamp.now()),
    orderBy("expiryDate", "asc"),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
