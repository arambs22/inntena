import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { nextPollDelay } from "./polling";
import type { DiscoverResponse, DiscoverSuggestion } from "./types";
import { SUPPLY_AGE_CHECK_MS, SUPPLY_MAX_AGE_MS, SUPPLY_REFETCH_AGE_MS } from "./useSupply";

/**
 * Hides every suggestion's Etsy count once it is older than 24 h (boundary inclusive: exactly 24 h is shown), exactly
 * like a missing one. A count of 0 inside the window is real data and is kept.
 */
export function applyDiscoverCutoff(suggestions: DiscoverSuggestion[], now: number): DiscoverSuggestion[] {
  return suggestions.map((suggestion) => {
    const supply = suggestion.supply;
    if (!supply || supply.count === null) return suggestion;
    const fetchedAt = supply.fetchedAt === null ? Number.NaN : Date.parse(supply.fetchedAt);
    if (now - fetchedAt <= SUPPLY_MAX_AGE_MS) return suggestion;
    return { ...suggestion, supply: { count: null, status: "unavailable", fetchedAt: null } };
  });
}

/** True when the oldest displayed count is at least 12 h old, so a refresh is requested before the 24 h cutoff. */
export function discoverNeedsRefetch(suggestions: DiscoverSuggestion[], now: number): boolean {
  let oldest = Number.POSITIVE_INFINITY;
  for (const suggestion of suggestions) {
    const supply = suggestion.supply;
    if (!supply || supply.count === null || supply.fetchedAt === null) continue;
    oldest = Math.min(oldest, Date.parse(supply.fetchedAt));
  }
  return Number.isFinite(oldest) && now - oldest >= SUPPLY_REFETCH_AGE_MS;
}

/**
 * Discover suggestions for the demand region; reloads when the region or the keyword list changes. A 5-minute timer
 * re-applies the 24 h display cutoff and refetches once the oldest count is 12 h old. Silent on failure.
 */
export function useDiscover(region: string | undefined, signature: string): DiscoverSuggestion[] | null {
  const [suggestions, setSuggestions] = useState<DiscoverSuggestion[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const reloadRef = useRef<() => void>(() => {});
  const suggestionsRef = useRef<DiscoverSuggestion[] | null>(null);
  suggestionsRef.current = suggestions;

  useEffect(() => {
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (suggestionsRef.current && discoverNeedsRefetch(suggestionsRef.current, current)) reloadRef.current();
    }, SUPPLY_AGE_CHECK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function load(pollsDone: number) {
      api
        .get<DiscoverResponse>(`/discover?region=${encodeURIComponent(region ?? "")}`)
        .then((res) => {
          if (cancelled) return;
          setSuggestions(res.suggestions);
          // Crowded terms can only be filtered once their count arrives, so keep asking while any is being fetched.
          const refreshing = res.suggestions.some((s) => s.supply?.status === "refreshing");
          const delay = refreshing ? nextPollDelay(pollsDone) : null;
          if (delay !== null) timer = setTimeout(() => load(pollsDone + 1), delay);
        })
        .catch(() => {});
    }
    reloadRef.current = () => {
      if (timer) clearTimeout(timer);
      load(0);
    };
    load(0);
    return () => {
      cancelled = true;
      reloadRef.current = () => {};
      if (timer) clearTimeout(timer);
    };
  }, [region, signature]);

  return useMemo(() => (suggestions ? applyDiscoverCutoff(suggestions, now) : null), [suggestions, now]);
}
