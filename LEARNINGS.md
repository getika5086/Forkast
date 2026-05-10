# Forkast — Build Learnings

A running log of problems encountered, what we learned from them, and how we fixed them. Organised by category.

---

## 1. Web Search & Data Quality

### Tavily returns snippets by default, not full page content
**Problem:** Initial results were 200–500 character snippets — not enough to identify specific dishes, prices, or review opinions.  
**Learning:** Tavily's default mode is optimised for quick factual answers, not content extraction. Full text requires an explicit flag.  
**Fix:** Added `includeRawContent: "text"` to all menu, platform, and review searches. Critic search (Search D) intentionally keeps `includeRawContent: false` since it only needs snippet-level signals and saves a fraction of cost.

---

### The same blog appeared in all 3 searches — sent to Claude 3 times
**Problem:** A single food blog (meinblogland.blogspot.com) ranked #1 in all three parallel searches. Claude received identical content three times, wasting ~3,600 characters of context budget.  
**Learning:** When searching for the same restaurant across different query intents, popular well-indexed pages appear in every search regardless of query framing.  
**Fix:** Cross-search URL deduplication using a `Set<string>`. Results from all 4 searches are merged and deduplicated before anything is sent to Claude.

---

### A single page's footer was repeated 4+ times within its own content
**Problem:** Some sites (particularly Indian restaurant blogs) render the same nav/footer block multiple times in their HTML for responsive layout. Raw content extraction returned the same 300-character block 4–5 times consecutively.  
**Learning:** `includeRawContent` returns what the crawler sees, not what a human reads. Responsive sites duplicate structural content at the HTML level.  
**Fix:** `dedupeContent()` function — splits content into paragraph blocks, removes exact duplicates, rejoins. Runs on every result before the per-result character cap is applied.

---

### Magicpin returned image-only pages with no dish text
**Problem:** Magicpin ranked highly for Indian restaurant menu queries but its pages consist almost entirely of strings like "Burma Burma Food Menu 1, Food Menu 2, Food Menu 3" — image placeholders with no actual dish data.  
**Learning:** Certain restaurant listing sites index images only, not menu text. They rank well in search but return zero useful content.  
**Fix:** Two-layer defence: (1) `magicpin.in` added to `BLOCKED_DOMAINS`, (2) an image-placeholder ratio check — if a result contains more than 3 instances of `"Food Menu \d"`, `"placeholder"`, or `"image image"` it is dropped regardless of domain.

---

### Zomato's main restaurant page is mostly navigation boilerplate
**Problem:** Zomato ranked for nearly every Indian restaurant query. Its main restaurant page (`zomato.com/city/restaurant-name`) returns ~1,000 characters of navigation links, promotional banners, and bank offer text before delivering 6 dish names under "Review Highlights".  
**Learning:** Platform listing pages are designed for human browsing, not programmatic text extraction. The useful content (dish mentions) is a tiny fraction of the page weight.  
**Fix:** Added `zomato.com` to `BLOCKED_DOMAINS`. The 6 dish names it delivered were already covered by Swiggy dineout pages and food blogs with far less noise.

---

### Swiggy delivery pages are JS-rendered; dineout pages are not
**Problem:** Initial block of `swiggy.com` removed all Swiggy results — but the Swiggy *dineout* URL (`swiggy.com/restaurants/.../dineout`) was actually returning excellent structured data: "Popular dishes: Burmese Khowsuey, Tea Leaf Salad, Samuza Hincho".  
**Learning:** Not all pages on a domain are equivalent. Swiggy's delivery pages require JavaScript to render; their dineout pages are server-rendered and indexable.  
**Fix:** Removed Swiggy from the blocklist entirely. Delivery pages return empty/sparse content and are naturally filtered by the image-placeholder and dedup checks.

---

### Instagram and Facebook return wrong-restaurant results or zero text
**Problem:** An Instagram reel for "The Fancy Dosa House" in *Toronto* appeared in results for "Dosa House, Seattle". Facebook pages return minimal text content.  
**Learning:** Social media pages are indexed by restaurant name, not geography. A negative query ("disappointing", "skip") combined with a restaurant name pulls results from any restaurant with a similar name globally.  
**Fix:** Added `instagram.com` and `facebook.com` to `BLOCKED_DOMAINS`.

---

### Reddit always returns a logged-out authentication wall
**Problem:** Reddit ranked consistently for review queries but the scraped content was entirely the logged-out screen: "Log in to Reddit / Continue with Email / Continue with Phone Number" — 1,800 characters of boilerplate with zero restaurant content.  
**Learning:** Reddit requires a session to render thread content. Tavily's crawler hits the auth wall and returns it verbatim.  
**Fix:** Added `reddit.com` to `BLOCKED_DOMAINS`.

