# Forkast — Architecture

## What it is

Forkast is an AI-powered restaurant menu decoder. A user types a restaurant name and city; the app runs web searches, assembles a context block, and sends it to Claude which returns structured JSON — 3 dishes to order, 3 to avoid, menu psychology observations, and a value score.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) |
| Hosting | Vercel |
| Database | Supabase (PostgreSQL) |
| AI model | Claude Haiku (`claude-haiku-4-5-20251001`) |
| Web search | Tavily API |
| Styling | Tailwind CSS |
| Language | TypeScript |

---

## High-level request flow

```
User types restaurant name + city
        │
        ▼
POST /api/decode/search
        │
        ├─ 1. Cache lookup (Supabase)
        │       └─ HIT → return cached decode immediately
        │
        └─ MISS → decodeFromName() in lib/claude.ts
                │
                ├─ Step 1: Validation search (1 Tavily credit)
                │          Confirms restaurant exists before spending credits
                │
                ├─ Step 2: 4 parallel web searches (4 Tavily credits)
                │          A — Menu data      (advanced, 3 results, raw content)
                │          B — Platform data  (advanced, 3 results, raw content)
                │          C — Review data    (advanced, 5 results, raw content)
                │          D — Critic data    (basic,    3 results, no raw content)
                │
                ├─ Step 3: Dedup + filter
                │          - Remove duplicate URLs across all 4 searches
                │          - Block known low-quality domains
                │          - Drop image-placeholder content
                │          - Cap each result at 1,800 chars
                │
                ├─ Step 4: Claude decode
                │          ~9,000 chars of context → structured JSON
                │
                └─ Step 5: Store in Supabase, redirect to /decode/[id]
```

---

## Directory structure

```
app/
  page.tsx                    Home page — name/city search form
  layout.tsx                  Root layout — header, footer, disclaimer
  admin/page.tsx              Internal analytics dashboard
  decode/[decodeId]/
    page.tsx                  Restaurant result page
    not-found.tsx             404 for expired/invalid decode IDs
  card/[decodeId]/page.tsx    OG card for social sharing
  api/
    decode/route.ts           POST — image/screenshot decode
    decode/search/route.ts    POST — name search decode (main flow)
    decode/[decodeId]/route.ts  GET — fetch a stored decode
    events/route.ts           POST — analytics event logging
    card/[decodeId]/route.ts  GET — OG image generation

components/
  NameSearch.tsx              Search form (client component)
  ImageUpload.tsx             Photo/screenshot upload
  DecodeOutput.tsx            Full result display — picks, avoids, psychology
  DecodeActions.tsx           Share button + thumbs up/down (client component)
  PageViewTracker.tsx         Fires decode_url_viewed event on mount
  ProgressIndicator.tsx       Animated loading state during decode
  ErrorState.tsx              Not found / error display
  ShareSection.tsx            Share UI

lib/
  claude.ts                   Core AI pipeline — searches + Claude call
  supabase.ts                 All database operations
  types.ts                    Shared TypeScript interfaces
  debugLog.ts                 Dev-only log writer (never runs on Vercel)
  utils.ts                    Shared helpers
```

---

## The 4 web searches

Each fires in parallel. Total added latency vs a single search: ~0ms.

| Search | Query pattern | Depth | Results | Raw content | Purpose |
|--------|--------------|-------|---------|-------------|---------|
| A — Menu | `{name} {city} restaurant full menu starters mains desserts prices` | advanced | 3 | yes | Dish names + prices |
| B — Platform | `{name} {city} restaurant menu Zomato Swiggy Yelp DoorDash dishes prices` | advanced | 3 | yes | Aggregator listings |
| C — Review | `{name} {city} restaurant review what to order best dishes worth trying` | advanced | 5 | yes | Positive signals for top picks |
| D — Critic | `{name} {city} restaurant disappointing overrated skip not worth ordering` | basic | 3 | no | Negative signals for avoid list |

### Content filtering applied after all 4 searches

- **URL deduplication** — same URL appearing in multiple searches is only sent to Claude once
- **Blocked domains** — `magicpin.in` (image placeholders), `zomato.com` (nav boilerplate), `instagram.com`, `facebook.com` (wrong-restaurant results), `reddit.com` (auth wall)
- **Image placeholder filter** — drops results whose content is mostly `"Food Menu 1 / Food Menu 2"` strings
- **Per-result cap** — each result truncated at 1,800 chars so one page can't eat the whole token budget
- **Paragraph dedup** — within a single result, repeated blocks (nav/footer rendered multiple times for responsive layouts) are removed

