# How Forkast decodes a restaurant

## The short version

A user types a restaurant name + city → 1 validation search → 3 parallel web searches → all results combined into one block of text → Claude reads it and returns structured JSON.

---

## Step 1 — Validation (1 Tavily search)

Before spending credits on the full decode, we run one cheap search to confirm the restaurant exists.

**Query:** `"[name]" restaurant [city]`
**Settings:** basic depth, 3 results

We check that at least one result contains all the words from the restaurant name AND the city. If nothing matches, we throw `not_found` and stop here. This costs 1 Tavily credit regardless of what happens next.

---

## Step 2 — 4 parallel web searches (run simultaneously)

Each search targets a different type of source. They run at the same time, not one after the other.

### Search A — Menu data
**Query:** `[name] [city] restaurant menu dishes prices`
**Settings:** advanced depth, 5 results
**Purpose:** Find the restaurant's own website, menu PDFs, or any page listing actual dish names and prices.
**Typical sources:** restaurant's own site, OpenTable, Resy, SevenRooms, menu aggregators

### Search B — Platform data
**Query:** `[name] [city] restaurant Yelp DoorDash menu items`
**Settings:** basic depth, 5 results
**Purpose:** Find delivery/discovery platform listings which usually have structured menu data.
**Typical sources:** Yelp, DoorDash, Uber Eats, Grubhub, Google Maps

### Search C — Review data
**Query:** `[name] [city] restaurant review what to order best dishes worth trying`
**Settings:** advanced depth, 3 results, raw content
**Purpose:** Find what reviewers and food writers specifically recommend.
**Typical sources:** Eater, Infatuation, Yelp reviews, TripAdvisor, food blogs, Google reviews

### Search D — Critic/negative data
**Query:** `[name] [city] restaurant disappointing overrated skip not worth ordering`
**Settings:** basic depth, 3 results, no raw content (cheaper)
**Purpose:** Surface explicit negative signals — dishes reviewers flagged as weak, overpriced, or skippable. Grounds the avoid list in real data rather than inference.
**Typical sources:** Yelp critical reviews, Reddit threads, food blogger warnings

---

## What Tavily actually returns (important limitation)

Tavily does **not** fetch the full content of each page. It returns pre-indexed **snippets** — roughly 200–500 characters of extracted text per URL, similar to what you see in a Google search result. This means:

- We get breadth across many sources (up to 15 URLs total across 3 searches)
- But depth per source is limited — not a full menu read, just what Tavily indexed
- A restaurant with a well-indexed Yelp page or its own website will produce much richer data than one that only exists on Instagram

Each search's combined text is **capped at 3,000 characters** before being passed to Claude. This prevents the model context from bloating (which causes slow responses and truncated JSON).

---

## Step 3 — Context assembly

The results from all 3 searches that succeeded are joined together:

```
[Search A text — up to 3,000 chars]

---

[Search B text — up to 3,000 chars]

---

[Search C text — up to 3,000 chars]
```

Maximum total context passed to Claude: ~9,000 characters. In practice it's usually 6,000–8,000 depending on how much Tavily found.

If all 3 searches fail (network error, no results), the decode throws `not_found`. If 1 or 2 fail, we proceed with what we have and mark the result as `partial`.

---

## Step 4 — Claude decode

**Model:** `claude-haiku-4-5-20251001`
**Temperature:** 0 (deterministic — same input always produces same output)
**Max tokens:** 8,192

### System prompt (full text)

