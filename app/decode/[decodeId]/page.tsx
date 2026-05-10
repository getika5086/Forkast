import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchDecode } from "@/lib/supabase";
import DecodeOutput from "@/components/DecodeOutput";
import DecodeActions from "@/components/DecodeActions";
import PageViewTracker from "@/components/PageViewTracker";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ decodeId: string }>;
  searchParams: Promise<{ cached?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { decodeId } = await params;
  const stored = await fetchDecode(decodeId);
  if (!stored) return { title: "Decode not found · Forkast" };
  return {
    title: `${stored.restaurant_name ?? "Restaurant"} decoded · Forkast`,
    description: stored.decode_output.verdict.summary,
  };
}

export default async function DecodePage({ params, searchParams }: Props) {
  const { decodeId } = await params;
  const { cached } = await searchParams;
  const fromCache = cached === "1";
  const stored = await fetchDecode(decodeId);

  if (!stored) notFound();

  const { decode_output: decode, partial } = stored;

  return (
    <div className="space-y-6">
      <PageViewTracker
        decodeId={decodeId}
        restaurantName={decode.restaurant.name}
        restaurantCity={decode.restaurant.city}
      />

      <DecodeActions
        decodeId={decodeId}
        restaurantName={decode.restaurant.name}
        restaurantCity={decode.restaurant.city}
        fromCache={fromCache}
        showCacheTag
      />

      <DecodeOutput decode={decode} partial={partial} />

      <DecodeActions
        decodeId={decodeId}
        restaurantName={decode.restaurant.name}
        restaurantCity={decode.restaurant.city}
      />

      <div className="text-center">
        <Link href="/" className="text-sm text-orange-500 hover:underline font-medium">
          ← Decode another restaurant
        </Link>
      </div>
    </div>
  );
}
