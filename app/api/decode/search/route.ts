import { NextRequest, NextResponse } from "next/server";
import { decodeFromName } from "@/lib/claude";
import { storeDecodeWithRetry, logEvent, lookupCachedDecode } from "@/lib/supabase";

// 55s gives the 3 parallel searches + final decode room to breathe.
// Vercel Pro allows up to 60s — this leaves a 5s buffer.
const TIMEOUT_MS = 55_000;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const sessionId = request.cookies.get("forkast_sid")?.value;

  let restaurantName = "";
  let city = "";

  try {
    const body = await request.json();
    restaurantName = (body.restaurantName ?? "").trim();
    city = (body.city ?? "").trim();

    if (!restaurantName) {
      return NextResponse.json({ error: "Restaurant name is required" }, { status: 400 });
    }

    console.log(`\n[forkast:route] POST /api/decode/search — "${restaurantName}"${city ? `, ${city}` : ""}`);

    // ── Cache lookup — skip the full decode if we have a fresh high-confidence result ──
    const cached = await lookupCachedDecode(restaurantName, city || undefined);
    if (cached) {
      console.log(`[forkast:route] ✓ Cache hit — decodeId: ${cached.decodeId} (skipping decode)`);
      await logEvent({
        event_type: "decode_cache_hit",
        decode_id: cached.decodeId,
        input_type: "name",
        session_id: sessionId,
        restaurant_name: restaurantName,
        restaurant_city: city || undefined,
      });
      return NextResponse.json({ decodeId: cached.decodeId, decode: cached.decode, partial: false, fromCache: true });
    }

    await logEvent({
      event_type: "decode_started",
      input_type: "name",
      session_id: sessionId,
      restaurant_name: restaurantName,
      restaurant_city: city || undefined,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)
    );

    const { decode, partial } = await Promise.race([
      decodeFromName(restaurantName, city || undefined),
      timeoutPromise,
    ]);

    const decodeId = await storeDecodeWithRetry(decode, {
      inputType: "name",
      restaurantName: restaurantName,   // user's input — used as cache key for next lookup
      restaurantCity: city || null,
      confidence: decode.meta.confidence,
      partial,
    });

    const latency = Date.now() - startTime;
    console.log(`[forkast:route] ✓ Success — decodeId: ${decodeId}, latency: ${latency}ms, partial: ${partial}, confidence: ${decode.meta.confidence}`);

    await logEvent({
      event_type: partial ? "decode_partial" : "decode_success",
      decode_id: decodeId ?? undefined,
      input_type: "name",
      session_id: sessionId,
      restaurant_name: decode.restaurant.name,
      restaurant_city: decode.restaurant.city ?? undefined,
      confidence_level: decode.meta.confidence,
      decode_success: true,
      decode_latency_ms: latency,
    });

    return NextResponse.json({ decodeId, decode, partial });
  } catch (err) {
    const latency = Date.now() - startTime;
    const isTimeout = err instanceof Error && err.message === "timeout";
    const isNotFound = err instanceof Error && err.message === "not_found";
    const errorType = isTimeout ? "timeout" : isNotFound ? "not_found" : "unknown";

    console.error(`[forkast:route] ✗ ${errorType} after ${latency}ms — "${restaurantName}"${city ? `, ${city}` : ""}`);
    if (!isTimeout && !isNotFound) console.error(err);

    await logEvent({
      event_type: "decode_failed",
      input_type: "name",
      session_id: sessionId,
      restaurant_name: restaurantName || undefined,
      restaurant_city: city || undefined,
      decode_success: false,
      decode_latency_ms: latency,
      error_type: isTimeout ? "timeout" : isNotFound ? "not_found" : null,
    });

    if (isNotFound) {
      return NextResponse.json(
        {
          error: "not_found",
          message: "We couldn't find a menu for this restaurant. Try adding a city, or upload a photo of the menu.",
        },
        { status: 404 }
      );
    }

    if (isTimeout) {
      return NextResponse.json(
        {
          error: "timeout",
          message: "This one's taking longer than usual. Try again in a moment.",
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "decode_failed", message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
