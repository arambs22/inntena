# Etsy data, fully used, and a dashboard that fits it — design

**Date:** 2026-10-14
**Status:** approved in conversation (plan approved 2026-10-13); this document is the binding spec.
**Builds on:** `docs/superpowers/specs/2026-10-09-etsy-supply-design.md` (Phase 6). Everything there still holds
unless this document changes it explicitly.

## 1. Goal

Get as much honest value out of the Etsy API as its terms allow, and give it room on a dashboard that is currently
overlapping:

- **A.** Re-layout the dashboard with normal page scrolling, and let the user choose which region drives the demand
  side of the verdict.
- **B.** Make the supply count more precise (Etsy category per keyword) and add a local supply count (sellers based in
  the chosen country).
- **C.** "On Etsy now": show up to 5 real listings for the selected keyword, exactly as Etsy returns them.
- **D.** "Discover": suggest new keywords from Google Trends signals and the season calendar, filtered by Etsy supply.

## 2. Non-goals

- No statistics computed from listing content: no average price, no frequent tags, no "top shops", no ranking by
  favorites or views. That is "analysis" under Etsy's terms (section 5) and needs written permission we do not have.
- No AI of any kind (Phase 7 stays closed) and no Etsy data sent to any third party.
- No history of counts or listings (terms: latest value only, freshness limits).
- No sales data: the API has none for listings of other shops; no "best sellers" or "trending on Etsy" endpoint exists.

## 3. Constraints from Etsy's API terms (re-read 2026-10-13)

| Rule | Consequence here |
|---|---|
| Listing content shown ≤ 6 h older than Etsy; other content ≤ 24 h | Listing samples: hard cutoff 6 h, refresh after 3 h. Counts: unchanged 24 h / 12 h. |
| Do not cache or store longer than reasonably necessary | Listing samples deleted after 6 h; counts after 24 h; one row per cache key, overwritten. |
| Request only the minimum data needed | Counts keep `limit=1`; samples ask for 5 listings and only read the fields in §6.3. |
| No collecting/analysing Etsy content for analysis, ML or AI without written permission | §2 non-goals. Discover uses only the aggregate `count`. |
| Do not transfer Etsy data to third parties | Thumbnails are loaded by the visitor's browser straight from Etsy's CDN; nothing is proxied or forwarded. |
| Prominent trademark notice; app terms + privacy; support email | Already in place (Phase 6); the notice also sits next to the listing samples. |
| App purpose and its updates need Etsy's prior approval | The owner submitted an updated purpose on 2026-10-14 (counts with taxonomy/shop_location filters, suggested keywords, up to 5 listings cached ≤ 6 h). Part C must stay switched off in production until Etsy approves (see §9). |

## 4. Facts verified against the live API (2026-10-13/14, read-only calls with the app key)

- `GET /v3/application/listings/active` accepts `keywords`, `limit` (≤ 100), `taxonomy_id`, `shop_location`,
  `min_price`, `max_price`, `sort_on` (`score`, `created`, …). It returns `count` plus listings with `title`,
  `price {amount, divisor, currency_code}`, `url`, `num_favorers`, `views`, `tags`, `taxonomy_id`, timestamps, etc.
- `taxonomy_id` filters **include descendants**: "boho clipart" = 73,355 overall, 43,707 in Craft Supplies & Tools (562),
  27,871 in Art & Collectibles (66), 1,893 in Paper & Party Supplies (1250).
- `includes=Images` is ignored by the search endpoint. Images come from
  `GET /v3/application/listings/batch?listing_ids=…&includes=Images` (`images[].url_170x135`, host `i.etsystatic.com`).
- `shop_location` needs the **English country name**: "Mexico" → 104, "United States" → 71,002, "United Kingdom" →
  4,866, "Germany" → 1,498, "South Korea" → 83. A code ("MX", "US") or a non-English name ("Deutschland") returns
  **0 without an error**. A wrong name therefore looks like real data — see §6.2.
- `num_favorers`/`views` are 0 on brand-new listings and populated on older ones.

## 5. Architecture overview

One Etsy request queue, rate guard and circuit breaker (the existing `createEtsySupplyService` machinery) serves every
kind of Etsy call. What changes is the unit of work: a **job** with a cache key, instead of a bare term.

