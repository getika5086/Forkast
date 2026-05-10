import Anthropic from "@anthropic-ai/sdk";
import { tavily } from "@tavily/core";
import type { DecodeOutput, InputType } from "./types";
import { appendDecodeLog, type RawResult } from "./debugLog";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Lazy Tavily client — only initialised when actually used
let _tavily: ReturnType<typeof tavily> | null = null;
function getTavily() {
  if (!_tavily) _tavily = tavily({ apiKey: process.env.TAVILY_API_KEY! });
  return _tavily;
}

// Haiku for all decodes — fast, cheap, handles structured JSON well
// Tavily for web searches — <1s vs Claude web_search tool's 35-40s
const MODEL_DECODE = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 8192;

// Per-search total caps (sum of all results in that search).
const MAX_MENU_CHARS     = 6000;
const MAX_PLATFORM_CHARS = 5000;
const MAX_REVIEW_CHARS   = 5000;

// Per-result cap — prevents one page's boilerplate eating the whole budget.
const MAX_PER_RESULT_CHARS = 1800;

// Removes repeated paragraph blocks from raw page content.
// Websites often render the same nav/footer multiple times for responsive layouts.
function dedupeContent(raw: string): string {
  const seen = new Set<string>();
  return raw
    .split(/\n{2,}/)                        // split into paragraphs
    .filter((block) => {
      const key = block.trim().toLowerCase();
      if (key.length < 20) return true;     // keep short lines (headings, prices)
      if (seen.has(key)) return false;      // drop exact duplicate blocks
      seen.add(key);
      return true;
    })
    .join("\n\n");
}

// ─── System prompt ────────────────────────────────────────────────────────────
// temperature: 0 + rubric-based classification = consistent results across runs.
// The rubric anchors every classification decision to observable signals, not vibes.

