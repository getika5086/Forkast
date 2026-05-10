import { NextRequest, NextResponse } from "next/server";
import { fetchDecode, logEvent } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ decodeId: string }> }
) {
  const { decodeId } = await params;
  const sessionId = request.cookies.get("forkast_sid")?.value;
  const referer = request.headers.get("referer") ?? "";

  const stored = await fetchDecode(decodeId);

  if (!stored) {
    return NextResponse.json(
      { error: "not_found", message: "This decode has expired or doesn't exist." },
      { status: 404 }
    );
  }

  // Log referral event if this session arrived via a shared link (not from our own app)
  const isReferral = referer === "" || !referer.includes(process.env.NEXT_PUBLIC_APP_URL ?? "localhost");
  await logEvent({
    event_type: isReferral ? "decode_url_referral" : "decode_url_viewed",
    decode_id: decodeId,
    session_id: sessionId,
    decode_url_referral: isReferral,
  });

  return NextResponse.json(stored);
}
