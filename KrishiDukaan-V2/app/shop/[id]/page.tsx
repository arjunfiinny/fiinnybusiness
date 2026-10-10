import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { sharePhone } from "../../lib/share-links";
import { storePathForPhone } from "../../lib/seo/stores-server";

/**
 * Shared shop link: /shop/{phone} (app/lib/share-links.ts). Phones with the
 * app installed open it in the app (App Links / Universal Links); everyone
 * else lands here and is sent to the shop's store page, or to the shop on the
 * store map when it has no store page yet (no city/state on its profile).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: true } };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ShopLinkPage({ params }: PageProps) {
  const { id } = await params;
  const phone = sharePhone(decodeURIComponent(id));
  if (!phone) notFound();
  const path = await storePathForPhone(phone);
  redirect(path ?? `/?view=map&store=${encodeURIComponent(phone)}`);
}