const DECODE_SYSTEM_PROMPT = `You are the Forkast decode engine. You analyse restaurant menus and return exactly 3 dishes to order and 3 to avoid, plus menu psychology observations.

TOP PICKS SELECTION CRITERIA — choose dishes that satisfy one or more of the following:
- Exceptional value: price is at or below median for its section AND description signals real kitchen effort
- Technique-driven: braised, fermented, slow-cooked, wood-fired, house-made, aged, cured — any signal the kitchen invested time
- Chef's signature or "signature" section placement
- Seasonal ingredient that is only good right now (fresh catch, seasonal produce)
- Highly reviewed: mentioned positively across multiple review sources
- Underordered hidden gem: strong description, low prominence on menu, priced below expectations

AVOID SELECTION CRITERIA — STRICT RULES:
- Must be a real dish from the menu: an appetiser, main course, or dessert — NOT rice, bread, sauces, condiments, drinks, or obvious sides that nobody orders as a standalone choice
- The avoid list must surprise the diner — if they could have guessed it without Forkast, it is not worth including
- GROUNDING RULE: every avoid item must be justified by EITHER (a) a concrete price signal from the menu data — e.g. dish X costs 30% more than comparable dishes in the same section — OR (b) an explicit negative signal from a review source in the provided data. Do NOT use general culinary knowledge or assumptions about dish categories to invent avoid items. If you cannot find 3 items meeting this standard, include fewer and set meta.confidence to "low".
- Choose dishes that satisfy one or more of the following:
  - Price trap: a named dish (not a side) priced 25%+ above comparable items in the same section with no quality justification
  - Weak main: a headline dish (e.g. a pasta, a curry, a protein) that review sources in the provided data explicitly suggest is not the kitchen's strength
  - Tourist filler: a dish that exists to capture unfamiliar diners — safe, generic, overpriced, not what regulars order — supported by a price signal or review mention
  - Misleading description: dish sounds appealing but the preparation or ingredients are actually cheap or reheated
  - Cannibalised by better option: a dish that is strictly inferior to another item on the same menu at a similar price

PSYCHOLOGY OBSERVATIONS — ACCURACY RULES:
- Look at the menu and describe EXACTLY what you see — do not assume a pattern, describe the actual pattern
- Currency symbols: check carefully. If SOME prices have $ and others do not, describe the specific pattern (e.g. "premium mains listed without $, sides listed with $") — do NOT write "absence of currency symbols" if symbols are present anywhere on the menu
- Only cite tactics that are directly observable in the menu data provided
- Each observation must name specific dishes, sections, or price points from this menu

VALUE SCORE RUBRIC (1.0–10.0, one decimal):
9.0–10.0  Exceptional quality-to-price — destination-worthy
7.0–8.9   Good — recommended with minor reservations
5.0–6.9   Average — some standouts, overall unremarkable
3.0–4.9   Below average — consistently overpriced or weak kitchen signals
1.0–2.9   Poor — avoid unless no alternative

PICK TAGS (use only): "Best value" | "Chef's signature" | "Technique-driven" | "Authentic preparation" | "Most reviewed" | "Seasonal" | "Underordered" | "Hidden gem" | "Portion warning"
AVOID TAGS (use only): "High-margin item" | "Tourist trap" | "Overpriced" | "Generic preparation" | "Better elsewhere" | "Poor value"

OUTPUT RULES:
- Return ONLY valid JSON. No markdown, no prose, no explanation outside the JSON.
- Output in English regardless of menu language
- meta.currency: ISO 4217 code detected from menu (default "USD")
- meta.decodeTimestamp: current ISO 8601 timestamp
- verdict.summary: one sentence, max 200 chars — the single most useful thing to know
- price: numeric only (no symbol), null if not on menu
- topPicks and avoid: EXACTLY 3 items each — no more, no fewer
- psychology: exactly 2 observations — the 2 most important tactics only, each grounded in a specific menu element. explanation must be one sentence max, under 120 characters

SCHEMA:
{
  "restaurant": { "name": string, "city": string|null, "cuisine": string, "priceRange": "budget"|"mid"|"upscale"|"fine-dining" },
  "meta": { "inputType": "photo"|"screenshot"|"name", "confidence": "high"|"medium"|"low", "dishesAnalysed": number, "currency": string, "decodeTimestamp": string },
  "verdict": { "score": number, "summary": string },
  "topPicks": [{ "name": string, "price": number|null, "priceDisplay": string|null, "reason": string, "tags": string[] }],
  "avoid": [{ "name": string, "price": number|null, "priceDisplay": string|null, "reason": string, "tags": string[] }],
  "psychology": [{ "title": string, "explanation": string }]
}`;

// ─── Image decode ─────────────────────────────────────────────────────────────

export async function decodeFromImages(
  images: string[], // base64-encoded
  inputType: "photo" | "screenshot"
): Promise<DecodeOutput> {
  const imageContent = images.map((b64) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: detectMediaType(b64),
      data: b64,
    },
  }));

  const response = await anthropic.messages.create({
    model: MODEL_DECODE,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    system: [
      {
        type: "text",
        text: DECODE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: `Decode this menu. Input type: "${inputType}". Apply the full rubric and return JSON only.`,
          },
        ],
      },
    ],
  });

  logTokenCost("image-decode", response.usage, MODEL_DECODE);
  return parseDecodeResponse(response, inputType);
}

// ─── Name search decode ────────────────────────────────────────────────────────