```
You are the Forkast decode engine. You analyse restaurant menus and return exactly 3 dishes
to order and 3 to avoid, plus menu psychology observations.

TOP PICKS SELECTION CRITERIA — choose dishes that satisfy one or more of the following:
- Exceptional value: price is at or below median for its section AND description signals
  real kitchen effort
- Technique-driven: braised, fermented, slow-cooked, wood-fired, house-made, aged, cured —
  any signal the kitchen invested time
- Chef's signature or "signature" section placement
- Seasonal ingredient that is only good right now (fresh catch, seasonal produce)
- Highly reviewed: mentioned positively across multiple review sources
- Underordered hidden gem: strong description, low prominence on menu, priced below
  expectations

AVOID SELECTION CRITERIA — STRICT RULES:
- Must be a real dish from the menu: an appetiser, main course, or dessert — NOT rice,
  bread, sauces, condiments, drinks, or obvious sides that nobody orders as a standalone
  choice
- The avoid list must surprise the diner — if they could have guessed it without Forkast,
  it is not worth including
- Choose dishes that satisfy one or more of the following:
  - Price trap: a named dish (not a side) priced 25%+ above comparable items in the same
    section with no quality justification
  - Weak main: a headline dish (e.g. a pasta, a curry, a protein) that review sources or
    menu signals suggest is not the kitchen's strength
  - Tourist filler: a dish that exists to capture unfamiliar diners — safe, generic,
    overpriced, not what regulars order
  - Misleading description: dish sounds appealing but the preparation or ingredients are
    actually cheap or reheated
  - Cannibalised by better option: a dish that is strictly inferior to another item on the
    same menu at a similar price

PSYCHOLOGY OBSERVATIONS — ACCURACY RULES:
- Look at the menu and describe EXACTLY what you see — do not assume a pattern, describe
  the actual pattern
- Currency symbols: check carefully. If SOME prices have $ and others do not, describe the
  specific pattern — do NOT write "absence of currency symbols" if symbols are present
  anywhere on the menu
- Only cite tactics that are directly observable in the menu data provided
- Each observation must name specific dishes, sections, or price points from this menu

VALUE SCORE RUBRIC (1.0–10.0, one decimal):
9.0–10.0  Exceptional quality-to-price — destination-worthy
7.0–8.9   Good — recommended with minor reservations
5.0–6.9   Average — some standouts, overall unremarkable
3.0–4.9   Below average — consistently overpriced or weak kitchen signals
1.0–2.9   Poor — avoid unless no alternative

PICK TAGS (use only):
"Best value" | "Chef's signature" | "Technique-driven" | "Authentic preparation" |
"Most reviewed" | "Seasonal" | "Underordered" | "Hidden gem" | "Portion warning"

AVOID TAGS (use only):
"High-margin item" | "Tourist trap" | "Overpriced" | "Generic preparation" |
"Better elsewhere" | "Poor value"

OUTPUT RULES:
- Return ONLY valid JSON. No markdown, no prose, no explanation outside the JSON.
- Output in English regardless of menu language
- meta.currency: ISO 4217 code detected from menu (default "USD")
- meta.decodeTimestamp: current ISO 8601 timestamp
- verdict.summary: one sentence, max 200 chars — the single most useful thing to know
- price: numeric only (no symbol), null if not on menu
- topPicks and avoid: EXACTLY 3 items each — no more, no fewer
- psychology: exactly 2 observations — the 2 most important tactics only, each grounded in
  a specific menu element. explanation must be one sentence max, under 120 characters
```

### User message sent to Claude

```
Decode the restaurant "[name]" in [city]. Input type: "name".

The following information was retrieved from [N] source(s) via web search:

[combined context from the 3 searches]

Apply the full rubric and return JSON only. Set meta.confidence based on source quality:
- "high" if you found the restaurant's own menu PDF or website with full dish list and prices
- "medium" if you found aggregator data (delivery platforms, review sites) with most dishes
  and some prices
- "low" if data is sparse, incomplete, or only review summaries without menu details
```

---

## Step 5 — Output JSON

Claude returns raw JSON (no markdown). We strip any accidental code fences and parse it. We then inject two fields Claude doesn't set:

- `meta.sourceUrl` — the top non-social-media URL from Search A (shown as a link on the result page so users can verify the restaurant)
- `meta.sources` — deduplicated list of all URLs from all 3 searches (stored in Supabase for inspection)

### Output schema

```json
{
  "restaurant": {
    "name": "string",
    "city": "string | null",
    "cuisine": "string",
    "priceRange": "budget | mid | upscale | fine-dining"
  },
  "meta": {
    "inputType": "name",
    "confidence": "high | medium | low",
    "dishesAnalysed": 12,
    "currency": "USD",
    "decodeTimestamp": "2026-05-09T10:00:00Z",
    "sourceUrl": "https://yelp.com/biz/...",
    "sources": ["https://...", "https://...", "...up to 15 URLs"]
  },
  "verdict": {
    "score": 7.2,
    "summary": "One sentence summary of the restaurant's value proposition"
  },
  "topPicks": [
    {
      "name": "Dish name",
      "price": 24,
      "priceDisplay": "$24",
      "reason": "Why this is worth ordering",
      "tags": ["Best value"]
    }
    // exactly 3
  ],
  "avoid": [
    {
      "name": "Dish name",
      "price": 38,
      "priceDisplay": "$38",
      "reason": "Why to skip this",
      "tags": ["Overpriced"]
    }
    // exactly 3
  ],
  "psychology": [
    {
      "title": "Observation title",
      "explanation": "One sentence grounded in a specific menu element"
    }
    // exactly 2
  ]
}
```

---

## How to inspect sources for a specific decode

In Supabase → Table Editor → `decodes` → click any row → look at `decode_output` → `meta.sources`. This is an array of every URL Tavily returned across all 3 searches for that decode.

You can also see it live in the terminal at decode time:
```
[forkast:decode] sources (12): https://yelp.com/..., https://doordash.com/..., ...
```

---

## Confidence levels — what they mean in practice

| Level  | What it means | Cache eligible |
|--------|---------------|----------------|
| high   | Found the restaurant's own menu with full dish list and prices | Yes |
| medium | Found Yelp/DoorDash/aggregator data with most dishes and some prices | Yes |
| low    | Only review mentions, no structured menu data | No — not cached |

---

## Cost per decode

| Item | Cost |
|------|------|
| Validation search (1 Tavily credit) | ~$0.001 |
| 4 parallel searches (4 Tavily credits) | ~$0.004 |
| Claude Haiku decode (~3k input + ~800 output tokens) | ~$0.006 |
| **Total per fresh decode** | **~$0.011** |
| Cache hit (0 API calls, 1 Supabase read) | **$0.000** |