```
client ── GET /api/supply ───────────► supply route ──► readSupply(keys)      ─┐
       ── GET /api/keywords/:id/etsy-listings ──────► readListingSamples(key) ─┼─► shared queue ─► etsyHttp
       ── GET /api/discover ─────────► discover route ─► readSupply(keys)      ─┘   (220 ms spacing, breaker)
```

## 6. Backend

### 6.1 Data model

- `etsy_supply`: primary key becomes **(`term`, `taxonomy_id`, `shop_location`)**. `taxonomy_id integer not null
  default 0` (0 = all categories), `shop_location text not null default ''` ('' = anywhere). Non-null sentinels keep the
  composite primary key simple. The migration drops and recreates the table (it is a cache; nothing to preserve).
- `keywords.etsy_taxonomy_id integer null` (null = all categories).
- New `etsy_listing_samples`: `key text primary key` (normalized term + taxonomy), `payload jsonb not null`,
  `fetched_at timestamp not null`.
- `tests/setup.ts` truncates the new table.

### 6.2 Configuration (new, `src/config/`)

- `etsyCategories.ts` — the fixed list offered to users, with Etsy taxonomy ids: 562 Craft Supplies & Tools,
  66 Art & Collectibles, 1250 Paper & Party Supplies, 1633 Weddings, 891 Home & Living, 374 Clothing. The API rejects
  any other id. Names are translated on the client.
- `etsyCountries.ts` — map from our region codes (`client/src/lib/regions.ts`, 30 codes) to Etsy's English country
  names. **Because a wrong name silently returns 0**, the map ships only names verified once against the live API
  (each must return a count > 0 for the broad term "clipart"); a code without a verified name is simply not offered
  for local supply. The verification is a one-off script run during implementation, with its output recorded in the
  implementation report; it is not run in CI.
- `seasonalSeeds.ts` — our own calendar (not Etsy data): Valentine's Day (Feb 14), Mother's Day (2nd Sunday of May,
  US/MX dates differ: use the US date and May 10 for MX), back to school (Aug 1), Halloween (Oct 31), Day of the Dead
  (Nov 2), Christmas (Dec 25), weddings (Apr 1–Sep 30). Each has a lead window (shown from 8 weeks before until the
  day) and 3–5 seed terms in English and Spanish (e.g. "halloween clipart", "clipart halloween").

### 6.3 HTTP layer (`src/services/etsyHttp.ts`)

- `fetchListingCountFromEtsy(term, filters?)` gains optional `{ taxonomyId?: number; shopLocation?: string }`, sent as
  `taxonomy_id` / `shop_location`. Everything else (limit=1, only `count` and `x-remaining-today` read, 10 s timeout,
  credentials never in errors) is unchanged.
- New `fetchListingSamplesFromEtsy(term, taxonomyId?)`: two calls — search with `limit=5&sort_on=score`, then `batch`
  with `includes=Images` for those ids. Returns, per listing, only: `listingId`, `title`, `price` (amount/divisor →
  number, currency), `url`, `thumbnailUrl` (`url_170x135` of the first image, or null), `favorites`, `views`.
  Nothing else is read or kept. Fewer than 5 results is normal; 0 results is a valid empty list.

### 6.4 Service (`src/services/etsySupply.service.ts`)

- Jobs are `{ kind: "count", term, taxonomyId, shopLocation }` or `{ kind: "samples", term, taxonomyId }`, deduplicated
  by a stable key. Same queue, same 220 ms spacing, same breaker (3 failures → 15 min, 429 → 60 s,
  `x-remaining-today ≤ 200` → 15 min). A samples job costs 2 requests and the spacing applies to each.
- `readSupply(keys)` keeps its contract (answer from cache, never wait, queue missing/stale, 24 h hard cutoff, 12 h
  refresh, 0 is data), now per composite key.
- `readListingSamples(key)`: same pattern with **6 h hard cutoff and 3 h refresh**; returns `{ listings, fetchedAt,
  status }` where `status` is `fresh | refreshing | unavailable`.
- The purge deletes `etsy_supply` rows older than 24 h and `etsy_listing_samples` rows older than 6 h (exactly the limit
  is kept, consistent with `age <= MAX`).

### 6.5 Routes

