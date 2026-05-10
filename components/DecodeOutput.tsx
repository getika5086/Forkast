"use client";

import type { DecodeOutput as DecodeOutputType } from "@/lib/types";

// Trims text to the last sentence ending at or before maxChars.
// If no sentence boundary is found within range, returns the full string.
function trimToSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars + 60); // give room to find a sentence end
  const lastEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "), slice.lastIndexOf("."), slice.lastIndexOf("!"), slice.lastIndexOf("?"));
  if (lastEnd === -1) return text;
  const match = [slice.slice(0, lastEnd + 1)];
  return match ? match[0].trim() : text;
}

interface Props {
  decode: DecodeOutputType;
  partial?: boolean;
}

export default function DecodeOutput({ decode, partial }: Props) {

  return (
    <div className="space-y-6">
      {partial && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          ⚠️ This one&apos;s taking longer than usual. We&apos;ve decoded what we found so far.
        </div>
      )}

      {/* Minimal restaurant label */}
      <div>
        <h2 className="text-lg font-bold text-gray-900">{decode.restaurant.name}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {decode.restaurant.city && (
            <p className="text-sm text-gray-400">{decode.restaurant.city} · {decode.restaurant.cuisine}</p>
          )}
          {decode.meta.sourceUrl && (
            <a
              href={decode.meta.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-orange-500 hover:underline"
            >
              {(() => {
                try {
                  return `↗ ${new URL(decode.meta.sourceUrl).hostname.replace(/^www\./, "")}`;
                } catch {
                  return "↗ View source";
                }
              })()}
            </a>
          )}
        </div>
      </div>

      {/* Top 3 picks */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <span className="text-green-500">✓</span> Order these
        </h3>
        <div className="space-y-3">
          {decode.topPicks.map((dish, i) => (
            <div key={i} className="bg-white rounded-xl border border-green-100 p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-gray-900">{dish.name}</span>
                {dish.priceDisplay && (
                  <span className="text-sm font-medium text-gray-500 shrink-0">{dish.priceDisplay}</span>
                )}
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{dish.reason}</p>
              {dish.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {dish.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 bg-green-50 border border-green-200 rounded-full text-green-700">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 3 to avoid */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <span className="text-red-500">✕</span> Skip these
        </h3>
        <div className="space-y-3">
          {decode.avoid.map((dish, i) => (
            <div key={i} className="bg-white rounded-xl border border-red-100 p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-gray-900">{dish.name}</span>
                {dish.priceDisplay && (
                  <span className="text-sm font-medium text-gray-500 shrink-0">{dish.priceDisplay}</span>
                )}
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{dish.reason}</p>
              {dish.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {dish.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 bg-red-50 border border-red-200 rounded-full text-red-700">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Menu psychology */}
      {decode.psychology.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Menu psychology</h3>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <ul className="space-y-3">
              {decode.psychology.map((p, i) => (
                <li key={i} className="text-sm text-gray-600 leading-relaxed">
                  <span className="font-semibold text-gray-800">{p.title}:</span>{" "}
                  {trimToSentence(p.explanation, 160)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
