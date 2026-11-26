import { NextRequest, NextResponse } from "next/server";

type GoogleResult = {
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  address_components?: Array<{ short_name?: string; types?: string[] }>;
};

/** Resolve a shopper-entered Indian city, locality or pincode for product-store search. */
export async function GET(req: NextRequest) {
  const location = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (location.length < 3 || location.length > 80) {
    return NextResponse.json({ error: "Enter a city, locality or 6-digit pincode." }, { status: 400 });
  }
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Location search is unavailable right now." }, { status: 503 });
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", location);
    url.searchParams.set("components", "country:IN");
    url.searchParams.set("key", key);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
    const body = (await response.json()) as { status?: string; results?: GoogleResult[] };
    if (body.status === "ZERO_RESULTS" || !body.results?.length) {
      return NextResponse.json({ error: "Location not found. Try a nearby city or pincode." }, { status: 404 });
    }
    if (body.status !== "OK") throw new Error(`Geocoder status ${body.status ?? "unknown"}`);
    const result = body.results.find((item) =>
      item.address_components?.some((part) => part.types?.includes("country") && part.short_name === "IN"),
    );
    const lat = result?.geometry?.location?.lat;
    const lng = result?.geometry?.location?.lng;
    if (!result || typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Choose an Indian location or pincode." }, { status: 404 });
    }
    return NextResponse.json(
      { label: result.formatted_address || location, lat, lng },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.warn("[geocode/search] lookup failed", error);
    return NextResponse.json({ error: "Location search is unavailable. Please try again." }, { status: 503 });
  }
}