- `GET /api/supply` (existing): per keyword returns
  `{ keywordId, count, fetchedAt, status, local: { region, count, fetchedAt, status } | null }`. `count` uses the
  keyword's category. `local` is present only when the request carries `?region=XX`, the code has a verified Etsy
  country name, and it is not worldwide. Terms gate and disabled mode unchanged.
- `PATCH /api/keywords/:id/etsy-category` `{ taxonomyId: number | null }` — owner and active keyword only; validates
  against `etsyCategories`; 400 otherwise. Same pattern as `PATCH /:id/pin`. `GET /api/keywords` includes
  `etsyTaxonomyId`.
- `GET /api/keywords/:id/etsy-listings` — owner, active keyword, terms accepted, Etsy enabled; otherwise
  `{ enabled: false, listings: [] }` (or 404 for not owned). Response
  `{ enabled: true, status, fetchedAt, listings: [...] }`. Never returns samples older than 6 h.
- `GET /api/discover?region=XX` — see §6.6. Terms gate and disabled mode as above (disabled → Trends- and season-based
  suggestions still returned, without supply).
- All routes catch async errors (`next(err)`), as in Phase 6.

### 6.6 Discover

Per user, per request:

1. **Candidates.**
   - The latest rising related queries of the user's active keywords (the existing `related_queries` rows, the same
     "latest collection" rule as `GET /api/related`), for the requested region. Keep only "Breakout" or growth ≥ 500 %
     (reuse `growthNumber` / `sortByGrowthDesc` from `src/utils/relatedGrowth.ts`). Origin: `{ type: "related", from: <keyword term> }`.
   - Season seeds active today. Origin: `{ type: "season", event, daysUntil }`.
   - Drop anything the user already tracks (active or archived), compared with `normalizeTerm`, and duplicates.
2. **Supply filter.** Read supply for each candidate (all categories, anywhere) through the shared cache.
   - New terms enter the queue at most **10 per user per UTC day**, counted in memory; the rest wait for the next day.
   - Candidates with high supply (> 100,000) are dropped.
3. **Order.** Breakouts first, then season, then other high growth. Within a group, low supply before medium before
   unknown. Ties are broken alphabetically. Return at most 5:
   `[{ term, origin, supply: { count, level, status } | null }]`.

The text shown to users must say these are rising searches, not proven sales.

## 7. Client

### 7.1 Layout (`client/src/pages/DashboardPage.tsx`)

- The page scrolls normally (drop `h-screen`/`overflow` on the root; no inner fixed-height grid).
- **Left column:** keyword form, counter, toolbar, list. `sticky` at the top with its own scroll limited to the
  viewport height. The list keeps its own scroll as today.
- **Right column:** stacked cards.
  1. Header: selected term and the chart range selector.
  2. Demand / Supply / Verdict panel.
  3. Chart.
  4. A two-column row (stacked below `lg`): related queries | "On Etsy now".
- **Discover strip:** full width above the two columns. Collapsible; its open/closed state is kept in `localStorage`
  (`inntena_discover_open`).
- **Footer:** at the end of the page.
- Must pass at 1440 px and 1024 px, light and dark, ES and EN, with no overlap. Follows `docs/design/direction.md`.

### 7.2 Demand region selector

- A segmented control inside the panel, listing the active regions. The chosen region (persisted as
  `inntena_demand_region`; falls back to the first active region when the stored one is no longer active) drives:
  momentum, the verdict, the list badges, the `?region=` of `/api/supply`, and Discover.
- `buildInsights` takes the chosen region's trends. Its doc comment changes accordingly.

### 7.3 Supply panel additions

- **Category select:** "All categories" plus the 6 categories. Changing it calls the PATCH and refetches supply.
- **Local line:** "N from sellers in <country>" when `local` is present. Help text: it measures local supply, not demand.
- **Verdict:** keeps using the category count. The thresholds in `client/src/lib/opportunity.ts` are unchanged.

### 7.4 "On Etsy now" (`EtsyListings.tsx`, `useEtsyListings`)

- Up to 5 cards: thumbnail (lazy, fixed size, `alt` = title), title (2 lines), price with currency, ♥ favorites,
  👁 views, all as returned.
