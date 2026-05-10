# Forkast — Product Requirements Document
**Version:** 1.1 · **Status:** Engineering Review Complete  
**Author:** Gem (PM) · **Engineering Review:** Senior Engineering Lead  
**Date:** May 2025  
**Platform:** Web App (Next.js + Vercel) · **Monetisation:** Free at launch · **Auth:** Fully anonymous

---

## Changelog — v1.0 → v1.1

| # | Change | Reason |
|---|---|---|
| 1 | Removed rate limiting entirely | Product decision: no session or user throttling at launch |
| 2 | Added Section 11.7 — API cost management strategy (replaces rate limiting) | Rate limiting removed but cost risk remains; needs a different mitigation strategy |
| 3 | Added Section 11.8 — Error handling & fallback states | Entirely missing from v1.0; critical for production readiness |
| 4 | Added Section 11.9 — Environment configuration | Missing from v1.0; needed before any dev work begins |
| 5 | Added Section 11.10 — Security considerations | Missing from v1.0; image uploads + API keys + public URLs require explicit treatment |
| 6 | Added Section 11.11 — Decode JSON schema (full) | v1.0 referenced the schema but never defined it; blocks prompt engineering and frontend work |
| 7 | Added Section 11.12 — Vercel deployment configuration | Missing; needed for correct serverless function behaviour given long decode times |
| 8 | Expanded Supabase schema — added `decodes` table alongside `decode_events` | v1.0 only had an events table; decode payload storage schema was undefined |
| 9 | Corrected image file size limit — set explicit 10MB cap with client-side enforcement | Was an open question; now resolved |
| 10 | Corrected card generation approach — defaulted to server-side from day one | html2canvas is unreliable on mobile Safari; Puppeteer is the right default, not the fallback |
| 11 | Corrected web search parallelisation — specified as required, not optional | 20s latency target is only achievable with parallel searches; this is an architectural decision, not a nice-to-have |
| 12 | Corrected multi-image approach — specified as single API call with all images | Sequential calls with context chaining adds latency and complexity with no meaningful quality gain for menus |
| 13 | Corrected decode URL expiry — specified Supabase scheduled job (pg_cron) over row TTL | Postgres has no native row TTL; this was architecturally incorrect in v1.0 |
| 14 | Renamed persona "The Curious Non-Indian / First-Timer" | Original name was too narrow; Forkast is global and the persona applies to any unfamiliar cuisine |
| 15 | Updated open questions — resolved 5 of 7, removed rate limit question, added 3 new ones | |
| 16 | Added missing API route definitions to architecture section | Frontend team needs explicit route contract before building |
| 17 | Added decode timeout handling | Long-running name searches can exceed Vercel's default function timeout; needs explicit handling |

---

## 1. Executive Summary

Forkast is an AI-powered web app that decodes restaurant menus and tells users exactly what to order, what to skip, and why — in plain language.

It works across three input types:
- A **photo** taken at the table
- A **screenshot or image** of an online menu (Zomato, Swiggy, DoorDash, Yelp, restaurant website)
- The **name of a restaurant** — Forkast finds the menu itself via live web search

Menus are written to sell, not to inform. Forkast reverses that — giving diners the insider knowledge that previously only frequent visitors or food critics possessed. The output is shareable: a visual recommendation card and a copy-paste text block for group chats.

---

## 2. Problem Statement

### 2.1 The core problem
Every restaurant visit involves a decision made with incomplete information under time pressure. A menu gives you dish names and prices — but withholds what you actually need: which items reflect the kitchen's real strength, which are high-margin fillers, what the pricing psychology is, and what regulars always order.

### 2.2 Why existing alternatives fall short

| Alternative | Why it fails |
|---|---|
| Yelp / Google Reviews | Aggregate sentiment only — doesn't tell you which specific dish to order |
| Asking the waiter | Incentivised toward high-margin or slow-moving inventory |
| ChatGPT | Can't read a photo of tonight's actual menu; no structured dish-level output |
| Food blogs | Exist only for popular restaurants; often months old; menus change |

