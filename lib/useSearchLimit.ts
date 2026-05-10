"use client";

import { useState, useEffect, useCallback } from "react";

const MAX_SEARCHES = 5;
const STORAGE_KEY = "forkast_search_limit";

interface LimitState {
  count: number;
  date: string; // "YYYY-MM-DD"
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function readState(): LimitState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { count: 0, date: todayStr() };
    const parsed = JSON.parse(raw) as LimitState;
    // Reset if it's a new day
    if (parsed.date !== todayStr()) return { count: 0, date: todayStr() };
    return parsed;
  } catch {
    return { count: 0, date: todayStr() };
  }
}

function writeState(state: LimitState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (private browsing edge case) — fail silently
  }
}

export function useSearchLimit() {
  const [state, setState] = useState<LimitState>({ count: 0, date: todayStr() });

  // Read from localStorage after mount (SSR-safe)
  useEffect(() => {
    setState(readState());
  }, []);

  const remaining = Math.max(0, MAX_SEARCHES - state.count);
  const isBlocked = state.count >= MAX_SEARCHES;

  const increment = useCallback(() => {
    const current = readState();
    const next = { count: current.count + 1, date: todayStr() };
    writeState(next);
    setState(next);
  }, []);

  return { remaining, isBlocked, increment, max: MAX_SEARCHES };
}