- Each card links to the listing on Etsy in a new tab with `rel="noopener noreferrer"`.
- Also shows "Updated N h ago" and the Etsy trademark notice (`EtsyAttribution`).
- Applies the 6 h cutoff client-side too (the `applySupplyCutoff` pattern), so a tab left open never shows stale listings.
- States: loading, refreshing (no cached samples yet), unavailable, and empty ("No active listings on Etsy").

### 7.5 Discover strip (`DiscoverStrip.tsx`, `useDiscover`)

- Up to 5 cards: term, its origin ("Rising with *boho clipart*" / "Season: Halloween in 3 weeks"), supply level and
  count, and a "Track" button.
- "Track" uses the existing `POST /api/keywords` and respects the 15-keyword cap: the existing 422 is shown through
  its `code`.
- The empty state explains that suggestions appear after the next collection.

### 7.6 Shared

- Every new string goes into `i18n.ts` (ES and EN). New types go into `types.ts`.
- `src/app.ts` CSP: `img-src` adds `https://i.etsystatic.com`.

## 8. Legal

- `legalContent.ts`, both languages:
  - Privacy: when listing examples are shown, thumbnails load from Etsy's servers, so Etsy receives the visitor's IP
    address and browser details.
  - Terms: listing examples are shown as Etsy returns them and may change or disappear.
- Bump `CURRENT_TERMS_VERSION` (existing users re-accept through the existing modal).

## 9. Rollout

- New env flag `ETSY_LISTING_SAMPLES_ENABLED` (default **false**). While false, the listings route answers
  `{ enabled: false }` and the card is hidden. The owner switches it on in Render only after Etsy approves the updated
  app purpose.
- Parts A, B and D ship with Etsy enabled as today.
- `render.yaml` and `.env.example` document the flag.

## 10. Error handling

Same principles as Phase 6:

- Etsy failing, a 429, a revoked key or a timeout never breaks keywords, charts or related queries, and never leaves a
  rejection unhandled.
- A failed sample fetch leaves the card "unavailable".
- Discover without supply still returns Trends- and season-based suggestions.

## 11. Testing (TDD)

- **Composite cache key.**
  - Same term with different category or location makes separate rows and separate requests.
  - The same key from two users makes one request.
- **Cutoffs.**
  - Counts: exactly 24 h is shown, 24 h + 1 ms is not.
  - Samples: exactly 6 h is shown, 6 h + 1 ms is not.
  - The purge deletes beyond each limit and keeps the boundary.
- **0 is data:** a count of 0 and an empty listing list are both real results.
- **HTTP.**
  - Filters are passed through to the request.
  - The samples call reads only the allowed fields.
  - A missing image gives `thumbnailUrl: null`.
  - Credentials never appear in errors.
- **Routes.**
  - Ownership and isolation.
  - The terms gate.
  - Disabled mode makes zero outbound calls.
  - The listings flag off makes zero outbound calls.
  - An invalid taxonomy returns 400.
  - `local` appears only for verified countries.
- **Discover.**
  - Excludes tracked and archived terms (normalized).
  - Drops high-supply candidates.
  - Applies the order rules.
  - Enforces the 10-new-terms-per-user-per-day cap.
  - Returns seasonal seeds only inside their windows (test with an injected clock).
- **Client.**
  - Demand-region fallback.
  - Insights built for the chosen region.
  - The client-side 6 h cutoff.
  - The Discover ordering helper.
  - Collapsed state persists.
- **Mutation-check** the cutoffs and the dedup as in Phase 6.
- **CI.** Run the suite in a `node:22` + Postgres 16 container before handing off; Linux has bitten us before.

## 12. Risks

- **Etsy approval of the updated purpose may be slow or refused.** Part C is behind its own flag; B and D only use counts.
- **Daily budget (5,000):** counts per (term × category × location), samples (2 requests per keyword every 3 h, only
  when opened), and Discover (≤ 10 new terms per user per day). Measure during QA. If it gets tight, lower refresh
  rates or ask developer@etsy.com for more.
- **`shop_location` silently returns 0 for unknown names.** Only verified names are offered.
- **Discover depends on the daily Google Trends collection,** which can be blocked. Seasonal seeds keep the strip
  useful.
- **In-memory queue, breaker and daily caps** assume a single server instance (already documented).
