import { NextResponse } from "next/server";
import { getMarketRanking } from "../../../lib/marketplace-rank-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/rank
 *
 * The Market's default order (lib/marketplace-rank.ts) as product ids, for the
 * Flutter app, which loads every card itself and sorts by this list so the app
 * and the website show the same order. Same answer for every visitor, so the
 * CDN serves it; the app keeps its own order when this call fails.
 *
 * Response: { ids: string[] }   card `id` field values, first = top of the Market
 */
export async function GET() {
  try {
    const ranking = await getMarketRanking();
    return NextResponse.json(
      { ids: ranking.map((r) => r.productId) },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
    );
  } catch (err) {
    console.error("[api/marketplace/rank] failed:", err);
    return NextResponse.json({ error: "Ranking unavailable" }, { status: 503 });
  }
}