export async function decodeFromName(
  restaurantName: string,
  city?: string
): Promise<{ decode: DecodeOutput; partial: boolean }> {
  const locationStr = city ? `${restaurantName}, ${city}` : restaurantName;
  const t0 = Date.now();

  console.log(`\n[forkast:search] ── Starting decode for "${locationStr}" ──`);

  // ── Step 1: validate the restaurant exists before spending 3 search credits ──
  const validationResults = await validateRestaurantExists(restaurantName, city);
  console.log(`[forkast:search] ✓ Validated in ${Date.now() - t0}ms — proceeding`);

  console.log(`[forkast:search] Launching 4 parallel web searches...`);

  // Four parallel web searches targeting different source types
  const [menuData, platformData, reviewData, criticData] = await Promise.allSettled([
    searchForMenuData(locationStr),
    searchForPlatformData(locationStr),
    searchForReviewData(locationStr),
    searchForCriticData(locationStr),
  ]);

  const sources: string[] = [];
  let sourceUrl: string | null = null;
  const allSourceUrls: string[] = [];
  let menuRaw: RawResult[] = [];
  let platformRaw: RawResult[] = [];
  let reviewRaw: RawResult[] = [];
  let criticRaw: RawResult[] = [];
  let menuQuery = "";
  let platformQuery = "";
  let reviewQuery = "";
  let criticQuery = "";

  if (menuData.status === "fulfilled") {
    console.log(`[forkast:search] ✓ menu search   — ${menuData.value.text.length} chars`);
    sources.push(menuData.value.text);
    sourceUrl = menuData.value.topUrl;
    allSourceUrls.push(...(menuData.value.topUrl ? [menuData.value.topUrl] : []));
    menuRaw = menuData.value.rawResults;
    menuQuery = menuData.value.query;
  } else {
    console.log(`[forkast:search] ✗ menu search   — ${menuData.reason?.message ?? "failed"}`);
  }

  if (platformData.status === "fulfilled") {
    console.log(`[forkast:search] ✓ platform search — ${platformData.value.text.length} chars`);
    sources.push(platformData.value.text);
    allSourceUrls.push(...platformData.value.urls);
    platformRaw = platformData.value.rawResults;
    platformQuery = platformData.value.query;
  } else {
    console.log(`[forkast:search] ✗ platform search — ${(platformData.reason as Error)?.message ?? "failed"}`);
  }

  if (reviewData.status === "fulfilled") {
    console.log(`[forkast:search] ✓ review search  — ${reviewData.value.text.length} chars`);
    sources.push(reviewData.value.text);
    allSourceUrls.push(...reviewData.value.urls);
    reviewRaw = reviewData.value.rawResults;
    reviewQuery = reviewData.value.query;
  } else {
    console.log(`[forkast:search] ✗ review search  — ${(reviewData.reason as Error)?.message ?? "failed"}`);
  }

  if (criticData.status === "fulfilled") {
    console.log(`[forkast:search] ✓ critic search  — ${criticData.value.text.length} chars`);
    sources.push(criticData.value.text);
    allSourceUrls.push(...criticData.value.urls);
    criticRaw = criticData.value.rawResults;
    criticQuery = criticData.value.query;
  } else {
    console.log(`[forkast:search] ✗ critic search  — ${(criticData.reason as Error)?.message ?? "failed"}`);
  }

  console.log(`[forkast:search] ${sources.length}/4 searches succeeded in ${Date.now() - t0}ms`);

  if (sources.length === 0) {
    console.log(`[forkast:search] ✗ All searches failed — throwing not_found`);
    throw new Error("not_found");
  }

  // Domains known to return image-only, JS-rendered, auth walls, or off-topic pages.
  // zomato.com main pages return navigation boilerplate.
  // reddit.com always returns a logged-out auth wall — no actual review content reachable.
  const BLOCKED_DOMAINS = ["magicpin.in", "zomato.com", "instagram.com", "facebook.com", "reddit.com"];

  // Deduplicate across all 4 searches by URL. Also filter known content-free domains.
  const seenUrls = new Set<string>();
  const dedupedResults: RawResult[] = [];
  for (const r of [...menuRaw, ...platformRaw, ...reviewRaw, ...criticRaw]) {
    if (seenUrls.has(r.url)) continue;
    if (BLOCKED_DOMAINS.some((d) => r.url.includes(d))) continue;
    // Drop results whose content is mostly image placeholders
    const imagePlaceholderRatio = (r.content.match(/Food Menu \d|placeholder|image image/g) ?? []).length;
    if (imagePlaceholderRatio > 3) continue;
    seenUrls.add(r.url);
    dedupedResults.push(r);
  }
  const totalRaw = menuRaw.length + platformRaw.length + reviewRaw.length + criticRaw.length;
  console.log(`[forkast:search] ${dedupedResults.length} unique URLs after dedup (was ${totalRaw})`);

  const combinedContext = dedupedResults
    .map((r) => {
      const body = dedupeContent(r.content).slice(0, MAX_PER_RESULT_CHARS);
      return `${r.url}\n${body}`;
    })
    .join("\n\n---\n\n")
    .slice(0, MAX_MENU_CHARS + MAX_PLATFORM_CHARS + MAX_REVIEW_CHARS);
  // Partial if the 3 core searches (menu, platform, review) didn't all succeed.
  // Critic search is a bonus — its failure doesn't make the decode partial.
  const coreSucceeded = [menuData, platformData, reviewData].filter(r => r.status === "fulfilled").length;
  const isPartial = coreSucceeded < 3;
  const t1 = Date.now();

  const claudeUserMessage = `Decode the restaurant "${restaurantName}"${city ? ` in ${city}` : ""}. Input type: "name".\n\nThe following information was retrieved from ${sources.length} source(s) via web search:\n\n${combinedContext}\n\nApply the full rubric and return JSON only.`;

  appendDecodeLog({
    restaurantName,
    city,
    validationResults,
    menuResults: menuRaw,
    platformResults: platformRaw,
    reviewResults: reviewRaw,
    criticResults: criticRaw,
    combinedContext,
    claudeUserMessage,
    menuQuery,
    platformQuery,
    reviewQuery,
    criticQuery,
  });

  console.log(`[forkast:decode] Starting final decode (${combinedContext.length} chars of context, model: ${MODEL_DECODE})...`);

  const response = await anthropic.messages.create({
    model: MODEL_DECODE,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    system: [
      {
        type: "text",
        text: DECODE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Decode the restaurant "${restaurantName}"${city ? ` in ${city}` : ""}. Input type: "name".

The following information was retrieved from ${sources.length} source(s) via web search:

${combinedContext}

Apply the full rubric and return JSON only. Set meta.confidence based on source quality:
- "high" if you found the restaurant's own menu PDF or website with full dish list and prices
- "medium" if you found aggregator data (delivery platforms, review sites) with most dishes and some prices
- "low" if data is sparse, incomplete, or only review summaries without menu details`,
      },
    ],
  });

  logTokenCost("name-decode", response.usage, MODEL_DECODE);
  console.log(`[forkast:decode] ✓ Decode complete in ${Date.now() - t1}ms (total: ${Date.now() - t0}ms)`);

  const decode = parseDecodeResponse(response, "name");
  if (sourceUrl) decode.meta.sourceUrl = sourceUrl;
  if (allSourceUrls.length > 0) {
    // Deduplicate and log all aggregated sources
    decode.meta.sources = [...new Set(allSourceUrls)];
    console.log(`[forkast:decode] sources (${decode.meta.sources.length}): ${decode.meta.sources.join(", ")}`);
  }
  return { decode, partial: isPartial };
}

// ─── Restaurant validation ────────────────────────────────────────────────────

async function validateRestaurantExists(name: string, city?: string): Promise<RawResult[]> {
  const query = city ? `"${name}" restaurant ${city}` : `"${name}" restaurant`;
  const t = Date.now();
  console.log(`[forkast:validate] Checking existence: ${query}`);

  const result = await getTavily().search(query, {
    searchDepth: "basic",
    maxResults: 3,
    includeRawContent: false,
  });

  const rawResults: RawResult[] = result.results.map((r) => ({ title: r.title, url: r.url, content: r.content }));

  if (result.results.length === 0) {
    console.log(`[forkast:validate] ✗ No results — not_found (${Date.now() - t}ms)`);
    throw new Error("not_found");
  }

  const nameLower = name.toLowerCase();
  const nameWords = nameLower.split(/\s+/).filter((w) => w.length > 2);
  const cityLower = city?.toLowerCase() ?? "";

  const hasStrongMatch = result.results.some((r) => {
    const text = `${r.title} ${r.url} ${r.content}`.toLowerCase();
    const allNameWordsMatch = nameWords.every((w) => text.includes(w));
    const cityMatch = !cityLower || text.includes(cityLower);
    return allNameWordsMatch && cityMatch;
  });

  if (!hasStrongMatch) {
    const titlesFound = result.results.map((r) => r.title).join(" | ");
    console.log(`[forkast:validate] ✗ No result matched name+city. Titles: "${titlesFound}" — not_found (${Date.now() - t}ms)`);
    throw new Error("not_found");
  }

  const titlesFound = result.results.map((r) => r.title).join(" | ");
  console.log(`[forkast:validate] ✓ Confirmed — "${titlesFound}" (${Date.now() - t}ms)`);
  return rawResults;
}

// ─── Parallel search helpers (Tavily — <1s each vs Claude web_search's 35-40s) ─

async function searchForMenuData(location: string): Promise<{ text: string; topUrl: string | null; rawResults: RawResult[]; query: string }> {
  const t = Date.now();
  const query = `${location} restaurant full menu starters mains desserts prices`;
  console.log(`[forkast:search:menu] Starting...`);
  const result = await getTavily().search(
    query,
    { searchDepth: "advanced", maxResults: 3, includeRawContent: "text" }
  );
  const text = result.results
    .map((r) => {
      const body = dedupeContent(r.rawContent || r.content).slice(0, MAX_PER_RESULT_CHARS);
      return `${r.title}\n${r.url}\n${body}`;
    })
    .join("\n\n")
    .slice(0, MAX_MENU_CHARS);

  const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "tiktok.com", "twitter.com", "x.com", "youtube.com"];
  const topUrl = result.results.find(
    (r) => !SOCIAL_DOMAINS.some((d) => r.url.includes(d))
  )?.url ?? result.results[0]?.url ?? null;

  const rawResults: RawResult[] = result.results.map((r) => ({
    title: r.title,
    url: r.url,
    content: r.rawContent || r.content,
  }));
  console.log(`[forkast:search:menu] Done in ${Date.now() - t}ms (${text.length} chars, ${result.results.length} results, top: ${topUrl})`);
  return { text, topUrl, rawResults, query };
}

async function searchForPlatformData(location: string): Promise<{ text: string; urls: string[]; rawResults: RawResult[]; query: string }> {
  const t = Date.now();
  const query = `${location} restaurant menu Zomato Swiggy Yelp DoorDash dishes prices`;
  console.log(`[forkast:search:platform] Starting...`);
  const result = await getTavily().search(
    query,
    { searchDepth: "advanced", maxResults: 3, includeRawContent: "text" }
  );
  const text = result.results
    .map((r) => {
      const body = dedupeContent(r.rawContent || r.content).slice(0, MAX_PER_RESULT_CHARS);
      return `${r.title}\n${r.url}\n${body}`;
    })
    .join("\n\n")
    .slice(0, MAX_PLATFORM_CHARS);
  const urls = result.results.map((r) => r.url);
  const rawResults: RawResult[] = result.results.map((r) => ({
    title: r.title,
    url: r.url,
    content: r.rawContent || r.content,
  }));
  console.log(`[forkast:search:platform] Done in ${Date.now() - t}ms (${text.length} chars, ${result.results.length} results)`);
  return { text, urls, rawResults, query };
}

async function searchForReviewData(location: string): Promise<{ text: string; urls: string[]; rawResults: RawResult[]; query: string }> {
  const t = Date.now();
  const query = `${location} restaurant review what to order best dishes worth trying`;
  console.log(`[forkast:search:reviews] Starting...`);
  const result = await getTavily().search(
    query,
    { searchDepth: "advanced", maxResults: 5, includeRawContent: "text" }
  );
  const text = result.results
    .map((r) => {
      const body = dedupeContent(r.rawContent || r.content).slice(0, MAX_PER_RESULT_CHARS);
      return `${r.title}\n${r.url}\n${body}`;
    })
    .join("\n\n")
    .slice(0, MAX_REVIEW_CHARS);
  const urls = result.results.map((r) => r.url);
  const rawResults: RawResult[] = result.results.map((r) => ({ title: r.title, url: r.url, content: r.rawContent || r.content }));
  console.log(`[forkast:search:reviews] Done in ${Date.now() - t}ms (${text.length} chars, ${result.results.length} results)`);
  return { text, urls, rawResults, query };
}

async function searchForCriticData(location: string): Promise<{ text: string; urls: string[]; rawResults: RawResult[]; query: string }> {
  const t = Date.now();
  const query = `${location} restaurant disappointing overrated skip not worth ordering`;
  console.log(`[forkast:search:critic] Starting...`);
  const result = await getTavily().search(
    query,
    { searchDepth: "basic", maxResults: 3, includeRawContent: false }
  );
  const text = result.results
    .map((r) => {
      const body = dedupeContent(r.content).slice(0, MAX_PER_RESULT_CHARS);
      return `${r.title}\n${r.url}\n${body}`;
    })
    .join("\n\n")
    .slice(0, 3000);
  const urls = result.results.map((r) => r.url);
  const rawResults: RawResult[] = result.results.map((r) => ({ title: r.title, url: r.url, content: r.content }));
  console.log(`[forkast:search:critic] Done in ${Date.now() - t}ms (${text.length} chars, ${result.results.length} results)`);
  return { text, urls, rawResults, query };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractTextFromResponse(response: Anthropic.Message): string {
  const textBlocks = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text);
  return textBlocks.join("\n");
}

function parseDecodeResponse(
  response: Anthropic.Message,
  inputType: InputType
): DecodeOutput {
  const text = extractTextFromResponse(response);
  if (!text) throw new Error("Empty response from Claude");

  // Strip any accidental markdown fences
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: DecodeOutput;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON from the response if wrapped in text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No valid JSON in decode response");
    parsed = JSON.parse(match[0]);
  }

  // Ensure inputType is correct (model may hallucinate this)
  parsed.meta.inputType = inputType;
  if (!parsed.meta.decodeTimestamp) {
    parsed.meta.decodeTimestamp = new Date().toISOString();
  }

  return parsed;
}

function detectMediaType(
  b64: string
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  // Detect from base64 header bytes
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("iVBORw0KGgo")) return "image/png";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg"; // default
}

// Haiku 4.5 pricing per million tokens (update if Anthropic changes rates)
const PRICING = {
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00, cacheWrite: 1.00, cacheRead: 0.08 },
};

function logTokenCost(label: string, usage: Anthropic.Usage, model: string) {
  const rates = PRICING[model as keyof typeof PRICING];
  if (!rates) return;

  const inputTokens  = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const u = usage as unknown as Record<string, number>;
  const cacheWrite   = u.cache_creation_input_tokens ?? 0;
  const cacheRead    = u.cache_read_input_tokens ?? 0;

  const cost =
    (inputTokens  / 1_000_000) * rates.input +
    (outputTokens / 1_000_000) * rates.output +
    (cacheWrite   / 1_000_000) * rates.cacheWrite +
    (cacheRead    / 1_000_000) * rates.cacheRead;

  console.log(
    `[forkast:cost:${label}] in=${inputTokens} out=${outputTokens} cache_write=${cacheWrite} cache_read=${cacheRead} → $${cost.toFixed(5)}`
  );
}

export { DECODE_SYSTEM_PROMPT };
