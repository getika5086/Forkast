import { fetchDecode } from "@/lib/supabase";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ decodeId: string }>;
}

export default async function CardRenderPage({ params }: Props) {
  const { decodeId } = await params;
  const stored = await fetchDecode(decodeId);
  if (!stored) notFound();

  const decode = stored.decode_output;
  const picks = decode.topPicks.slice(0, 3);
  const skips = decode.avoid.slice(0, 2);

  return (
    <div
      data-card-ready
      style={{
        width: 1080, height: 1350,
        background: "linear-gradient(135deg, #1a1a1a 0%, #2d1a0e 100%)",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "#fff",
        display: "flex", flexDirection: "column",
        padding: "64px", boxSizing: "border-box",
        position: "relative", overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 70%)" }} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
        <div>
          <p style={{ fontSize: 20, color: "#f97316", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>forkast</p>
          <h1 style={{ fontSize: 52, fontWeight: 900, lineHeight: 1.1, color: "#fff", margin: 0 }}>{decode.restaurant.name}</h1>
          {decode.restaurant.city && (
            <p style={{ fontSize: 22, color: "#9ca3af", marginTop: 8 }}>{decode.restaurant.city} · {decode.restaurant.cuisine}</p>
          )}
        </div>
        <div style={{ textAlign: "center", background: "rgba(249,115,22,0.15)", borderRadius: 20, padding: "16px 24px" }}>
          <p style={{ fontSize: 60, fontWeight: 900, color: "#f97316", margin: 0, lineHeight: 1 }}>{decode.verdict.score.toFixed(1)}</p>
          <p style={{ fontSize: 16, color: "#9ca3af", margin: 0 }}>/10</p>
        </div>
      </div>

      <p style={{ fontSize: 22, color: "#e5e7eb", lineHeight: 1.5, marginBottom: 40, fontStyle: "italic" }}>&ldquo;{decode.verdict.summary}&rdquo;</p>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 28 }}>
        {/* Order */}
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>Order these</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {picks.map((dish) => (
              <div key={dish.name} style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px 18px" }}>
                <span style={{ fontSize: 18 }}>✓</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 20, margin: 0 }}>{dish.name}</p>
                  <p style={{ color: "#9ca3af", fontSize: 14, margin: "3px 0 0" }}>{dish.reason.split(".")[0]}.</p>
                </div>
                {dish.priceDisplay && <p style={{ color: "#f97316", fontWeight: 700, fontSize: 18, whiteSpace: "nowrap" }}>{dish.priceDisplay}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Skip */}
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Skip</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {skips.map((dish) => (
              <div key={dish.name} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                <span>✕</span>
                <p style={{ fontWeight: 600, fontSize: 17, margin: 0 }}>{dish.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 28, display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 22 }}>
        <p style={{ fontSize: 16, color: "#6b7280" }}>forkast.app</p>
        <p style={{ fontSize: 14, color: "#4b5563" }}>AI-powered menu intelligence</p>
      </div>
    </div>
  );
}
