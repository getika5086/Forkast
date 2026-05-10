"use client";

import { useState } from "react";
import { getSessionId } from "@/lib/utils";

interface Props {
  decodeId: string;
  restaurantName: string;
  restaurantCity: string | null;
  fromCache?: boolean;
  showCacheTag?: boolean; // only show ⚡ Instant on the top instance
}

export default function DecodeActions({ decodeId, restaurantName, restaurantCity, fromCache, showCacheTag = false }: Props) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      const input = document.createElement("input");
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    const sessionId = getSessionId();
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "share_copied",
        decode_id: decodeId,
        session_id: sessionId,
        restaurant_name: restaurantName,
        restaurant_city: restaurantCity,
      }),
    }).catch(() => {});
  };

  const handleVote = (thumbs: "up" | "down") => {
    if (vote) return;
    setVote(thumbs);
    const sessionId = getSessionId();
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: thumbs === "up" ? "thumbs_up" : "thumbs_down",
        decode_id: decodeId,
        session_id: sessionId,
        restaurant_name: restaurantName,
        restaurant_city: restaurantCity,
        thumbs_up: thumbs === "up",
        thumbs_down: thumbs === "down",
      }),
    }).catch(() => {});
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {fromCache && showCacheTag && (
          <span className="text-xs text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">⚡ Instant</span>
        )}
        <span className="text-sm text-gray-400">Helpful?</span>
        <button
          onClick={() => handleVote("up")}
          disabled={!!vote}
          className={`text-lg transition-all ${vote && vote !== "up" ? "opacity-30" : ""} ${vote === "up" ? "scale-110" : "hover:scale-110"}`}
          title="Yes, this was helpful"
        >
          👍
        </button>
        <button
          onClick={() => handleVote("down")}
          disabled={!!vote}
          className={`text-lg transition-all ${vote && vote !== "down" ? "opacity-30" : ""} ${vote === "down" ? "scale-110" : "hover:scale-110"}`}
          title="No, this wasn't helpful"
        >
          👎
        </button>
      </div>

      <button
        onClick={handleShare}
        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
          copied
            ? "bg-green-500 text-white border border-green-500"
            : "bg-orange-500 hover:bg-orange-600 text-white border border-orange-500"
        }`}
      >
        {copied ? (
          <>
            <span>✓</span>
            <span>Copied!</span>
          </>
        ) : (
          <>
            <span>🔗</span>
            <span>Share</span>
          </>
        )}
      </button>
    </div>
  );
}