---

### Indian restaurant platforms: Yelp and DoorDash don't cover India
**Problem:** Search B ("platform data") was querying for Yelp and DoorDash. For restaurants in India, neither platform has listings — results drifted to wrong restaurants or returned empty.  
**Learning:** Platform coverage is geography-dependent. Yelp/DoorDash are US/UK-centric. India's dominant platforms are Zomato and Swiggy.  
**Fix:** Updated Search B query to include Zomato and Swiggy alongside Yelp and DoorDash.

---

### One result eating the entire context budget
**Problem:** A single verbose blog post could consume the full ~9,000 character context window, leaving nothing for menu data or other review sources.  
**Learning:** Without a per-result cap, the most verbose source always wins regardless of usefulness.  
**Fix:** `MAX_PER_RESULT_CHARS = 1800` — each result is truncated before being added to the combined context. This enforces source diversity regardless of individual page length.

---

### The avoid list was being invented from general food knowledge
**Problem:** When review sources had no explicit negative signals (which is most of the time — people write more positive than negative reviews), Claude filled the avoid list using general culinary assumptions. Items appeared that had no basis in the data provided.  
**Learning:** LLMs will fill gaps with plausible-sounding outputs. Without explicit grounding rules, the avoid list looked authoritative but was essentially fabricated.  
**Fix:** Two changes: (1) Added a grounding rule to the system prompt — every avoid item must cite either a price signal from the menu data or an explicit negative mention from a review source. (2) Added Search D — a dedicated search for negative signals using a query targeting "disappointing, overrated, skip, not worth ordering" language, which surfaces Yelp critical reviews, TripAdvisor complaints, and Reddit/blog warnings.

---

## 2. Caching

### Cache was never hitting despite correct data in Supabase
**Problem:** Cache lookups were returning null even for restaurants that had been decoded before. Supabase had rows for "Burma Burma" but searches for "burma burma" found nothing.  
**Learning:** The cache key was being stored using Claude's cleaned/formatted restaurant name (e.g. "The French Laundry") but lookups were done with the user's raw typed input ("french laundry"). Even with `ILIKE` case-insensitive matching, "french laundry" ≠ "The French Laundry".  
**Fix:** Store the user's original typed input as `restaurant_name` in Supabase (the cache key), not Claude's interpreted name.

---

