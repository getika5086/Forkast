import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { StoredDecode, DecodeEvent, DecodeOutput } from "./types";

// Lazy singletons — only created on first use, not at module import time
let _publicClient: SupabaseClient | null = null;
let _adminClient: SupabaseClient | null = null;

function getPublicClient(): SupabaseClient {
  if (!_publicClient) {
    _publicClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _publicClient;
}

function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _adminClient;
}

export async function storeDecode(
  decode: StoredDecode["decode_output"],
  opts: {
    inputType: StoredDecode["input_type"];
    restaurantName?: string | null;
    restaurantCity?: string | null;
    confidence: StoredDecode["confidence"];
    partial?: boolean;
  }
): Promise<string> {
  const { data, error } = await getAdminClient()
    .from("decodes")
    .insert({
      input_type: opts.inputType,
      restaurant_name: opts.restaurantName ?? null,
      restaurant_city: opts.restaurantCity ?? null,
      confidence: opts.confidence,
      decode_output: decode,
      partial: opts.partial ?? false,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Supabase store failed: ${error.message}`);
  return data.id as string;
}

export async function fetchDecode(id: string): Promise<StoredDecode | null> {
  const { data, error } = await getPublicClient()
    .from("decodes")
    .select("*")
    .eq("id", id)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) return null;
  return data as StoredDecode;
}

export async function logEvent(event: DecodeEvent): Promise<void> {
  try {
    await getAdminClient().from("decode_events").insert(event);
  } catch {
    // Silently swallow — metrics must never break the user flow
  }
}

export async function lookupCachedDecode(
  name: string,
  city?: string
): Promise<{ decodeId: string; decode: DecodeOutput } | null> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  let query = getAdminClient()
    .from("decodes")
    .select("id, decode_output")
    .ilike("restaurant_name", name.trim())
    .in("confidence", ["high", "medium"])
    .eq("partial", false)
    .gt("expires_at", now)
    .gt("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(1);

  if (city?.trim()) {
    query = query.ilike("restaurant_city", city.trim());
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return { decodeId: data.id as string, decode: data.decode_output as DecodeOutput };
}

export async function fetchAnalyticsEvents(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getAdminClient()
    .from("decode_events")
    .select("event_type, session_id, restaurant_name, restaurant_city, decode_latency_ms, error_type, thumbs_up, thumbs_down, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Analytics fetch failed: ${error.message}`);
  return data ?? [];
}

export async function storeDecodeWithRetry(
  decode: StoredDecode["decode_output"],
  opts: Parameters<typeof storeDecode>[1],
  maxRetries = 3
): Promise<string | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await storeDecode(decode, opts);
    } catch {
      if (attempt === maxRetries - 1) return null;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}
