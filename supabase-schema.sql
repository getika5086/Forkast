-- Forkast — Supabase schema
-- Run this in your Supabase SQL editor before starting the app

-- ── Tables ────────────────────────────────────────────────────────────────────

create table if not exists decodes (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz default now(),
  expires_at   timestamptz default now() + interval '30 days',
  input_type   text not null,          -- 'photo' | 'screenshot' | 'name'
  restaurant_name text,
  restaurant_city text,
  confidence   text,                   -- 'high' | 'medium' | 'low'
  decode_output jsonb not null,        -- full DecodeOutput JSON
  partial      boolean default false   -- true if decode timed out mid-search
);

create table if not exists decode_events (
  id                  uuid primary key default gen_random_uuid(),
  decode_id           uuid references decodes(id),
  session_id          text,
  created_at          timestamptz default now(),
  event_type          text not null,
  input_type          text,
  restaurant_name     text,
  restaurant_city     text,
  confidence_level    text,
  decode_success      boolean,
  decode_latency_ms   integer,
  error_type          text,
  card_downloaded     boolean,
  share_text_copied   boolean,
  decode_url_referral boolean,
  thumbs_up           boolean,
  thumbs_down         boolean
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists decodes_id_idx         on decodes (id);
create index if not exists decodes_expires_at_idx on decodes (expires_at);

-- ── Row-level security ────────────────────────────────────────────────────────

alter table decodes        enable row level security;
alter table decode_events  enable row level security;

-- decodes: anyone can read (required for shared URL access)
create policy "Public read decodes"
  on decodes for select
  using (true);

-- decodes: only service role can insert/update/delete (via API routes)
create policy "Service role write decodes"
  on decodes for all
  using (auth.role() = 'service_role');

-- decode_events: only service role can read or write
create policy "Service role all events"
  on decode_events for all
  using (auth.role() = 'service_role');

-- ── Scheduled cleanup (requires pg_cron extension) ────────────────────────────
-- Enable pg_cron in Supabase dashboard: Database → Extensions → pg_cron
-- Then run:

-- select cron.schedule(
--   'delete-expired-decodes',
--   '0 2 * * *',
--   $$delete from decodes where expires_at < now()$$
-- );
