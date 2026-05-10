import { NextRequest, NextResponse } from "next/server";
import { decodeFromImages } from "@/lib/claude";
import { storeDecodeWithRetry, logEvent } from "@/lib/supabase";

const MAX_IMAGES = 4;
const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const sessionId = request.cookies.get("forkast_sid")?.value;

  let inputType: "photo" | "screenshot" = "photo";
  let images: string[] = [];

  try {
    const body = await request.json();
    inputType = body.inputType ?? "photo";
    images = body.images ?? [];

    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 });
    }
    if (images.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_IMAGES} images per decode` },
        { status: 400 }
      );
    }

    await logEvent({ event_type: "decode_started", input_type: inputType, session_id: sessionId });

    const decode = await decodeFromImages(images, inputType);

    // Validate minimum output — if topPicks missing, treat as parse failure
    if (!decode.topPicks || decode.topPicks.length === 0) {
      await logEvent({
        event_type: "decode_failed",
        input_type: inputType,
        session_id: sessionId,
        decode_success: false,
        decode_latency_ms: Date.now() - startTime,
        error_type: "image_parse_fail",
      });
      return NextResponse.json(
        {
          error: "image_parse_fail",
          message: "We couldn't read enough of this menu. Try a clearer photo, or search by restaurant name instead.",
        },
        { status: 422 }
      );
    }

    const decodeId = await storeDecodeWithRetry(decode, {
      inputType,
      restaurantName: decode.restaurant.name,
      restaurantCity: decode.restaurant.city,
      confidence: decode.meta.confidence,
      partial: false,
    });

    const latency = Date.now() - startTime;
    await logEvent({
      event_type: "decode_success",
      decode_id: decodeId ?? undefined,
      input_type: inputType,
      session_id: sessionId,
      restaurant_name: decode.restaurant.name,
      restaurant_city: decode.restaurant.city ?? undefined,
      confidence_level: decode.meta.confidence,
      decode_success: true,
      decode_latency_ms: latency,
    });

    return NextResponse.json({ decodeId, decode });
  } catch (err) {
    const latency = Date.now() - startTime;
    await logEvent({
      event_type: "decode_failed",
      input_type: inputType,
      session_id: sessionId,
      decode_success: false,
      decode_latency_ms: latency,
      error_type: latency > 24000 ? "timeout" : "image_parse_fail",
    });

    console.error("[/api/decode]", err);
    return NextResponse.json(
      { error: "decode_failed", message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
