import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/supabase";
import type { DecodeEvent } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body: DecodeEvent = await request.json();
    const sessionId = request.cookies.get("forkast_sid")?.value;

    await logEvent({ ...body, session_id: sessionId ?? body.session_id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/events]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
