"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NameSearch from "@/components/NameSearch";
import ProgressIndicator from "@/components/ProgressIndicator";
import ErrorState from "@/components/ErrorState";
import { useSearchLimit } from "@/lib/useSearchLimit";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { remaining, isBlocked, increment, max } = useSearchLimit();

  const handleSearch = async (name: string, city: string) => {
    if (isBlocked) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/decode/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantName: name, city }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "decode_failed");
        setLoading(false);
        return;
      }

      // Only charge against the limit for fresh decodes — cache hits are free
      if (!data.fromCache) increment();

      router.push(`/decode/${data.decodeId}${data.fromCache ? "?cached=1" : ""}`);
    } catch {
      setError("decode_failed");
      setLoading(false);
    }
  };

  if (loading) return <ProgressIndicator inputType="name" />;

  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => { setLoading(false); setError(null); }}
      />
    );
  }

  return (
    <div className="space-y-10">
      <div className="text-center space-y-2 pt-4">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Decode any menu
        </h1>
        <p className="text-gray-400 text-sm max-w-xs mx-auto">
          Know exactly what to order and what to skip — before you sit down or order online.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        {isBlocked ? (
          <SearchLimitReached />
        ) : (
          <>
            <NameSearch onSearch={handleSearch} />
            <SearchLimitIndicator remaining={remaining} max={max} />
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { emoji: "🔍", title: "Search by name", desc: "Type the restaurant name" },
          { emoji: "🤖", title: "AI decodes", desc: "Claude reads every dish and price" },
          { emoji: "🍽️", title: "Order smart", desc: "3 picks, 3 to skip, done" },
        ].map((step) => (
          <div key={step.title} className="bg-white rounded-xl border border-gray-100 p-3 space-y-1">
            <span className="text-2xl block">{step.emoji}</span>
            <p className="text-xs font-semibold text-gray-700">{step.title}</p>
            <p className="text-xs text-gray-400">{step.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchLimitIndicator({ remaining, max }: { remaining: number; max: number }) {
  const isLow = remaining <= 2;
  return (
    <p className={`text-center text-xs ${isLow ? "text-orange-500 font-medium" : "text-gray-400"}`}>
      {remaining} of {max} searches remaining today
      {remaining === 1 && " — last one!"}
    </p>
  );
}

function SearchLimitReached() {
  return (
    <div className="text-center space-y-3 py-4">
      <p className="text-3xl">🍽️</p>
      <p className="font-semibold text-gray-900">You&apos;ve reached today&apos;s search limit</p>
      <p className="text-sm text-gray-500 max-w-xs mx-auto">
        Forkast is in beta and we&apos;re rate-limiting searches while we scale up. You&apos;ve used all 5 searches for today — come back tomorrow for 5 more.
      </p>
      <p className="text-xs text-gray-400">
        Previously decoded restaurants are still accessible via their links.
      </p>
    </div>
  );
}