---

## Claude prompt design

**Model:** `claude-haiku-4-5-20251001`  
**Temperature:** `0` — deterministic, same input always produces same output  
**Max tokens:** `8,192`  
**Prompt caching:** system prompt marked `cache_control: ephemeral`

### Avoid list grounding rule (added to system prompt)

Every avoid item must be justified by either:
- **(a)** a concrete price signal from the menu data (e.g. dish X costs 30%+ more than comparable items in the same section), or
- **(b)** an explicit negative signal from a review source in the provided data

Claude is explicitly instructed not to use general culinary knowledge to invent avoid items.

### Output schema

```typescript
{
  restaurant: { name, city, cuisine, priceRange },
  meta: { inputType, confidence, dishesAnalysed, currency, decodeTimestamp },
  verdict: { score, summary },          // score: 1.0–10.0
  topPicks: DishPick[],                 // exactly 3
  avoid: DishAvoid[],                   // exactly 3
  psychology: { title, explanation }[]  // exactly 2
}
```

Two fields are injected server-side after Claude returns (not set by Claude):
- `meta.sourceUrl` — top non-social URL from Search A (shown as a link on the result page)
- `meta.sources` — all URLs across all 4 searches, stored in Supabase

---

## Decode cache

- **Cache key:** user's typed input (restaurant name + city), matched case-insensitively via `ILIKE`
- **Cache eligibility:** `confidence IN ('high', 'medium')` AND `partial = false`
- **TTL:** 7 days — checked via both `expires_at` column and `created_at > now - 7d`
- **Cache hit:** skips all Tavily and Claude API calls; costs $0.000 vs ~$0.011 for a fresh decode
- **UI indicator:** `⚡ Instant` pill shown when result came from cache

---

## Supabase schema

### `decodes` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key, auto-generated |
| `created_at` | timestamptz | Auto-set |
| `expires_at` | timestamptz | Set at insert time (7 days out) |
| `input_type` | text | `photo`, `screenshot`, or `name` |
| `restaurant_name` | text | User's typed input (cache key) |
| `restaurant_city` | text | User's typed city |
| `confidence` | text | `high`, `medium`, or `low` |
| `decode_output` | jsonb | Full Claude output + injected fields |
| `partial` | boolean | True if fewer than 3 searches succeeded |

### `decode_events` table

Append-only analytics log. One row per user action.

| Event type | When it fires |
|-----------|--------------|
| `decode_started` | Search form submitted |
| `decode_success` | Claude returned valid JSON |
| `decode_failed` | Error (not_found, timeout, parse fail) |
| `decode_partial` | Decode succeeded but <3 searches returned data |
| `decode_cache_hit` | Result served from cache |
| `decode_url_viewed` | Someone opened a `/decode/[id]` URL |
| `share_copied` | Share button clicked (URL copied to clipboard) |
| `thumbs_up` / `thumbs_down` | User feedback on result quality |

---

## Cost per decode

| Item | Cost |
|------|------|
| Validation search (1 Tavily credit) | ~$0.001 |
| 4 parallel searches (4 Tavily credits) | ~$0.004 |
| Claude Haiku (~3k input + ~800 output tokens) | ~$0.006 |
| **Total per fresh decode** | **~$0.011** |
| Cache hit (0 API calls, 1 Supabase read) | **$0.000** |

---

## Environment variables

| Variable | Used by | Notes |
|----------|---------|-------|
| `ANTHROPIC_API_KEY` | `lib/claude.ts` | Claude API |
| `TAVILY_API_KEY` | `lib/claude.ts` | Web search |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase.ts` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase.ts` | Public read client |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase.ts` | Admin writes (inserts, analytics) |

---

## Dev-only debug logging

`lib/debugLog.ts` writes to `decode-debug.log` at the project root during local development. It logs:
- All 4 search queries and their raw Tavily results
- The exact combined context sent to Claude
- The Claude user message

This file is **never written on Vercel** (`ENABLED = NODE_ENV === "development" && !VERCEL`) and is listed in `.gitignore`.
