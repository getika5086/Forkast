"use client";

import { useEffect } from "react";
import { getSessionId } from "@/lib/utils";

interface Props {
  decodeId: string;
  restaurantName: string;
  restaurantCity: string | null;
}

export default function PageViewTracker({ decodeId, restaurantName, restaurantCity }: Props) {
  useEffect(() => {
    const sessionId = getSessionId();
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "decode_url_viewed",
        decode_id: decodeId,
        session_id: sessionId,
        input_type: "name",
        restaurant_name: restaurantName,
        restaurant_city: restaurantCity,
      }),
    }).catch(() => {});
  }, [decodeId, restaurantName, restaurantCity]);

  return null;
}