### Cache was only eligible for "high" confidence decodes
**Problem:** Cache lookups filtered for `confidence = "high"` only. Most Indian restaurant decodes return "medium" confidence (aggregator data, not the restaurant's own menu site). Effectively no Indian restaurant was ever served from cache.  
**Learning:** Confidence levels reflect source quality, not decode accuracy. A "medium" decode is still a valid, useful result worth caching.  
**Fix:** Updated cache eligibility to `confidence IN ('high', 'medium')`. "Low" confidence decodes (sparse data, review mentions only) remain excluded since their quality doesn't justify serving to a second user.

---

### No visible signal to the user that a result came from cache
**Problem:** Cache hits returned instantly but the UI showed nothing different. Users had no way to know they were seeing a cached result vs a live one, and we had no way to confirm in testing that cache was actually working.  
**Learning:** Operational observability matters for both users and developers. A feature that works invisibly is hard to trust and debug.  
**Fix:** (1) `⚡ Instant` pill displayed on the result page when `?cached=1` is in the URL. (2) `decode_cache_hit` event logged to analytics so cache hit rate is visible in the admin dashboard.

---

## 3. Claude / AI Behaviour

### `includeRawContent: true` caused a TypeScript error
**Problem:** Passing `includeRawContent: true` (boolean) to the Tavily SDK threw a TypeScript type error at compile time.  
**Learning:** The Tavily SDK types this parameter as `"text" | "markdown" | false`, not `boolean`. The JavaScript value `true` is not a valid option.  
**Fix:** Changed to `includeRawContent: "text"`.

---

### Claude was cleaning restaurant names before using them as output
**Problem:** Claude would receive "burma burma" and return `restaurant.name: "Burma Burma"`. This is correct behaviour for display — but when we used `decode.restaurant.name` as the Supabase cache key, it created a mismatch with the user's typed input.  
**Learning:** AI models normalise and clean inputs as part of their natural language processing. Don't use AI output fields as database keys if the key needs to match user input.  
**Fix:** Cache key = user's typed input. Claude's cleaned name = display only.

---

### System prompt accuracy rules required multiple iterations
**Problem:** Early Claude outputs contained psychology observations that referenced currency symbols incorrectly (e.g. "no currency symbols" when some prices did have $ signs) and avoid items that didn't exist in the provided data.  
**Learning:** Claude follows the instruction style, not just the instruction content. Vague rules ("be accurate") produce vague results. Specific, falsifiable rules ("if SOME prices have $ and others do not, describe the specific pattern") produce specific, verifiable outputs.  
**Fix:** Added explicit accuracy rules to the system prompt for psychology observations; added the grounding rule for avoid items; refined the value score rubric with named anchor points.

---

## 4. Frontend & Next.js

### Stale webpack cache caused a cryptic runtime error after adding new client components
**Problem:** After adding `DecodeActions.tsx` and `PageViewTracker.tsx` mid-session, the app threw `Runtime TypeError: Cannot read properties of undefined (reading 'call')`. No code change was obviously responsible.  
**Learning:** Next.js 15's webpack cache in `.next/` can become stale when new client component files are added during a running dev session. The cached module graph references a file that didn't exist when the cache was built.  
**Fix:** `rm -rf .next && npm run dev`. Clears the webpack cache and forces a clean rebuild.

---

### `searchParams` in Next.js 15 App Router is a Promise
**Problem:** Accessing `searchParams.cached` directly caused a type error and potentially a runtime warning about accessing sync params.  
**Learning:** Next.js 15 made `searchParams` (and `params`) asynchronous Promises in server components to support the streaming model. Directly destructuring them as objects is not valid.  
**Fix:** `const { cached } = await searchParams` — always `await` searchParams in Next.js 15 App Router server components.

---

## 5. Debugging & Observability

### No visibility into what data was actually being sent to Claude
**Problem:** The app produced decode results but there was no way to inspect what the 3 searches had returned, what got filtered, what got deduplicated, and what exact text was passed to Claude. Diagnosing quality issues required guesswork.  
**Learning:** For a pipeline that ingests external web content and passes it to an LLM, visibility into the full data flow is essential during development. "It produced a result" is not the same as "it produced a result from good inputs."  
**Fix:** Created `lib/debugLog.ts` — appends a structured entry to `decode-debug.log` for every decode. Logs all 4 search queries, raw results per search, the combined context after filtering, and the exact Claude user message. Disabled on Vercel (`NODE_ENV === "development" && !VERCEL`). File is in `.gitignore`.

---

### Debug log showed misleading hardcoded query labels
**Problem:** The log was showing template string labels for queries (e.g. "restaurant Yelp DoorDash menu items") even after the actual Tavily queries had been updated to new wording. The labels were hardcoded in `debugLog.ts`, not pulled from the actual query strings.  
**Learning:** Debug logs that lie are worse than no debug logs — they create false confidence in what the code is doing.  
**Fix:** Each search function now returns its query string alongside results. The actual query string is passed to `appendDecodeLog()` and displayed in the log.

---

## 6. Analytics & Metrics

### Analytics table was hard to read with too many columns and raw event rows
**Problem:** The initial admin dashboard showed raw event data in a dense table with many columns. Understanding the overall health of the product required mentally parsing individual rows.  
**Learning:** Operational dashboards should aggregate, not dump. Raw event tables belong in Supabase; the dashboard should show derived metrics at a glance.  
**Fix:** Rebuilt the admin page as a single clean metrics table — one row per metric, computed from aggregated event data. Rows: total searches, unique sessions, success rate, cache hit rate, average decode latency, error breakdown, page views, share clicks, thumbs up/down.

---

## 7. Product Decisions

### The source URL was showing social media links
**Problem:** The result page showed a source link (e.g. "↗ instagram.com") when Instagram ranked #1 in Search A. This gave the impression the whole decode was based on a single social post.  
**Learning:** The "top URL" logic needs to reflect credibility, not just search rank. Social media links undermine user trust in the result.  
**Fix:** Added a social domain filter to the `topUrl` selection — skips `instagram.com`, `facebook.com`, `tiktok.com`, `twitter.com`, `x.com`, `youtube.com` when picking the display source URL.

---

### Caching speeds up results significantly but needed UX acknowledgement
**Problem:** Cache hits returned in under 500ms vs 8–12 seconds for a live decode. Without any UI signal, users had no way to understand the quality difference (cached result is up to 7 days old) or appreciate the speed.  
**Learning:** Speed improvements that are invisible feel unreliable. Users interpret "instant" as "did it even search?" without context.  
**Fix:** `⚡ Instant` pill on the result page header when served from cache. Only shown on the top action bar (not the bottom one) to keep it contextual.
