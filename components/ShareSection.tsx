"use client";

import { useState } from "react";
import type { DecodeOutput } from "@/lib/types";
import { buildShareText, getAppUrl } from "@/lib/utils";

interface Props {
  decode: DecodeOutput;
  decodeId: string;
  onEvent?: (type: "card_downloaded" | "share_text_copied") => void;
}

export default function ShareSection({ decode, decodeId, onEvent }: Props) {
  const [copied, setCopied] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardError, setCardError] = useState(false);

  const decodeUrl = `${getAppUrl()}/decode/${decodeId}`;
  const shareText = buildShareText(decode, decodeUrl);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      // Clipboard API not available — fallback
      const ta = document.createElement("textarea");
      ta.value = shareText;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    onEvent?.("share_text_copied");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadCard = async () => {
    setCardLoading(true);
    setCardError(false);
    try {
      const res = await fetch(`/api/card/${decodeId}`);
      if (!res.ok) throw new Error("card_failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `forkast-${decode.restaurant.name.toLowerCase().replace(/\s+/g, "-")}.png`;
      a.click();
      URL.revokeObjectURL(url);
      onEvent?.("card_downloaded");
    } catch {
      setCardError(true);
    } finally {
      setCardLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(decodeUrl);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = decodeUrl;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
      <h3 className="text-lg font-bold text-gray-900">Share this decode</h3>

      {/* Share text preview */}
      <div className="bg-gray-50 rounded-xl p-4">
        <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
          {shareText}
        </pre>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Copy share text */}
        <button
          onClick={handleCopy}
          className="flex items-center justify-center gap-2 py-3 px-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors"
        >
          {copied ? (
            <>✓ Copied!</>
          ) : (
            <>📋 Copy for WhatsApp / iMessage</>
          )}
        </button>

        {/* Download card */}
        <button
          onClick={handleDownloadCard}
          disabled={cardLoading}
          className="flex items-center justify-center gap-2 py-3 px-4 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-semibold rounded-xl transition-colors"
        >
          {cardLoading ? (
            <><span className="animate-spin">⏳</span> Generating card...</>
          ) : (
            <>🖼️ Download card</>
          )}
        </button>
      </div>

      {cardError && (
        <p className="text-sm text-red-500 text-center">
          Couldn&apos;t generate the card right now. Copy the share text instead.
        </p>
      )}

      {/* Persistent link */}
      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3">
        <span className="text-sm text-gray-500 truncate flex-1">{decodeUrl}</span>
        <button
          onClick={handleCopyLink}
          className="text-xs text-orange-500 font-medium shrink-0 hover:underline"
        >
          Copy link
        </button>
      </div>
      <p className="text-xs text-gray-400 text-center">
        This link is valid for 30 days · No login needed to view
      </p>
    </div>
  );
}
