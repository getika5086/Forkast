import { NextRequest, NextResponse } from "next/server";
import { fetchDecode, logEvent } from "@/lib/supabase";
import { getAppUrl } from "@/lib/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ decodeId: string }> }
) {
  const { decodeId } = await params;
  const sessionId = request.cookies.get("forkast_sid")?.value;

  const stored = await fetchDecode(decodeId);
  if (!stored) {
    return NextResponse.json({ error: "Decode not found or expired" }, { status: 404 });
  }

  try {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1350 });

    const cardUrl = `${getAppUrl()}/card/${decodeId}`;
    await page.goto(cardUrl, { waitUntil: "networkidle0", timeout: 20000 });

    // Wait for the card content to be fully rendered
    await page.waitForSelector("[data-card-ready]", { timeout: 10000 });

    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    await browser.close();

    await logEvent({
      event_type: "decode_url_viewed",
      decode_id: decodeId,
      session_id: sessionId,
    });

    return new NextResponse(Buffer.from(screenshot), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="forkast-${stored.restaurant_name ?? decodeId}.png"`,
      },
    });
  } catch (err) {
    console.error("[/api/card]", err);
    return NextResponse.json(
      { error: "card_failed", message: "Couldn't generate the card right now. Copy the share text instead." },
      { status: 500 }
    );
  }
}
