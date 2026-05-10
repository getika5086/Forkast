export type Confidence = "high" | "medium" | "low";
export type InputType = "photo" | "screenshot" | "name";
export type PriceRange = "budget" | "mid" | "upscale" | "fine-dining";

export type PickTag =
  | "Best value"
  | "Chef's signature"
  | "Technique-driven"
  | "Authentic preparation"
  | "Most reviewed"
  | "Seasonal"
  | "Underordered"
  | "Hidden gem"
  | "Portion warning";

export type AvoidTag =
  | "High-margin item"
  | "Tourist trap"
  | "Overpriced"
  | "Generic preparation"
  | "Better elsewhere"
  | "Poor value";

export interface DishPick {
  name: string;
  price: number | null;
  priceDisplay: string | null;
  reason: string;       // 2–3 sentences: specific WHY
  tags: PickTag[];
}

export interface DishAvoid {
  name: string;
  price: number | null;
  priceDisplay: string | null;
  reason: string;       // 2–3 sentences: specific WHY to skip
  tags: AvoidTag[];
}

export interface DecodeOutput {
  restaurant: {
    name: string;
    city: string | null;
    cuisine: string;
    priceRange: PriceRange;
  };
  meta: {
    inputType: InputType;
    confidence: Confidence;
    dishesAnalysed: number;
    currency: string;
    decodeTimestamp: string;
    sourceUrl?: string;    // injected after parse — not set by Claude
    sources?: string[];    // all URLs aggregated across the 3 searches
  };
  verdict: {
    score: number;       // 1.0–10.0, one decimal
    summary: string;     // single sentence, max 200 chars
  };
  topPicks: DishPick[];  // exactly 3
  avoid: DishAvoid[];    // exactly 3
  psychology: Array<{
    title: string;
    explanation: string;
  }>;
}

export interface StoredDecode {
  id: string;
  created_at: string;
  expires_at: string;
  input_type: InputType;
  restaurant_name: string | null;
  restaurant_city: string | null;
  confidence: Confidence;
  decode_output: DecodeOutput;
  partial: boolean;
}

export type EventType =
  | "decode_started"
  | "decode_success"
  | "decode_failed"
  | "decode_partial"
  | "decode_cache_hit"
  | "decode_url_viewed"
  | "decode_url_referral"
  | "share_copied"
  | "thumbs_up"
  | "thumbs_down";

export interface DecodeEvent {
  decode_id?: string;
  session_id?: string;
  event_type: EventType;
  input_type?: InputType;
  restaurant_name?: string;
  restaurant_city?: string;
  confidence_level?: Confidence;
  decode_success?: boolean;
  decode_latency_ms?: number;
  error_type?: "image_parse_fail" | "not_found" | "timeout" | null;
  decode_url_referral?: boolean;
  thumbs_up?: boolean;
  thumbs_down?: boolean;
}
