import type { DecodeOutput } from "./types";

export function buildShareText(decode: DecodeOutput, decodeUrl: string): string {
  const orders = decode.topPicks.slice(0, 3);
  const skips = decode.avoid.slice(0, 2);

  const location = decode.restaurant.city
    ? `${decode.restaurant.name} (${decode.restaurant.city})`
    : decode.restaurant.name;

  const orderList = orders.map((d) => d.priceDisplay ? `${d.name} ${d.priceDisplay}` : d.name).join(", ");
  const skipList = skips.map((d) => d.name).join(", ");

  const lines = [
    `Forkast decoded ${location} 🍽️`,
    "",
    `Score: ${decode.verdict.score}/10 — ${decode.verdict.summary}`,
    "",
    orderList ? `✅ Order: ${orderList}` : null,
    skipList ? `🚫 Skip: ${skipList}` : null,
    "",
    decodeUrl,
  ];

  return lines.filter((l) => l !== null).join("\n");
}

export function getSessionId(): string {
  if (typeof document === "undefined") return "";
  const key = "forkast_sid";
  let sid = getCookie(key);
  if (!sid) {
    sid = crypto.randomUUID();
    const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${key}=${sid}; expires=${expires}; path=/; SameSite=Lax`;
  }
  return sid;
}

function getCookie(name: string): string {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()!.split(";").shift()!;
  return "";
}

export function compressImageClientSide(
  file: File,
  maxDimension = 1024  // 1024px = 4 tiles max vs 12 tiles at 1600px — 3x cheaper, no quality loss for menus
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve(dataUrl.replace(/^data:image\/\w+;base64,/, ""));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
