import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { nextPollDelay } from "./polling";
import type { ListingSamplesResponse } from "./types";

/** Etsy listing content must never be displayed more than 6 h after it was fetched (boundary inclusive). */
export const SAMPLES_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Age at which an open page asks the server for fresher samples. */
export const SAMPLES_REFETCH_AGE_MS = 3 * 60 * 60 * 1000;
const AGE_CHECK_MS = 5 * 60 * 1000;

/** Hides samples older than 6 h exactly like missing ones. An empty list inside the window is a real result. */
export function applySamplesCutoff(response: ListingSamplesResponse, now: number): ListingSamplesResponse {
  if (!response.enabled || !response.listings) return response;
  const fetchedAt = response.fetchedAt ? Date.parse(response.fetchedAt) : Number.NaN;
  if (now - fetchedAt <= SAMPLES_MAX_AGE_MS) return response;
  return { ...response, listings: null, fetchedAt: null, status: "unavailable" };
}

/** Formats a listing price; an unknown currency code falls back to plain text instead of throwing. */
export function formatListingPrice(price: number | null, currency: string | null, locale: string): string | null {
  if (price === null || !currency) return null;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(price);
  } catch {
    return `${new Intl.NumberFormat(locale).format(price)} ${currency}`;
  }
}

/**
 * Up to five current Etsy listings for the selected keyword. Re-polls with backoff (see `nextPollDelay`) while the
 * server is fetching them; the 5-minute tick re-applies the 6 h cutoff, asks again once they are 3 h old, and retries
 * if the response is still "refreshing". Failures are silent: this is
 * informational and must never break the page. Null until the first answer arrives.
 */
export function useEtsyListings(keywordId: number | null, signature: string): ListingSamplesResponse | null {
  const [stored, setStored] = useState<{ keywordId: number; response: ListingSamplesResponse } | null>(null);
  // Only a response that belongs to the current keyword may be shown; this avoids one render of the previous one.
  const response = stored && stored.keywordId === keywordId ? stored.response : null;
  const [now, setNow] = useState(() => Date.now());
  const reloadRef = useRef<() => void>(() => {});
  const responseRef = useRef<ListingSamplesResponse | null>(null);
  responseRef.current = response;

  useEffect(() => {
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      const currentResponse = responseRef.current;
      const fetchedAt = currentResponse?.fetchedAt ? Date.parse(currentResponse.fetchedAt) : Number.NaN;
      const stillRefreshing = currentResponse?.enabled === true && currentResponse.status === "refreshing";
      if (stillRefreshing || current - fetchedAt >= SAMPLES_REFETCH_AGE_MS) reloadRef.current();
    }, AGE_CHECK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setStored(null);
    if (keywordId === null) return;
    const id = keywordId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load(pollsDone: number) {
      try {
        const next = await api.get<ListingSamplesResponse>(`/keywords/${id}/etsy-listings`);
        if (cancelled) return;
        setStored({ keywordId: id, response: next });
        const delay = next.enabled && next.status === "refreshing" ? nextPollDelay(pollsDone) : null;
        if (delay !== null) timer = setTimeout(() => void load(pollsDone + 1), delay);
      } catch {
        // Informational data: keep whatever was last loaded.
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
  }, [keywordId, signature]);

  return useMemo(() => (response ? applySamplesCutoff(response, now) : null), [response, now]);
}