### 2.3 The gap Forkast fills
No product today can take a photo of a menu — or the name of a restaurant — and return a structured, dish-level decode with ordering intelligence, menu psychology insights, and a shareable recommendation card. That is the gap.

---

## 3. Goals

### 3.1 Product goals
- Enable anyone, anywhere to get instant ordering intelligence for any restaurant globally
- Make the output shareable — visual card for social, text block for group chats, link for full decode
- Build audience through organic sharing, not paid acquisition
- Become the default tool people reach for before or during a restaurant visit

### 3.2 Metrics
All metrics tracked via Supabase. No frontend analytics SDK required at launch.

**Captured per session:**
- Input type used (`photo` / `screenshot` / `name`)
- Restaurant name and location (when provided or inferred)
- Success or failure of menu retrieval
- Confidence level of decode (`high` / `medium` / `low`)
- Whether a share card was downloaded
- Whether the share text was copied
- Whether the persistent decode URL was accessed by a different session (shared link clicked)
- Decode latency in milliseconds (by input type)
- Error type if decode failed (image parse failure / no menu found / API timeout)
- Session count and return session detection via anonymous cookie

### 3.3 Non-goals for v1
- User accounts, login, or saved history
- Dietary filters (vegan, halal, allergens) — v2
- Restaurant discovery or "near me" search
- Reservation or ordering integrations
- Monetisation or advertising
- Native iOS / Android apps
- Multi-language output
- Rate limiting of any kind — no per-session or per-user throttling

---

## 4. User Personas

### The Diaspora Diner
Sitting at a restaurant they know well but wants to validate instincts and surface what they've been missing. Likely uploads a photo at the table or searches by restaurant name.

### The First-Timer at an Unfamiliar Cuisine
Overwhelmed by an unfamiliar menu — could be any cuisine they haven't encountered before. Needs a confident, plain-English entry point. Likely uploads a screenshot from Zomato or Google Maps before arriving.

### The Pre-Trip Planner
Debating whether a restaurant is worth visiting based on Instagram or a friend's recommendation. Types the restaurant name, wants a verdict before committing.

### The Group Organiser
Has already picked the restaurant. Wants to share the decode with the group WhatsApp before dinner so everyone knows what to order. Primary user of the share link feature.

---

## 5. Input Methods

All three input types feed the same decode engine. The input method changes how menu data is acquired, not how it is analysed.

### 5.1 Photo upload — at the table
User takes a photo of the physical menu and uploads it.

- **Accepted formats:** JPG, PNG, HEIC, WebP
- **File size limit:** 10MB per image, enforced client-side before upload begins
- **Multi-page menus:** up to 4 images per session, sent as a single API call
- **Processing:** Claude Vision reads the image, extracts text, prices, section headers, dish descriptions
- **UX constraint:** flow must be optimised for one-handed mobile use — tap to upload, no multi-step flows
- **Target time from upload to output:** under 12 seconds (revised from 10s to account for realistic Vision + decode latency)
- **Low-quality image handling:** if Claude Vision returns low-confidence extraction (fewer than 5 dishes identified), prompt user to retake and offer restaurant name input as fallback

### 5.2 Screenshot upload — from online menu
User screenshots a menu from Zomato, Swiggy, DoorDash, Yelp, or a restaurant website and uploads the image.

- Same file format and size limits as photo upload
- Online menu screenshots are typically cleaner input — no glare, consistent typography
- This method bypasses the JavaScript-rendering problem that prevents direct URL fetching from Zomato/Swiggy/DoorDash
- Works on both mobile and desktop (user may have menu open in another tab)
- **Target time from upload to output:** under 12 seconds

### 5.3 Restaurant name — research mode
User types the restaurant name. Forkast performs a live web search to retrieve the current menu, prices, and reviews, then decodes.

