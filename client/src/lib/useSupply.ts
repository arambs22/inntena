import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { nextPollDelay } from "./polling";
import type { SupplyItem, SupplyResponse } from "./types";

/** True while some count (main or seller-country) is still being fetched and the shared poll schedule is not spent. */
export function needsRepoll(response: SupplyResponse | null, pollsDone: number): boolean {
  return (
    response !== null &&
    response.enabled &&
    nextPollDelay(pollsDone) !== null &&
    response.items.some((item) => item.status === "refreshing" || item.local?.status === "refreshing")
  );
}

/** Etsy content must never be displayed once it is older than this (boundary inclusive: exactly 24 h is shown). */
export const SUPPLY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Age of the oldest displayed count at which the client asks the server for a refresh. */
export const SUPPLY_REFETCH_AGE_MS = 12 * 60 * 60 * 1000;
/** How often an open dashboard re-evaluates the age of the displayed counts. */
export const SUPPLY_AGE_CHECK_MS = 5 * 60 * 1000;

/**
 * Treats every count older than 24 h (or without a timestamp) exactly like a missing one: count and timestamp
 * become null and the status "unavailable". A count of 0 inside the window is real data and is kept.
 */
export function applySupplyCutoff(items: SupplyItem[], now: number): SupplyItem[] {
  return items.map((item) => {
    let main = item;
    if (item.count !== null) {
      const fetchedAt = item.fetchedAt === null ? Number.NaN : Date.parse(item.fetchedAt);
      if (!(now - fetchedAt <= SUPPLY_MAX_AGE_MS)) main = { ...item, count: null, fetchedAt: null, status: "unavailable" };
    }
    return { ...main, local: cutLocal(item.local, now) };
  });
}

/** Applies the same 24 h rule to the seller-country count; an absent value stays null. */
function cutLocal(local: SupplyItem["local"] | undefined, now: number): SupplyItem["local"] {
  if (!local || local.count === null) return local ?? null;
  const fetchedAt = local.fetchedAt === null ? Number.NaN : Date.parse(local.fetchedAt);
  return now - fetchedAt <= SUPPLY_MAX_AGE_MS ? local : { ...local, count: null, fetchedAt: null, status: "unavailable" };
}

/**
 * True when the OLDEST displayed count is at least 12 h old, so a refresh is requested before any count can reach
 * the 24 h cutoff.
 */
export function needsAgeRefetch(items: SupplyItem[], now: number): boolean {
  let oldest = Number.POSITIVE_INFINITY;
  for (const item of items) {
    if (item.count === null || item.fetchedAt === null) continue;
    oldest = Math.min(oldest, Date.parse(item.fetchedAt));
  }
  return Number.isFinite(oldest) && now - oldest >= SUPPLY_REFETCH_AGE_MS;
}

/**
 * Etsy supply for the user's keywords, with the seller-country count for `region` (undefined = none). Reloads
 * whenever `signature` (keyword ids and categories) or the region changes, and re-checks a few times
 * while counts are being fetched. A 5-minute timer re-applies the 24 h display cutoff and re-fetches once the
 * oldest count is 12 h old, so a tab left open never shows stale Etsy data. Failures are silent: the data is
 * informational and must never break the page.
 */
export function useSupply(signature: string, region: string | undefined): { enabled: boolean; items: SupplyItem[] } {
  const [response, setResponse] = useState<SupplyResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const reloadRef = useRef<() => void>(() => {});
  const responseRef = useRef<SupplyResponse | null>(null);
  responseRef.current = response;

  useEffect(() => {
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (responseRef.current && needsAgeRefetch(responseRef.current.items, current)) reloadRef.current();
    }, SUPPLY_AGE_CHECK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load(pollsDone: number) {
      try {
        const next = await api.get<SupplyResponse>(`/supply?region=${encodeURIComponent(region ?? "")}`);
        if (cancelled) return;
        setResponse(next);
        const delay = nextPollDelay(pollsDone);
        if (delay !== null && needsRepoll(next, pollsDone)) {
          timer = setTimeout(() => void load(pollsDone + 1), delay);
        }
      } catch {
        // Informational data: leave whatever was last loaded.
      }
    }

    reloadRef.current = () => {
      if (timer) clearTimeout(timer);
      void load(0);
    };
    void load(0);
    return () => {
      cancelled = true;
      reloadRef.current = () => {};
      if (timer) clearTimeout(timer);
    };
  }, [signature, region]);

  const items = useMemo(() => applySupplyCutoff(response?.items ?? [], now), [response, now]);
  return { enabled: response?.enabled ?? false, items };
}
