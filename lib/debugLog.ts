import fs from "fs";
import path from "path";

// Only writes in local dev — never on Vercel or any production environment
const ENABLED = process.env.NODE_ENV === "development" && !process.env.VERCEL;
const LOG_FILE = path.join(process.cwd(), "decode-debug.log");

export interface RawResult {
  title: string;
  url: string;
  content: string;
}

export function appendDecodeLog(opts: {
  restaurantName: string;
  city?: string;
  validationResults: RawResult[];
  menuResults: RawResult[];
  platformResults: RawResult[];
  reviewResults: RawResult[];
  criticResults: RawResult[];
  combinedContext: string;
  claudeUserMessage: string;
  menuQuery?: string;
  platformQuery?: string;
  reviewQuery?: string;
  criticQuery?: string;
}) {
  if (!ENABLED) return;

  const sep = "=".repeat(80);
  const bar = (label: string) => `── ${label} ${"─".repeat(Math.max(0, 74 - label.length))}`;

  const formatResults = (results: RawResult[]) =>
    results.length === 0
      ? "  (no results)\n"
      : results
          .map(
            (r, i) =>
              `  [${i + 1}] ${r.title}\n` +
              `      URL: ${r.url}\n` +
              `      Content: ${r.content.slice(0, 400).replace(/\n+/g, " ").trim()}${r.content.length > 400 ? "…" : ""}\n`
          )
          .join("\n");

  const entry = [
    "",
    sep,
    `DECODE: "${opts.restaurantName}"${opts.city ? ` / "${opts.city}"` : ""}`,
    `Timestamp: ${new Date().toISOString()}`,
    sep,
    "",
    bar("VALIDATION SEARCH"),
    `Query: "${opts.restaurantName}" restaurant${opts.city ? ` ${opts.city}` : ""}`,
    formatResults(opts.validationResults),
    bar(`SEARCH A — MENU DATA (${opts.menuResults.length} results)`),
    `Query: ${opts.menuQuery ?? `${opts.restaurantName}${opts.city ? `, ${opts.city}` : ""} restaurant full menu starters mains desserts prices`}`,
    formatResults(opts.menuResults),
    bar(`SEARCH B — PLATFORM DATA (${opts.platformResults.length} results)`),
    `Query: ${opts.platformQuery ?? `${opts.restaurantName}${opts.city ? `, ${opts.city}` : ""} restaurant menu Zomato Swiggy Yelp DoorDash dishes prices`}`,
    formatResults(opts.platformResults),
    bar(`SEARCH C — REVIEW DATA (${opts.reviewResults.length} results)`),
    `Query: ${opts.reviewQuery ?? `${opts.restaurantName}${opts.city ? `, ${opts.city}` : ""} restaurant review what to order best dishes worth trying`}`,
    formatResults(opts.reviewResults),
    bar(`SEARCH D — CRITIC/NEGATIVE DATA (${opts.criticResults.length} results)`),
    `Query: ${opts.criticQuery ?? `${opts.restaurantName}${opts.city ? `, ${opts.city}` : ""} restaurant disappointing overrated skip not worth ordering`}`,
    formatResults(opts.criticResults),
    bar(`COMBINED CONTEXT SENT TO CLAUDE (${opts.combinedContext.length} chars)`),
    opts.combinedContext,
    "",
    bar("CLAUDE USER MESSAGE"),
    opts.claudeUserMessage,
    "",
    sep,
    "END DECODE",
    sep,
    "",
  ].join("\n");

  try {
    fs.appendFileSync(LOG_FILE, entry, "utf8");
  } catch (err) {
    console.error("[forkast:debugLog] Failed to write log:", err);
  }
}
