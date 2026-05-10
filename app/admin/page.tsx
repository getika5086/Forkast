import { fetchAnalyticsEvents } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function pct(a: number, b: number) {
  if (b === 0) return "—";
  return `${Math.round((a / b) * 100)}%`;
}

function avgMs(values: number[]) {
  if (values.length === 0) return "—";
  return `${(values.reduce((a, b) => a + b, 0) / values.length / 1000).toFixed(1)}s`;
}

export default async function AdminPage() {
  let events: Awaited<ReturnType<typeof fetchAnalyticsEvents>> = [];
  let fetchError = false;

  try {
    events = await fetchAnalyticsEvents(30);
  } catch {
    fetchError = true;
  }

  if (fetchError) {
    return (
      <div className="p-8 text-center text-red-500 text-sm">
        Failed to load analytics. Check SUPABASE_SERVICE_ROLE_KEY.
      </div>
    );
  }

  const byType = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.event_type] = (acc[e.event_type] ?? 0) + 1;
    return acc;
  }, {});

  const cacheHits  = byType["decode_cache_hit"]  ?? 0;
  const started    = byType["decode_started"]    ?? 0;
  const searches   = started + cacheHits;
  const successes  = (byType["decode_success"]   ?? 0) + (byType["decode_partial"] ?? 0);
  const notFound   = events.filter((e) => e.event_type === "decode_failed" && e.error_type === "not_found").length;
  const timedOut   = events.filter((e) => e.event_type === "decode_failed" && e.error_type === "timeout").length;
  const otherErr   = events.filter((e) => e.event_type === "decode_failed" && !["not_found","timeout"].includes(e.error_type ?? "")).length;
  const pageViews   = byType["decode_url_viewed"] ?? 0;
  const shareClicks = byType["share_copied"]      ?? 0;
  const thumbsUp    = byType["thumbs_up"]         ?? 0;
  const thumbsDown  = byType["thumbs_down"]       ?? 0;

  const latencies = events
    .filter((e) => ["decode_success", "decode_partial"].includes(e.event_type) && e.decode_latency_ms)
    .map((e) => e.decode_latency_ms as number);

  const uniqueSessions = new Set(
    events.filter((e) => e.session_id).map((e) => e.session_id)
  ).size;

  const rows: [string, string | number, string?][] = [
    ["Searches (total)",       searches],
    ["Unique sessions",         uniqueSessions],
    ["",                        ""],
    ["Successful decodes",      successes,  pct(successes, searches)],
    ["⚡ Served from cache",    cacheHits,  pct(cacheHits, searches)],
    ["Avg decode time",         avgMs(latencies)],
    ["",                        ""],
    ["Not found",               notFound],
    ["Timed out",               timedOut],
    ["Other errors",            otherErr],
    ["",                        ""],
    ["Page views (shared URLs)", pageViews],
    ["🔗 Share button clicks",  shareClicks],
    ["👍 Thumbs up",            thumbsUp],
    ["👎 Thumbs down",          thumbsDown],
  ];

  return (
    <div className="max-w-sm mx-auto py-10 px-4 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Forkast metrics</h1>
        <p className="text-xs text-gray-400 mt-0.5">Last 30 days</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
        {rows.map(([label, value, sub], i) =>
          label === "" ? (
            <div key={i} className="h-px bg-gray-100" />
          ) : (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-gray-600">{label}</span>
              <span className="font-semibold text-gray-900 tabular-nums">
                {value}
                {sub ? <span className="text-gray-400 font-normal ml-1.5 text-xs">{sub}</span> : null}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