- Live web search always performed — no caching, no stale data
- **Web searches run in parallel** (3 simultaneous searches) to hit the latency target — this is architectural, not optional
- System triangulates from multiple sources: restaurant website, delivery platforms, review aggregators, food blogs
- A confidence indicator is shown on output: **High** (menu PDF or restaurant's own site) / **Medium** (aggregator data) / **Low** (limited public data)
- If the restaurant name is ambiguous, prompt for city before searching
- **Target time from name submit to output:** under 20 seconds
- **Timeout handling:** if searches + decode exceed 25 seconds, return a partial decode with whatever was retrieved and flag it clearly to the user
- UI must show a three-stage progress indicator: *Finding the menu → Reading reviews → Decoding*

---

## 6. Decode Engine — Output Specification

The decode engine produces a structured analysis across five dimensions. Tone is **balanced and informative** — like advice from a knowledgeable friend, not a food critic. Output is always in English regardless of menu language.

### 6.1 Overall verdict
- A value score (1–10) reflecting quality-to-price ratio for this restaurant's category and geography
- One plain-language verdict sentence: the single most important thing to know about this menu
- Number of dishes analysed

### 6.2 Dish-level breakdown
Every dish (or a representative subset for menus >40 items — take the most strategically important ones, not a random sample) is classified into one of five tiers:

| Badge | Label | Meaning |
|---|---|---|
| 🟢 | Order this | High value, kitchen's strength, well-reviewed |
| 💎 | Hidden gem | Underordered; exceptional quality-to-price ratio |
| 🟡 | Worth knowing | Contextual insight; order with awareness |
| 🟠 | Know before you order | Needs explanation; not bad, just misunderstood |
| 🔴 | Skip | Poor value, not the kitchen's strength, available better elsewhere |

Each dish entry includes: name, price, badge, 2–3 sentence insight, relevant tags.

**Valid tags:** `Most reviewed` · `High-margin item` · `Seasonal` · `Technique-driven` · `Chef's signature` · `Underordered` · `Tourist trap` · `Best value` · `Authentic preparation` · `Portion warning`

### 6.3 Menu psychology layer
2–4 specific observations about psychological or business tactics visible in this menu's design. Must be grounded in what is actually visible — not generic copy-pasted observations. Examples:
- Anchor pricing (a decoy high-price item making everything else feel cheaper)
- Absence of currency symbols (documented to increase average spend 8–12%)
- Strategic placement (high-margin items in top-right — the first place the eye lands)
- Vague vs. specific descriptions as a kitchen confidence signal

### 6.4 Optimal order guide
A numbered, specific sequence of what to order for a party of 2. Format: start → share → main → dessert → skip. This is the most shareable section — specific, actionable, immediately usable.

### 6.5 Insider tips
2–3 contextual insights beyond the menu itself: happy hour pricing, seasonal availability, portion size warnings, best day to visit, off-menu asks. For name input: sourced from reviews. For image input: inferred from menu signals.

---

## 7. Decode JSON Schema

The following schema is the contract between the Claude API response, the Supabase storage layer, and the frontend render. All three must agree on this shape. Any change to this schema is a breaking change requiring coordinated update across all three.

```typescript
interface DecodeOutput {
  restaurant: {
    name: string;
    city: string | null;
    cuisine: string;
    priceRange: "budget" | "mid" | "upscale" | "fine-dining";
  };
  meta: {
    inputType: "photo" | "screenshot" | "name";
    confidence: "high" | "medium" | "low";
    dishesAnalysed: number;
    currency: string;           // ISO 4217 code e.g. "USD", "INR"
    decodeTimestamp: string;    // ISO 8601
  };
  verdict: {
    score: number;              // 1.0–10.0, one decimal place
    summary: string;            // single sentence, max 200 chars
  };
  dishes: Array<{
    name: string;
    price: number | null;       // null if price not found on menu
    priceDisplay: string | null; // formatted string e.g. "₹1,900" or "$18.99"
    badge: "order" | "gem" | "aware" | "caution" | "skip";
    insight: string;            // 2–3 sentences
    tags: string[];
  }>;
  psychology: Array<{
    title: string;
    explanation: string;        // 2–4 sentences
  }>;
  orderGuide: Array<{
    step: number;
    action: string;             // e.g. "Start with", "Share as main", "Skip"
    dish: string;
    reason: string;             // one sentence
  }>;
  tips: Array<{
    tip: string;                // one sentence, max 160 chars
  }>;
}
```

---

## 8. Shareable Output

### 8.1 Recommendation card
A downloadable PNG image (1080 × 1350px, 4:5 ratio — optimised for Instagram Stories, WhatsApp, iMessage) containing:
- Restaurant name + overall value score
- Top 3 dishes to order (name + one-line reason each)
- Top 1–2 dishes to skip
- One insider tip
- Forkast branding and URL in the footer

**Card generation:** Server-side via Puppeteer on a Vercel serverless function. The card is rendered as a Next.js page at `/card/[decodeId]` and screenshotted by Puppeteer. This is the default approach — html2canvas is not used. Reason: html2canvas is unreliable on mobile Safari and produces inconsistent results across devices. Server-side rendering guarantees pixel-perfect output every time.

**Flow:** User taps "Download card" → POST to `/api/card/[decodeId]` → Puppeteer renders `/card/[decodeId]` → returns PNG → downloaded to device.

### 8.2 Share text block
Pre-formatted text for copy-paste into any group chat. Example:

```
Forkast decoded Karavalli (Bangalore) 🍽️

Score: 8.9/10 — One of India's best coastal restaurants

✅ Order: Prawn Ghee Roast, Kori Gassi + Neer Dosa, Alappuzha Meen Curry
💎 Hidden gem: Koli Barthad (₹1,275 — chef's mother's recipe)
🚫 Skip: Lobster Balchao unless you know what Balchao is
💡 Tip: Ask what fish came in fresh this week before ordering

forkast.app/decode/abc123
```

Generated client-side from the decode JSON. One-tap copy using the Clipboard API with a fallback textarea for older browsers.

### 8.3 Persistent decode URL
Each decode generates a unique URL (`forkast.app/decode/[uuid]`) containing the full output. Viewable by anyone without login. Valid for **30 days**, cleaned up via a Supabase scheduled job (pg_cron — see Section 11).

---

## 9. Key User Flows

### Flow A — Photo at the table
Open Forkast on mobile → tap Upload photo → select from camera roll or take new photo → client validates file size (<10MB) and format → upload → progress state (*Reading your menu...*) → decode output rendered in-page → tap Share → download card (server-rendered PNG) or copy share text

### Flow B — Screenshot from online menu
Open online menu on Zomato/DoorDash → screenshot → open Forkast → upload screenshot → same as Flow A from upload onwards

> Note: this flow often happens on desktop. Upload UI must work on desktop drag-and-drop as well as mobile tap.

### Flow C — Restaurant name only
Open Forkast → tap Search by name → type restaurant name + optional city → tap Decode → three-stage progress indicator (*Finding the menu → Reading reviews → Decoding*) → decode output rendered → same share flow

### Flow D — Shared decode link (view only)
Someone receives a `forkast.app/decode/[uuid]` link → opens in browser → full decode output rendered, read-only → can download card or copy share text → Supabase logs this as a `decode_url_shared` event

### Flow E — Failed decode
Image too blurry / restaurant not found / API timeout → clear error state shown → specific guidance given: "Try a clearer photo", "Check the restaurant name", "Try again in a moment" → name input offered as fallback for image failures

---

## 10. User Stories

| # | As a... | I want to... | So that... |
|---|---|---|---|
| US-01 | Diner at a restaurant | Upload a photo of the physical menu and get an instant decode | I can make a confident order without asking the waiter |
| US-02 | Diner planning ahead | Upload a screenshot from Zomato and get the same decode | I know what to order before I even arrive |
| US-03 | Person debating a restaurant | Type the restaurant name and get a full decode | I can decide if it's worth going before committing |
| US-04 | Group organiser | Share a decode link with my friends before dinner | Everyone is aligned on what to order before we arrive |
| US-05 | Social media user | Download a visual recommendation card | I can share it on Instagram or WhatsApp easily |
| US-06 | Curious diner | Read the menu psychology section | I understand what the restaurant wants me to order vs. what I should actually order |
| US-07 | First-timer at unfamiliar cuisine | Get a plain-English entry point recommendation | I don't feel lost looking at a menu I don't recognise |
| US-08 | Return visitor | Get consistent decode quality for the same restaurant at different times | I can trust Forkast as a reliable reference |
| US-09 | Any user | See a clear error and a suggested alternative when a decode fails | I'm not left staring at a spinner or a blank screen |
| US-10 | Any user | Open a shared decode link sent by a friend | I can read the full decode without needing to create an account or decode it myself |

---

## 11. Feature List & Prioritisation

| Feature | Description | Priority | Release |
|---|---|---|---|
| Image upload — photo | Upload JPG/PNG/HEIC/WebP up to 10MB; Claude Vision decodes | P0 | v1 |
| Image upload — screenshot | Upload screenshot of any online menu; same decode pipeline | P0 | v1 |
| Restaurant name input | Text input + parallel live web search; multi-source retrieval; confidence indicator | P0 | v1 |
| Decode engine | 5-dimension analysis: verdict, dish breakdown, psychology, order guide, tips | P0 | v1 |
| Decode JSON schema | Typed schema as contract between API, Supabase, and frontend | P0 | v1 |
| Recommendation card | Server-rendered Puppeteer PNG 1080×1350; top orders + skip + tip + branding | P0 | v1 |
| Share text block | Pre-formatted copy-paste text; Clipboard API with textarea fallback | P0 | v1 |
| Persistent decode URL | Unique URL per decode, 30-day TTL via pg_cron, viewable without login | P0 | v1 |
| Mobile-first UI | One-handed upload; camera-roll access; desktop drag-and-drop | P0 | v1 |
| Progress states | Distinct loading states for image vs. name input; three-stage indicator | P0 | v1 |
| Error states + fallbacks | Clear error messaging; fallback suggestions; name input fallback for image failures | P0 | v1 |
| Supabase metrics logging | Log input type, restaurant, decode success, latency, share events, session data | P0 | v1 |
| Shared decode view (Flow D) | Read-only decode page for shared URLs; logs as referral event | P0 | v1 |
| Multi-image upload | Upload 2–4 photos as a single API call for multi-page menus | P1 | v1 |
| Ambiguity resolution | Prompt for city when restaurant name matches multiple locations | P1 | v1 |
| Decode quality rating | Thumbs up/down on output logged to Supabase | P1 | v1 |
| Dietary filters | Vegan/vegetarian flags, allergen callouts on dish cards | P2 | v2 |
| Browser-local decode history | Past decodes stored in localStorage — no login | P2 | v2 |
| Restaurant comparison | Decode two restaurants side-by-side | P2 | v2 |
| Cuisine education layer | Contextual explainer for unfamiliar cuisines | P2 | v2 |

---

## 12. Technical Architecture

### 12.1 Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router), Vercel | Use App Router — not Pages Router |
| Styling | Tailwind CSS | |
| AI — vision + decode | Anthropic Claude API (`claude-sonnet-4-5`) | Sonnet balances quality and latency; upgrade to Opus if decode quality insufficient |
| AI — web search | Claude API with `web_search` tool | Parallel calls for name input |
| Database + metrics | Supabase (Postgres) | |
| Decode storage | Supabase — `decodes` table | Separate from events table |
| Card generation | Puppeteer on Vercel serverless | Server-side only; no html2canvas |
| File handling | Client-side validation + base64 encode before API call | Max 10MB enforced client-side |
| Session tracking | Anonymous cookie (httpOnly, 90-day expiry) | No login; no PII stored |

### 12.2 API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/decode` | POST | Image input: accepts base64 image(s), returns decode JSON + UUID |
| `/api/decode/search` | POST | Name input: accepts restaurant name + city, runs web search, returns decode JSON + UUID |
| `/api/card/[decodeId]` | GET | Triggers Puppeteer render of `/card/[decodeId]`, returns PNG |
| `/api/decode/[decodeId]` | GET | Returns stored decode JSON for a given UUID (used by shared URL view) |
| `/api/events` | POST | Logs a metric event to Supabase (share, copy, thumbs, etc.) |

### 12.3 Data flow — image input
1. User selects image(s) → client validates format and size (<10MB each)
2. Client converts to base64 → POST to `/api/decode` with `{ images: string[], inputType: "photo" | "screenshot" }`
3. Next.js API route calls Claude Vision with decode system prompt + images
4. Claude returns structured JSON matching the `DecodeOutput` schema
5. API route stores JSON in Supabase `decodes` table with generated UUID
6. Logs event to `decode_events` table
7. Returns `{ decodeId: uuid, decode: DecodeOutput }` to client
8. Client renders decode page at `/decode/[uuid]`
9. Card generation triggered on demand via `/api/card/[decodeId]`

### 12.4 Data flow — restaurant name input
1. User submits restaurant name + optional city → POST to `/api/decode/search`
2. API route calls Claude with `web_search` tool enabled
3. **Three web searches run in parallel** targeting: (a) restaurant's own site or menu PDF, (b) delivery platform listings, (c) review aggregators + food press
4. Claude synthesises results, determines confidence level, runs decode
5. Returns same `DecodeOutput` JSON schema → same storage and render pipeline
6. If total execution exceeds 25s: return partial decode with `confidence: "low"` and a `partial: true` flag

### 12.5 Decode system prompt — design principles
- Identify every dish by name and price; if price not found, set to `null`
- Classify each dish into the five-tier badge system
- For menus >40 dishes: select the most strategically significant subset — do not truncate randomly
- Ground insights in culinary knowledge: pricing psychology, technique signals, ingredient cost reasoning, regional authenticity
- Produce structured JSON strictly matching the `DecodeOutput` schema — no prose outside the schema
- Tone: balanced, knowledgeable-friend — not snarky, not promotional
- Always output in English regardless of menu language
- Currency: detect from menu and populate `meta.currency` with ISO 4217 code

### 12.6 Supabase schema

```sql
-- Stores the full decode output
create table decodes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '30 days',
  input_type text not null,               -- 'photo' | 'screenshot' | 'name'
  restaurant_name text,
  restaurant_city text,
  confidence text,                        -- 'high' | 'medium' | 'low'
  decode_output jsonb not null,           -- full DecodeOutput JSON
  partial boolean default false           -- true if decode timed out
);

-- Index for fast UUID lookup on shared URL access
create index decodes_id_idx on decodes (id);

-- Index for expiry cleanup job
create index decodes_expires_at_idx on decodes (expires_at);

-- Stores all metric events
create table decode_events (
  id uuid primary key default gen_random_uuid(),
  decode_id uuid references decodes(id),
  session_id text,                        -- anonymous cookie value
  created_at timestamptz default now(),
  event_type text not null,               -- see valid event types below
  input_type text,
  restaurant_name text,
  restaurant_city text,
  confidence_level text,
  decode_success boolean,
  decode_latency_ms integer,
  error_type text,                        -- 'image_parse_fail' | 'not_found' | 'timeout' | null
  card_downloaded boolean,
  share_text_copied boolean,
  decode_url_referral boolean,            -- true if this session arrived via a shared link
  thumbs_up boolean,
  thumbs_down boolean
);

-- Valid event_type values:
-- 'decode_started' | 'decode_success' | 'decode_failed' | 'decode_partial'
-- 'card_downloaded' | 'share_text_copied' | 'decode_url_viewed' | 'decode_url_referral'
-- 'thumbs_up' | 'thumbs_down'

-- Scheduled cleanup: delete expired decodes (runs daily at 2am UTC)
-- Requires pg_cron extension enabled in Supabase dashboard
select cron.schedule(
  'delete-expired-decodes',
  '0 2 * * *',
  $$delete from decodes where expires_at < now()$$
);
```

### 12.7 API cost management
Rate limiting has been removed as a product decision. In its place, the following measures manage Claude API cost without degrading user experience:

- **Prompt caching:** Use Claude's prompt caching for the decode system prompt, which is identical across all requests. This reduces input token cost by ~90% on the system prompt portion.
- **Max tokens cap:** Set `max_tokens: 4000` on all decode API calls. The schema-constrained JSON output rarely exceeds 3000 tokens; this cap prevents runaway responses.
- **Image compression:** Before base64 encoding, compress images client-side to a maximum of 1600px on the longest dimension. Vision quality is preserved; token count for image processing is reduced.
- **Cost monitoring:** Log estimated token usage per decode to Supabase (`decode_events`). Set a Supabase alert if average cost per decode exceeds a defined threshold. This is the early warning system — if costs spike unexpectedly, we have data to diagnose and respond.
- **No caching of decode outputs for the same restaurant:** Menus change. We do not serve cached decodes for repeat searches of the same restaurant name. Each decode is always fresh.

### 12.8 Error handling & fallback states

Every failure mode must have an explicit UI state and a suggested recovery path. No spinners without timeouts. No blank screens.

| Error | UI message | Recovery action |
|---|---|---|
| Image too large (>10MB) | "This image is too large. Please try a smaller photo." | Re-upload prompt |
| Unsupported file format | "We support JPG, PNG, HEIC, and WebP." | Re-upload prompt |
| Image parse failure (< 5 dishes found) | "We couldn't read enough of this menu. Try a clearer photo, or search by restaurant name instead." | Offer name input |
| Restaurant not found (name input) | "We couldn't find a menu for this restaurant. Try adding a city, or upload a photo of the menu." | City prompt + upload offer |
| API timeout (>25s) | "This one's taking longer than usual. We've decoded what we found so far." | Show partial decode with `partial: true` flag visible |
| Supabase write failure | Decode still shown to user; silently retry storage in background | Background retry ×3 |
| Card generation failure | "Couldn't generate the card right now. Copy the share text instead." | Fallback to share text |
| Shared URL not found or expired | "This decode has expired or doesn't exist. Decode a new restaurant." | CTA back to home |

### 12.9 Vercel deployment configuration

Vercel serverless functions have a default 10-second timeout. Forkast's decode routes will exceed this. The following `vercel.json` configuration must be in place before any API routes are deployed:

```json
{
  "functions": {
    "app/api/decode/route.ts": {
      "maxDuration": 30
    },
    "app/api/decode/search/route.ts": {
      "maxDuration": 30
    },
    "app/api/card/[decodeId]/route.ts": {
      "maxDuration": 30
    }
  }
}
```

> Note: `maxDuration: 30` requires Vercel Pro plan or above. Confirm plan tier before deployment.

### 12.10 Environment configuration

The following environment variables must be configured in Vercel before any deployment:

```bash
# Anthropic
ANTHROPIC_API_KEY=                  # Claude API key — server-side only, never expose to client

# Supabase
NEXT_PUBLIC_SUPABASE_URL=           # Public — safe to expose
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # Public — safe to expose (row-level security enforced)
SUPABASE_SERVICE_ROLE_KEY=          # Server-side only — for write operations from API routes

# App
NEXT_PUBLIC_APP_URL=                # e.g. https://forkast.app — used for share URL generation
```

> The `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must never be used in client-side code. All Claude API calls and Supabase writes go through Next.js API routes only.

### 12.11 Security considerations

- **API key exposure:** All Claude API calls are server-side only via Next.js API routes. The Anthropic API key is never sent to the browser.
- **Image uploads:** Images are base64-encoded client-side and transmitted over HTTPS. They are passed directly to Claude and not stored on our servers. Only the decode output is persisted in Supabase.
- **User-uploaded content:** Images may contain personally identifiable information (e.g. a photo of a menu at a private event). We do not store uploaded images — this is both a privacy and a storage cost decision.
- **Supabase row-level security:** The `decodes` table is readable by the anon key (required for shared URL access). The `decode_events` table is write-only via anon key. Neither table is directly writable from the client — all writes go through API routes using the service role key.
- **CORS:** API routes restrict CORS to the app's own origin (`NEXT_PUBLIC_APP_URL`). No third-party origins can call Forkast's API routes.
- **Decode URL predictability:** UUIDs are generated using `gen_random_uuid()` (cryptographically random). Decode URLs are not guessable.
- **No PII stored:** Session IDs are anonymous cookie values. No IP addresses, device identifiers, or user-provided personal information are stored in any Supabase table.

---

## 13. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Menu data is stale for restaurant-name input | High | Medium | Always perform live web search; show confidence indicator; prompt user to verify before dining |
| Image quality too low for Claude Vision to parse | Medium | Medium | Detect low-confidence parse (<5 dishes); prompt to retake; offer name input fallback |
| Restaurant name is ambiguous | Medium | High | Prompt for city; show top candidate matches for user to confirm before searching |
| API latency causes poor UX for name input | High | Medium | Parallel web searches; three-stage progress UI; 25s timeout with partial decode fallback |
| Decode quality varies for niche or new restaurants | Medium | High | Confidence indicator on output; thumbs down feedback loop; "Suggest a correction" link |
| Claude API cost spikes unexpectedly | High | Low | Prompt caching; image compression; token cap; cost monitoring via Supabase alerts |
| Vercel function timeout on long searches | High | Medium | `maxDuration: 30` in `vercel.json`; 25s internal timeout with partial decode response |
| Card generation fails on some environments | Medium | Low | Server-side Puppeteer is default; no client-side fallback dependency |
| Supabase write fails silently | Low | Low | Background retry ×3; decode still shown to user; alert on sustained failure rate |
| Shared decode URL accessed after expiry | Low | High | Clear expired-URL error page with CTA to decode fresh; graceful 404 handling |

---

## 14. Open Questions — Remaining

The following questions were not resolved in the engineering review and require answers before sprint planning:

1. **Puppeteer on Vercel:** Puppeteer requires a Chromium binary. Vercel's serverless environment has size limits. Does the team prefer `@sparticuz/chromium` (optimised for serverless) or a dedicated card-generation microservice (e.g. separate Render instance)? The microservice approach adds ops overhead but removes the binary size constraint.

2. **Supabase `decode_output` column size:** The full `DecodeOutput` JSON for a complex menu can reach 20–30KB. At scale, this will grow the `decodes` table significantly. Should we store the full JSON in Supabase or offload to Supabase Storage (object storage) and store only a reference URL?

3. **Parallel web search implementation:** Three parallel Claude `web_search` tool calls require three concurrent API calls from the Next.js route. Confirm the team is comfortable with `Promise.all` across three Claude API instances, or if a streaming/agentic approach is preferred.

4. **`forkast.app` domain:** Domain registration and DNS configuration needed before staging deployment. Who owns this action?

5. **pg_cron availability:** The scheduled cleanup job requires the `pg_cron` extension. Confirm this is enabled on the Supabase project before the schema is applied.

---

## 15. Out of Scope — v1

- User accounts, authentication, saved history
- Dietary filters (vegan, halal, allergen flags)
- Restaurant discovery or "near me" search
- Table booking or food ordering integrations
- Monetisation, paywalls, advertising
- Native iOS / Android apps
- Multi-language output
- Restaurant owner tools or claimed profiles
- Rate limiting of any kind

---

## 16. Appendix — Reference Decodes

The following restaurants were manually decoded to validate the output format and quality bar. These serve as the reference standard for prompt engineering, QA, and acceptance testing.

| Restaurant | Location | Input type used | Notes |
|---|---|---|---|
| The Cheesecake Factory | Seattle, USA | Restaurant name | National chain; strong pricing psychology signals; high-volume menu |
| Barbeque Nation | Indiranagar, Bangalore | Restaurant name | Unlimited buffet format; different value-extraction logic from a-la-carte |
| Karavalli at Vivanta Bengaluru | Bangalore, India | Restaurant name + PDF fetch | Fine dining a-la-carte; sourced from actual 2024 menu PDF hosted on hotel server |
| Chennai Express | 1601 Dexter Ave N, Seattle | Restaurant name | Diaspora casual dining; identity-conflict menu; multi-source triangulation required |

---

*Forkast BRD v1.1 · Engineering Review Complete · May 2025*
