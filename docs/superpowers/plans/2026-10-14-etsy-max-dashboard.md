# Etsy Data, Fully Used, and a Dashboard That Fits It — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project rule that overrides the generic template:** nobody except the repository owner runs `git add`, `git commit` or `git push`. Every task ends with a **Hand-off** step instead of a commit: leave the changes in the working tree and report. The owner commits (in English).

**Goal:** Use every Etsy datum the API terms allow (category and seller-country counts, real listing examples) plus Google Trends signals for keyword suggestions, on a re-laid-out, scrolling dashboard with a selectable demand region.

**Architecture:** The existing Etsy queue/rate-guard/circuit-breaker service is generalised from "one count per term" to "jobs" (counts keyed by term + category + seller country, and listing samples keyed by term + category), each with its own cache table and freshness rule (24 h for counts, 6 h for listings). Three routes expose it (`/api/supply`, `/api/keywords/:id/etsy-listings`, `/api/discover`). The client re-lays the dashboard as a normal scrolling page with a sticky keyword column, and adds a demand-region selector, a category select, a local-supply line, an "On Etsy now" card and a collapsible "Discover" strip.

**Tech Stack:** Node + Express + TypeScript, Drizzle ORM 0.45 + PostgreSQL, Zod 3, Vitest + Supertest (real Postgres), React 19 + Vite + Tailwind 3, Vitest (client, node environment).

**Spec:** `docs/superpowers/specs/2026-10-14-etsy-max-dashboard-design.md` — read it first. Also read `docs/design/direction.md` before touching any UI.

## Global Constraints

Every task's requirements implicitly include these, copied from the spec:

- Counts: never returned when older than **24 h** (`MAX_DISPLAY_AGE_MS`), refreshed after **12 h**. Listing samples: never returned when older than **6 h** (`SAMPLES_MAX_AGE_MS`), refreshed after **3 h** (`SAMPLES_REFRESH_AFTER_MS`). Boundaries inclusive (exactly the limit is shown); purge deletes strictly older rows.
- A count of `0` and an empty listing list are real results, never "missing" (no truthiness checks on counts).
- One row per cache key, overwritten; no history; no per-user Etsy columns.
- Listing samples expose only: `listingId`, `title`, `price`, `currency`, `url`, `thumbnailUrl`, `favorites`, `views` — as returned. **No statistics are computed from listing content**, nothing is ranked by favorites/views, nothing is sent to third parties or AI.
- Etsy requests go through the single shared queue: ≥ **220 ms** spacing, circuit opens 15 min after 3 consecutive failures, 60 s after a 429, 15 min when `x-remaining-today ≤ 200`. Credentials never in logs or errors.
- Etsy categories offered: **562, 66, 1250, 1633, 891, 374** only (null = all).
- `shop_location` only with a **verified English country name** from `src/config/etsyCountries.ts`; unknown codes get no local count.
- Discover: candidates = related queries with growth ≥ **500** (Breakout = growth > **5000** or literal "Breakout") + active season seeds; exclude every term the user already has (active or archived, compared with `normalizeTerm`); drop supply > **100,000**; at most **10** new candidate terms per user per UTC day reach Etsy; return at most **5**.
- `ETSY_LISTING_SAMPLES_ENABLED` defaults to **false**; while false the listings route answers `{ enabled: false, listings: [] }` and makes no Etsy call.
- With `ETSY_API_KEY`/`ETSY_API_SECRET` unset, or terms not accepted: no Etsy call and no Etsy UI (Discover still returns Trends/season suggestions with `supply: null`).
- Comments: English JSDoc. User strings only in `client/src/lib/i18n.ts` (ES + EN, neutral Spanish) or `legalContent.ts`. UI: tokens only, no hex, no opacity modifiers on token colors, literal Tailwind classes, color never the only carrier of meaning, respect `prefers-reduced-motion`.
- Zod v3; Drizzle 0.45; never hand-edit `drizzle/meta/*` — use `npm run db:generate`.
- Backend Vitest runs share one Postgres; when several agents run at once, run them through `bash .superpowers/dbtest.sh <cmd>` (the lock wrapper the controller creates).

## Review Focus

1. **A wrong country name silently returns 0.** Only verified names may reach Etsy; an unknown region yields `local: null`, never a fake `0`. Pinned in Tasks 4 and 8.
2. **Composite cache keys must not collide or leak.** Same term with another category/location is a different row and a different request; the same key from two users is one request. Pinned in Task 7.
3. **Listings freshness is 6 h, not 24 h,** on the server and in the client. Pinned in Tasks 7 and 10.
4. **The listings flag really is a kill switch:** flag off → zero Etsy calls even for owners with accepted terms. Pinned in Task 8.
5. **Discover never suggests what the user already tracks or archived** (normalized comparison), and the per-user daily cap bounds Etsy traffic. Pinned in Task 9.
6. **The plain-term API of `readSupply` keeps working** (route and existing tests read `readings.get(normalizeTerm(term))`). Pinned in Task 7.
7. **The re-laid-out page must not overlap** at 1440 px / 1024 px, and the keyword column keeps its own scroll. Verified in Task 11 (browser QA).

---

## File Structure

**Backend — create**

| File | Responsibility |
|---|---|
| `src/config/etsyCategories.ts` | The 6 allowed Etsy taxonomy ids. |
| `src/config/etsyCountries.ts` | Region code → verified Etsy country name. |
| `src/config/seasonalSeeds.ts` | Our season calendar and `activeSeasons(date, region)`. |
| `src/scripts/verifyEtsyCountries.ts` | One-off live check of the country names (not in CI). |
| `src/utils/relatedQueries.ts` | `latestRelatedQueriesFor` (moved from `trends.route.ts`). |
| `src/services/discover.service.ts` | Candidate building, daily quota, ranking. |
| `src/routes/etsyListings.route.ts` | `GET /api/keywords/:id/etsy-listings`. |
| `src/routes/discover.route.ts` | `GET /api/discover`. |

**Backend — modify:** `src/db/schema.ts`, `src/config/env.ts`, `src/services/etsyHttp.ts`, `src/services/etsySupply.service.ts`, `src/routes/supply.route.ts`, `src/routes/keywords.route.ts`, `src/routes/trends.route.ts`, `src/app.ts`, `tests/setup.ts`, `render.yaml`, `.env.example`, `src/config/terms.ts`.

**Client — create**

| File | Responsibility |
|---|---|
| `client/src/lib/etsyCategories.ts` | Client mirror of the 6 category ids (labels via i18n). |
| `client/src/lib/demandRegion.ts` | Resolve / persist the demand region. |
| `client/src/lib/useEtsyListings.ts` | Fetch + poll + 6 h cutoff for listing samples. |
| `client/src/lib/useDiscover.ts` | Fetch Discover suggestions; collapsed-state persistence. |
| `client/src/components/DemandRegionSelector.tsx` | Segmented control of active regions. |
| `client/src/components/EtsyCategorySelect.tsx` | Category `<select>` + PATCH. |
| `client/src/components/EtsyListings.tsx` | "On Etsy now" card. |
| `client/src/components/DiscoverStrip.tsx` | Collapsible suggestions strip. |

**Client — modify:** `client/src/lib/types.ts`, `client/src/lib/i18n.ts`, `client/src/lib/keywordInsights.ts`, `client/src/lib/useSupply.ts`, `client/src/components/SupplyStrip.tsx`, `client/src/pages/DashboardPage.tsx`, `client/src/lib/legalContent.ts`.

**Docs — modify:** `docs/adr/0001-overall-architecture.md`, `README.md`.

## Execution Order and Ownership

| Wave | Tasks | Notes |
|---|---|---|
| A | 1, 2 | Controller: schema, env flag, categories, shared client types and all i18n strings. |
| B (parallel) | 3, 4, 5, 6 | 3 = Etsy HTTP, 4 = countries (+ live check by controller), 5 = seasons, 6 = client layout + demand region. File-disjoint. |
| C | 7 | Service generalisation (needs 1, 3). |
| D (parallel) | 8, 9, 10 | 8 = supply/category/listings routes + CSP (needs 4, 7), 9 = Discover (needs 5, 7), 10 = client Etsy UI (needs 2, 6; consumes the API shapes defined here). |
| E | 11 | Controller: legal, docs, full verification, Linux CI replica, browser QA. |

Every agent: never run git write commands; touch only the files its task lists; report exact commands and real output.

---

### Task 1: Schema, env flag, categories, test cleanup

**Files:**
- Modify: `src/db/schema.ts`, `src/config/env.ts`, `tests/setup.ts`
- Create: `src/config/etsyCategories.ts`, `src/utils/termsAcceptance.ts`, `tests/db/etsyMax.schema.test.ts`
- Generated: `drizzle/0006_*.sql`, `drizzle/meta/*` (by `npm run db:generate`)

**Interfaces — Produces:**
- `etsySupply` columns `term`, `taxonomyId` (int, not null, default 0), `shopLocation` (text, not null, default ''), `listingCount`, `fetchedAt`; primary key (`term`, `taxonomyId`, `shopLocation`).
- `keywords.etsyTaxonomyId: number | null`.
- `etsyListingSamples` (`key` text PK, `payload` jsonb typed `ListingSampleRow[]`, `fetchedAt`).
- `ListingSampleRow` type exported from `schema.ts`.
- `env.ETSY_LISTING_SAMPLES_ENABLED: boolean` (default false).
- `ETSY_CATEGORY_IDS: readonly number[]`, `isEtsyCategoryId(id: number): boolean`.

- [ ] **Step 1: Write the failing test** — `tests/db/etsyMax.schema.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client.js";
import { etsyListingSamples, etsySupply, keywords, users } from "../../src/db/schema.js";
import { ETSY_CATEGORY_IDS, isEtsyCategoryId } from "../../src/config/etsyCategories.js";

describe("etsy_supply composite key", () => {
  test("the same term with another category or seller country is a separate row", async () => {
    await db.insert(etsySupply).values([
      { term: "boho clipart", listingCount: 73355 },
      { term: "boho clipart", taxonomyId: 562, listingCount: 43707 },
      { term: "boho clipart", shopLocation: "Mexico", listingCount: 104 },
    ]);
    const rows = await db.select().from(etsySupply).where(eq(etsySupply.term, "boho clipart"));
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.taxonomyId === 0 && r.shopLocation === "")?.listingCount).toBe(73355);
  });

  test("an upsert on the full key overwrites only that row", async () => {
    await db.insert(etsySupply).values({ term: "x", taxonomyId: 66, listingCount: 1 });
    await db
      .insert(etsySupply)
      .values({ term: "x", taxonomyId: 66, listingCount: 2 })
      .onConflictDoUpdate({ target: [etsySupply.term, etsySupply.taxonomyId, etsySupply.shopLocation], set: { listingCount: 2 } });
    const rows = await db.select().from(etsySupply).where(eq(etsySupply.term, "x"));
    expect(rows).toEqual([expect.objectContaining({ taxonomyId: 66, shopLocation: "", listingCount: 2 })]);
  });
});

describe("etsy_listing_samples", () => {
  test("stores a JSON payload per key, including an empty list", async () => {
    await db.insert(etsyListingSamples).values({ key: "none|0", payload: [], fetchedAt: new Date() });
    const [row] = await db.select().from(etsyListingSamples).where(eq(etsyListingSamples.key, "none|0"));
    expect(row!.payload).toEqual([]);
  });
});

describe("keywords.etsy_taxonomy_id", () => {
  test("defaults to null (all categories)", async () => {
    const [user] = await db.insert(users).values({ email: "tax@example.com", passwordHash: "x" }).returning();
    const [kw] = await db.insert(keywords).values({ userId: user!.id, term: "a" }).returning();
    expect(kw!.etsyTaxonomyId).toBeNull();
  });
});

describe("etsy categories", () => {
  test("offers exactly the six agreed categories", () => {
    expect([...ETSY_CATEGORY_IDS].sort((a, b) => a - b)).toEqual([66, 374, 562, 891, 1250, 1633]);
    expect(isEtsyCategoryId(562)).toBe(true);
    expect(isEtsyCategoryId(1)).toBe(false);
    expect(isEtsyCategoryId(0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `npx vitest run tests/db/etsyMax.schema.test.ts` → FAIL (missing exports / module).

- [ ] **Step 3: Implement**

`src/db/schema.ts`: add `primaryKey` and `jsonb` to the `drizzle-orm/pg-core` import. In `keywords`, add after `pinnedAt`:

```ts
    /** Etsy category used to scope this keyword's supply count and listing examples; null means all categories. */
    etsyTaxonomyId: integer("etsy_taxonomy_id"),
```

Replace the `etsySupply` table with:

```ts
/**
 * Latest Etsy active-listing count per normalized search term, Etsy category and seller country. Shared by all
 * users: one cache key costs one Etsy request per refresh window no matter how many people need it. `taxonomyId` 0
 * means all categories and `shopLocation` '' means sellers anywhere; non-null sentinels keep the primary key simple.
 * One row per key, overwritten on refresh — Etsy's terms forbid keeping its content longer than needed.
 */
export const etsySupply = pgTable(
  "etsy_supply",
  {
    term: text("term").notNull(),
    taxonomyId: integer("taxonomy_id").notNull().default(0),
    shopLocation: text("shop_location").notNull().default(""),
    listingCount: integer("listing_count").notNull(),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.term, table.taxonomyId, table.shopLocation] }),
  })
);

/** One Etsy listing as shown to users, exactly as Etsy returned it. Nothing else from the listing is kept. */
export interface ListingSampleRow {
  listingId: number;
  title: string;
  price: number | null;
  currency: string | null;
  url: string;
  thumbnailUrl: string | null;
  favorites: number;
  views: number;
}

/**
 * Up to five example listings per normalized term and Etsy category (`key` = "term|taxonomyId"), shown for at most
 * six hours and then deleted, as Etsy's terms require for listing content.
 */
export const etsyListingSamples = pgTable("etsy_listing_samples", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").$type<ListingSampleRow[]>().notNull(),
  fetchedAt: timestamp("fetched_at").notNull(),
});
```

`src/config/env.ts`, after `ETSY_API_SECRET`:

```ts
  // Listing examples ("On Etsy now") need Etsy's approval of the updated app purpose; off until the owner enables it.
  ETSY_LISTING_SAMPLES_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
```

`src/config/etsyCategories.ts`:

```ts
/**
 * Etsy taxonomy ids a keyword can be scoped to. A short fixed list of the top-level categories where digital
 * products are listed; Etsy's taxonomy filter includes every subcategory. The client mirrors this list in
 * `client/src/lib/etsyCategories.ts` (separate package) — keep both in sync.
 */
export const ETSY_CATEGORY_IDS: readonly number[] = [562, 66, 1250, 1633, 891, 374];

/** True for one of the offered Etsy categories. */
export function isEtsyCategoryId(id: number): boolean {
  return ETSY_CATEGORY_IDS.includes(id);
}
```

`tests/setup.ts`: add `etsy_listing_samples` to the TRUNCATE list (before `users`).

`src/utils/termsAcceptance.ts` (shared by the supply, listings and Discover routes; Tasks 8 and 9 run in parallel, so it is created here):

```ts
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { CURRENT_TERMS_VERSION } from "../config/terms.js";

/** True when the user has accepted the current Terms of Use and Privacy Policy; no Etsy work is done for anyone else. */
export async function hasAcceptedCurrentTerms(userId: number): Promise<boolean> {
  const [account] = await db.select({ termsVersion: users.termsVersion }).from(users).where(eq(users.id, userId));
  return account?.termsVersion === CURRENT_TERMS_VERSION;
}
```

Add to the test file:

```ts
import { hasAcceptedCurrentTerms } from "../../src/utils/termsAcceptance.js";
import { createTestUser } from "../helpers/factories.js";

describe("hasAcceptedCurrentTerms", () => {
  test("is true only for the current version", async () => {
    const accepted = await createTestUser({ email: "acc@example.com" });
    const never = await createTestUser({ email: "never@example.com", termsVersion: null });
    const old = await createTestUser({ email: "old@example.com", termsVersion: "2000-01-01" });
    expect(await hasAcceptedCurrentTerms(accepted.id)).toBe(true);
    expect(await hasAcceptedCurrentTerms(never.id)).toBe(false);
    expect(await hasAcceptedCurrentTerms(old.id)).toBe(false);
    expect(await hasAcceptedCurrentTerms(999999)).toBe(false);
  });
});
```

Run `npm run db:generate`. Open the new `drizzle/0006_*.sql` and confirm it only: replaces `etsy_supply`'s primary key (drop old PK, add the two columns with defaults, add the composite PK), adds `keywords.etsy_taxonomy_id`, and creates `etsy_listing_samples`. If drizzle-kit prompts about renames, answer "create column" (never rename). If the generated SQL cannot change the PK in place, it is acceptable to replace the `etsy_supply` statements in that new migration file by `DROP TABLE "etsy_supply";` + the full `CREATE TABLE` (the table is a cache) — only in the new migration file, never in `drizzle/meta`.

- [ ] **Step 4: Verify** — `npx vitest run tests/db/etsyMax.schema.test.ts` → PASS (5). `npx tsc --noEmit && npm run typecheck:test && npm run lint && npm test` → all pass. Then `npm run db:migrate` for the dev database.

- [ ] **Step 5: Hand-off** — report the migration file name and SQL. Do not commit.

---

### Task 2: Client groundwork — types, categories mirror, strings

**Files:**
- Modify: `client/src/lib/types.ts`, `client/src/lib/i18n.ts`
- Create: `client/src/lib/etsyCategories.ts`
- Fix literals if typecheck requires: `client/src/lib/useSupply.test.ts`, `client/src/lib/keywordInsights.test.ts`

**Interfaces — Produces (exact):**

`types.ts` — add to `Keyword`: `etsyTaxonomyId: number | null;`. Add `local: LocalSupply | null;` to `SupplyItem`. Append:

```ts
/** Supply from sellers based in one country, for the chosen demand region. */
export interface LocalSupply {
  region: string;
  count: number | null;
  fetchedAt: string | null;
  status: SupplyStatus;
}

/** One Etsy listing, exactly as Etsy returned it. */
export interface ListingSample {
  listingId: number;
  title: string;
  price: number | null;
  currency: string | null;
  url: string;
  thumbnailUrl: string | null;
  favorites: number;
  views: number;
}

/** GET /api/keywords/:id/etsy-listings. `listings` is null while not yet fetched. */
export interface ListingSamplesResponse {
  enabled: boolean;
  status?: SupplyStatus;
  fetchedAt?: string | null;
  listings: ListingSample[] | null;
}

export type SeasonEvent = "valentines" | "mothersDay" | "backToSchool" | "halloween" | "dayOfTheDead" | "christmas" | "weddings";

export type DiscoverOrigin =
  | { type: "related"; from: string; breakout: boolean }
  | { type: "season"; event: SeasonEvent; daysUntil: number };

export interface DiscoverSuggestion {
  term: string;
  origin: DiscoverOrigin;
  /** Etsy supply for the term (all categories, anywhere); null when Etsy is off or the daily cap was reached. */
  supply: { count: number | null; status: SupplyStatus } | null;
}

export interface DiscoverResponse {
  suggestions: DiscoverSuggestion[];
}
```

`client/src/lib/etsyCategories.ts`:

```ts
/** Mirror of `src/config/etsyCategories.ts` (separate package): the Etsy categories a keyword can be scoped to. */
export const ETSY_CATEGORIES = [
  { id: 562, key: "craftSupplies" },
  { id: 66, key: "art" },
  { id: 1250, key: "paperParty" },
  { id: 1633, key: "weddings" },
  { id: 891, key: "homeLiving" },
  { id: 374, key: "clothing" },
] as const;

export type EtsyCategoryKey = (typeof ETSY_CATEGORIES)[number]["key"];
```

`i18n.ts` — add to the `Translations` interface:

```ts
  etsy: {
    demandRegionLabel: string;
    categoryLabel: string;
    allCategories: string;
    categories: Record<"craftSupplies" | "art" | "paperParty" | "weddings" | "homeLiving" | "clothing", string>;
    localSupply: (count: string, country: string) => string;
    localHelp: string;
    listingsTitle: string;
    listingsLoading: string;
    listingsUnavailable: string;
    listingsEmpty: string;
    listingsUpdated: (hours: number) => string;
    favorites: (count: string) => string;
    views: (count: string) => string;
    openOnEtsy: (title: string) => string;
  };
  discover: {
    title: string;
    caveat: string;
    show: string;
    hide: string;
    empty: string;
    track: string;
    tracking: string;
    fromRelated: (term: string) => string;
    breakout: string;
    season: (event: string, days: number) => string;
    events: Record<"valentines" | "mothersDay" | "backToSchool" | "halloween" | "dayOfTheDead" | "christmas" | "weddings", string>;
    supplyUnknown: string;
  };
```

Spanish block (inside `es`):

```ts
    etsy: {
      demandRegionLabel: "Demanda en",
      categoryLabel: "Categoría en Etsy",
      allCategories: "Todas las categorías",
      categories: {
        craftSupplies: "Materiales y herramientas",
        art: "Arte y coleccionables",
        paperParty: "Papelería y fiestas",
        weddings: "Bodas",
        homeLiving: "Hogar",
        clothing: "Ropa",
      },
      localSupply: (count, country) => `${count} de vendedores en ${country}`,
      localHelp: "Cuántos listings vienen de vendedores ubicados en ese país. Mide competencia local, no demanda.",
      listingsTitle: "En Etsy ahora",
      listingsLoading: "Consultando Etsy…",
      listingsUnavailable: "Ejemplos de Etsy no disponibles",
      listingsEmpty: "No hay listings activos en Etsy para este término.",
      listingsUpdated: (hours) => (hours < 1 ? "Actualizado hace menos de 1 h" : `Actualizado hace ${hours} h`),
      favorites: (count) => `${count} favoritos`,
      views: (count) => `${count} vistas`,
      openOnEtsy: (title) => `Abrir "${title}" en Etsy`,
    },
    discover: {
      title: "Descubrir",
      caveat: "Búsquedas en alza y fechas de temporada, filtradas por saturación en Etsy. No son ventas comprobadas.",
      show: "Mostrar",
      hide: "Ocultar",
      empty: "Aún no hay sugerencias. Aparecen después de la próxima recolección de tendencias.",
      track: "Seguir",
      tracking: "Agregando...",
      fromRelated: (term) => `Sube junto a "${term}"`,
      breakout: "Breakout",
      season: (event, days) => (days === 0 ? `Temporada: ${event} (ya)` : `Temporada: ${event} en ${days} días`),
      events: {
        valentines: "San Valentín",
        mothersDay: "Día de las Madres",
        backToSchool: "Regreso a clases",
        halloween: "Halloween",
        dayOfTheDead: "Día de Muertos",
        christmas: "Navidad",
        weddings: "Temporada de bodas",
      },
      supplyUnknown: "Oferta sin consultar",
    },
```

English block (inside `en`):

```ts
    etsy: {
      demandRegionLabel: "Demand in",
      categoryLabel: "Etsy category",
      allCategories: "All categories",
      categories: {
        craftSupplies: "Craft Supplies & Tools",
        art: "Art & Collectibles",
        paperParty: "Paper & Party Supplies",
        weddings: "Weddings",
        homeLiving: "Home & Living",
        clothing: "Clothing",
      },
      localSupply: (count, country) => `${count} from sellers in ${country}`,
      localHelp: "How many listings come from sellers located in that country. It measures local competition, not demand.",
      listingsTitle: "On Etsy now",
      listingsLoading: "Checking Etsy…",
      listingsUnavailable: "Etsy examples unavailable",
      listingsEmpty: "No active Etsy listings for this term.",
      listingsUpdated: (hours) => (hours < 1 ? "Updated less than 1 h ago" : `Updated ${hours} h ago`),
      favorites: (count) => `${count} favorites`,
      views: (count) => `${count} views`,
      openOnEtsy: (title) => `Open "${title}" on Etsy`,
    },
    discover: {
      title: "Discover",
      caveat: "Rising searches and seasonal dates, filtered by Etsy saturation. These are not proven sales.",
      show: "Show",
      hide: "Hide",
      empty: "No suggestions yet. They appear after the next trend collection.",
      track: "Track",
      tracking: "Adding...",
      fromRelated: (term) => `Rising with "${term}"`,
      breakout: "Breakout",
      season: (event, days) => (days === 0 ? `Season: ${event} (now)` : `Season: ${event} in ${days} days`),
      events: {
        valentines: "Valentine's Day",
        mothersDay: "Mother's Day",
        backToSchool: "Back to school",
        halloween: "Halloween",
        dayOfTheDead: "Day of the Dead",
        christmas: "Christmas",
        weddings: "Wedding season",
      },
      supplyUnknown: "Supply not checked",
    },
```

- [ ] **Step 1:** Make the edits above.
- [ ] **Step 2: Verify** — `npm run typecheck --prefix client` (fix any `SupplyItem` / `Keyword` literal in tests by adding `local: null` / `etsyTaxonomyId: null`), `npm run lint --prefix client` (3 baseline warnings only), `npm test --prefix client`.
- [ ] **Step 3: Hand-off** — report the literals you had to touch.

---

### Task 3: Etsy HTTP — count filters and listing samples

**Files:**
- Modify: `src/services/etsyHttp.ts`
- Modify (append tests): `tests/services/etsyHttp.test.ts`

**Interfaces — Produces:**
- `interface EtsyCountFilters { taxonomyId?: number; shopLocation?: string }`
- `type EtsyFetcher = (term: string, filters?: EtsyCountFilters) => Promise<EtsyFetchResult>`
- `fetchListingCountFromEtsy(term, fetchImpl = fetch, filters: EtsyCountFilters = {})` — **the second parameter stays `fetchImpl`** (existing tests depend on it).
- `interface EtsySamplesResult { listings: ListingSampleRow[]; remainingToday: number | null }`
- `type EtsySamplesFetcher = (term: string, taxonomyId?: number) => Promise<EtsySamplesResult>`
- `fetchListingSamplesFromEtsy(term, taxonomyId?: number, fetchImpl = fetch)`
- `SAMPLE_SIZE = 5`

- [ ] **Step 1: Write the failing tests** — append to `tests/services/etsyHttp.test.ts` (it already has `asFetch`, `ok`, the env setup); add `fetchListingSamplesFromEtsy` to its import:

```ts
describe("fetchListingCountFromEtsy filters", () => {
  test("passes taxonomy_id and shop_location only when given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ count: 104 }));
    await fetchListingCountFromEtsy("boho clipart", asFetch(fetchImpl), { taxonomyId: 562, shopLocation: "United States" });
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://openapi.etsy.com/v3/application/listings/active?keywords=boho%20clipart&limit=1&taxonomy_id=562&shop_location=United%20States"
    );
  });
});

describe("fetchListingSamplesFromEtsy", () => {
  const search = (ids: number[]) => ok({ count: ids.length, results: ids.map((listing_id) => ({ listing_id })) }, { "x-remaining-today": "4000" });
  const listing = (id: number, extra: Record<string, unknown> = {}) => ({
    listing_id: id,
    title: `Listing ${id}`,
    url: `https://www.etsy.com/listing/${id}`,
    price: { amount: 425, divisor: 100, currency_code: "USD" },
    num_favorers: 50,
    views: 211,
    tags: ["should", "not", "leak"],
    description: "long text that must not be kept",
    images: [{ url_170x135: `https://i.etsystatic.com/${id}/170.jpg`, url_fullxfull: "big" }],
    ...extra,
  });

  test("searches 5 by relevance, then batches with images, keeping only the allowed fields in search order", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(search([3, 1]))
      .mockResolvedValueOnce(ok({ count: 2, results: [listing(1), listing(3)] }, { "x-remaining-today": "3998" }));

    const result = await fetchListingSamplesFromEtsy("boho clipart", 562, asFetch(fetchImpl));

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://openapi.etsy.com/v3/application/listings/active?keywords=boho%20clipart&limit=5&sort_on=score&taxonomy_id=562"
    );
    expect(fetchImpl.mock.calls[1]![0]).toBe("https://openapi.etsy.com/v3/application/listings/batch?listing_ids=3%2C1&includes=Images");
    expect(result.remainingToday).toBe(3998);
    expect(result.listings.map((l) => l.listingId)).toEqual([3, 1]);
    expect(result.listings[0]).toEqual({
      listingId: 3,
      title: "Listing 3",
      price: 4.25,
      currency: "USD",
      url: "https://www.etsy.com/listing/3",
      thumbnailUrl: "https://i.etsystatic.com/3/170.jpg",
      favorites: 50,
      views: 211,
    });
  });

  test("an empty search is a real empty result and makes no batch call", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(search([]));
    const result = await fetchListingSamplesFromEtsy("zzqxjkwv", undefined, asFetch(fetchImpl));
    expect(result.listings).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("a listing without images gets a null thumbnail; one without title or url is skipped", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(search([1, 2]))
      .mockResolvedValueOnce(ok({ count: 2, results: [listing(1, { images: [] }), listing(2, { title: undefined })] }));
    const result = await fetchListingSamplesFromEtsy("x", undefined, asFetch(fetchImpl));
    expect(result.listings).toEqual([expect.objectContaining({ listingId: 1, thumbnailUrl: null })]);
  });

  test("errors never reveal the credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));
    const error = await fetchListingSamplesFromEtsy("x", undefined, asFetch(fetchImpl)).catch((e) => e);
    expect(error).toBeInstanceOf(EtsyHttpError);
    expect(error.status).toBe(403);
    expect(String(error.message)).not.toContain("test-key");
    expect(String(error.message)).not.toContain("test-secret");
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/services/etsyHttp.test.ts` → FAIL (filters ignored / function missing).

- [ ] **Step 3: Implement** — replace `src/services/etsyHttp.ts` with:

```ts
import { env } from "../config/env.js";
import type { ListingSampleRow } from "../db/schema.js";

export const REQUEST_TIMEOUT_MS = 10_000;
/** Listings shown per keyword in "On Etsy now". */
export const SAMPLE_SIZE = 5;
const API_BASE = "https://openapi.etsy.com/v3/application";

export interface EtsyFetchResult {
  count: number;
  /** Requests left in Etsy's daily budget, from `x-remaining-today`; null when the header is absent. */
  remainingToday: number | null;
}

/** Optional narrowing of a count: an Etsy category (subcategories included) and the sellers' country name. */
export interface EtsyCountFilters {
  taxonomyId?: number;
  shopLocation?: string;
}

export type EtsyFetcher = (term: string, filters?: EtsyCountFilters) => Promise<EtsyFetchResult>;

export interface EtsySamplesResult {
  listings: ListingSampleRow[];
  remainingToday: number | null;
}

export type EtsySamplesFetcher = (term: string, taxonomyId?: number) => Promise<EtsySamplesResult>;

/** A failed Etsy call. `status` is the HTTP status, or null for network errors, timeouts and unreadable bodies. */
export class EtsyHttpError extends Error {
  readonly status: number | null;

  constructor(status: number | null, message: string) {
    super(message);
    this.name = "EtsyHttpError";
    this.status = status;
  }
}

/**
 * One GET to Etsy's API with the 10 s timeout. The credentials go only into the request header and never into an
 * error message. Returns the parsed body and the remaining daily budget.
 */
async function etsyGet(url: string, fetchImpl: typeof fetch): Promise<{ body: unknown; remainingToday: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { "x-api-key": `${env.ETSY_API_KEY}:${env.ETSY_API_SECRET}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new EtsyHttpError(response.status, `Etsy responded with HTTP ${response.status}`);
    const body: unknown = await response.json();
    const header = response.headers.get("x-remaining-today");
    const remaining = header === null || header.trim() === "" ? Number.NaN : Number(header);
    return { body, remainingToday: Number.isFinite(remaining) ? remaining : null };
  } catch (err) {
    if (err instanceof EtsyHttpError) throw err;
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw new EtsyHttpError(null, timedOut ? "Etsy request timed out" : "Etsy request failed");
  } finally {
    clearTimeout(timer);
  }
}

function searchUrl(term: string, limit: number, extra: Record<string, string | number | undefined>): string {
  let url = `${API_BASE}/listings/active?keywords=${encodeURIComponent(term)}&limit=${limit}`;
  for (const [name, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") url += `&${name}=${encodeURIComponent(String(value))}`;
  }
  return url;
}

/**
 * Asks Etsy how many active listings match a term, optionally within one category or from sellers in one country.
 * Requests a single listing (`limit=1`) and reads only `count`: Etsy's terms require asking for the minimum data.
 */
export async function fetchListingCountFromEtsy(
  term: string,
  fetchImpl: typeof fetch = fetch,
  filters: EtsyCountFilters = {},
): Promise<EtsyFetchResult> {
  const { body, remainingToday } = await etsyGet(
    searchUrl(term, 1, { taxonomy_id: filters.taxonomyId, shop_location: filters.shopLocation }),
    fetchImpl,
  );
  const count = (body as { count?: unknown } | null)?.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    throw new EtsyHttpError(null, "Etsy response had no valid count");
  }
  return { count, remainingToday };
}

function toSample(raw: unknown): ListingSampleRow | null {
  const item = raw as Record<string, unknown> | null;
  if (!item || typeof item.listing_id !== "number" || typeof item.title !== "string" || typeof item.url !== "string") {
    return null;
  }
  const price = item.price as { amount?: unknown; divisor?: unknown; currency_code?: unknown } | undefined;
  const amount = typeof price?.amount === "number" && typeof price?.divisor === "number" && price.divisor > 0
    ? price.amount / price.divisor
    : null;
  const images = Array.isArray(item.images) ? item.images : [];
  const thumb = (images[0] as { url_170x135?: unknown } | undefined)?.url_170x135;
  return {
    listingId: item.listing_id,
    title: item.title,
    price: amount,
    currency: typeof price?.currency_code === "string" ? price.currency_code : null,
    url: item.url,
    thumbnailUrl: typeof thumb === "string" ? thumb : null,
    favorites: typeof item.num_favorers === "number" ? item.num_favorers : 0,
    views: typeof item.views === "number" ? item.views : 0,
  };
}

/**
 * Up to five listings for a term, ordered by Etsy's own relevance (`sort_on=score`), with a thumbnail. Two calls:
 * the search returns ids, and the batch endpoint returns those listings with their images (the search endpoint
 * ignores `includes`). Only the fields of `ListingSampleRow` are kept; everything else in the response is discarded.
 */
export async function fetchListingSamplesFromEtsy(
  term: string,
  taxonomyId?: number,
  fetchImpl: typeof fetch = fetch,
): Promise<EtsySamplesResult> {
  const first = await etsyGet(searchUrl(term, SAMPLE_SIZE, { sort_on: "score", taxonomy_id: taxonomyId }), fetchImpl);
  const results = (first.body as { results?: unknown } | null)?.results;
  const ids = (Array.isArray(results) ? results : [])
    .map((r) => (r as { listing_id?: unknown } | null)?.listing_id)
    .filter((id): id is number => typeof id === "number");
  if (ids.length === 0) return { listings: [], remainingToday: first.remainingToday };

  const second = await etsyGet(
    `${API_BASE}/listings/batch?listing_ids=${encodeURIComponent(ids.join(","))}&includes=Images`,
    fetchImpl,
  );
  const batch = (second.body as { results?: unknown } | null)?.results;
  const byId = new Map<number, ListingSampleRow>();
  for (const raw of Array.isArray(batch) ? batch : []) {
    const sample = toSample(raw);
    if (sample) byId.set(sample.listingId, sample);
  }
  return {
    listings: ids.map((id) => byId.get(id)).filter((s): s is ListingSampleRow => s !== undefined),
    remainingToday: second.remainingToday ?? first.remainingToday,
  };
}
```

- [ ] **Step 4: Verify** — `npx vitest run tests/services/etsyHttp.test.ts` → all pass (old + new). `npx tsc --noEmit && npm run typecheck:test && npm run lint`. (The service still compiles: its default fetcher wraps `fetchListingCountFromEtsy(term)`.)
- [ ] **Step 5: Hand-off.**

---

### Task 4: Etsy country names (verified)

**Files:**
- Create: `src/config/etsyCountries.ts`, `src/scripts/verifyEtsyCountries.ts`, `tests/config/etsyCountries.test.ts`

**Interfaces — Produces:** `ETSY_COUNTRY_NAMES: Readonly<Record<string, string>>`, `etsyCountryFor(region: string): string | null`.

- [ ] **Step 1: Write the failing test** — `tests/config/etsyCountries.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { ETSY_COUNTRY_NAMES, etsyCountryFor } from "../../src/config/etsyCountries.js";

describe("etsyCountryFor", () => {
  test("maps a region code to the English name Etsy expects", () => {
    expect(etsyCountryFor("MX")).toBe("Mexico");
    expect(etsyCountryFor("US")).toBe("United States");
    expect(etsyCountryFor("KR")).toBe("South Korea");
  });

  test("worldwide and unknown codes have no country, never a guess", () => {
    expect(etsyCountryFor("")).toBeNull();
    expect(etsyCountryFor("XX")).toBeNull();
    expect(etsyCountryFor("mx")).toBeNull();
  });

  test("never contains a code or an empty name (Etsy answers 0 to those, which would look like data)", () => {
    for (const [code, name] of Object.entries(ETSY_COUNTRY_NAMES)) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(name.length).toBeGreaterThan(3);
      expect(name).not.toBe(code);
    }
  });
});
```

- [ ] **Step 2: Run to see it fail** → module not found.

- [ ] **Step 3: Implement** — `src/config/etsyCountries.ts`:

```ts
/**
 * Region code → country name as Etsy's `shop_location` filter expects it. Etsy needs the English name; a code or a
 * name it does not recognise is not rejected, it silently returns a count of 0 — indistinguishable from real data.
 * So this list holds only names confirmed against the live API by `src/scripts/verifyEtsyCountries.ts`; a region
 * missing here simply gets no local count.
 */
export const ETSY_COUNTRY_NAMES: Readonly<Record<string, string>> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AU: "Australia",
  DE: "Germany",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  MX: "Mexico",
  BR: "Brazil",
  AR: "Argentina",
  CO: "Colombia",
  CL: "Chile",
  PT: "Portugal",
  IE: "Ireland",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  CH: "Switzerland",
  AT: "Austria",
  BE: "Belgium",
  JP: "Japan",
  KR: "South Korea",
  IN: "India",
  SG: "Singapore",
  NZ: "New Zealand",
  ZA: "South Africa",
};

/** The verified Etsy country name for a region code, or null for worldwide ("") and unknown codes. */
export function etsyCountryFor(region: string): string | null {
  return Object.prototype.hasOwnProperty.call(ETSY_COUNTRY_NAMES, region) ? ETSY_COUNTRY_NAMES[region]! : null;
}
```

`src/scripts/verifyEtsyCountries.ts`:

```ts
import "dotenv/config";
import { ETSY_COUNTRY_NAMES } from "../config/etsyCountries.js";
import { fetchListingCountFromEtsy } from "../services/etsyHttp.js";

/**
 * One-off live check of `ETSY_COUNTRY_NAMES`: every name must return a count above 0 for the broad term "clipart".
 * A name returning 0 is not recognised by Etsy and must be removed from the map. Needs ETSY_API_KEY/ETSY_API_SECRET;
 * makes one request per country, spaced 300 ms apart. Not part of CI.
 */
async function main() {
  const failures: string[] = [];
  for (const [code, name] of Object.entries(ETSY_COUNTRY_NAMES)) {
    const { count } = await fetchListingCountFromEtsy("clipart", fetch, { shopLocation: name });
    console.log(`${code}\t${name}\t${count}`);
    if (count === 0) failures.push(`${code} (${name})`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (failures.length > 0) {
    console.error(`Not recognised by Etsy: ${failures.join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
```

- [ ] **Step 4: Verify** — `npx vitest run tests/config/etsyCountries.test.ts` → PASS; typecheck/lint. **Do not run the script** (needs the owner's key); the controller runs `npx tsx src/scripts/verifyEtsyCountries.ts` once and removes any failing entry.
- [ ] **Step 5: Hand-off.**

---

### Task 5: Season calendar

**Files:** Create `src/config/seasonalSeeds.ts`, `tests/config/seasonalSeeds.test.ts`.

**Interfaces — Produces:** `type SeasonEvent` (same 7 values as the client type), `SEASON_LEAD_DAYS = 56`, `interface ActiveSeason { event: SeasonEvent; daysUntil: number; seeds: string[] }`, `activeSeasons(today: Date, region: string): ActiveSeason[]` (sorted by `daysUntil` ascending, then event name).

- [ ] **Step 1: Write the failing test** — `tests/config/seasonalSeeds.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { activeSeasons } from "../../src/config/seasonalSeeds.js";

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
const events = (iso: string, region = "") => activeSeasons(day(iso), region).map((s) => s.event);

describe("activeSeasons", () => {
  test("a single-day event shows from 8 weeks before until the day itself", () => {
    expect(events("2026-09-05")).toContain("halloween"); // 56 days before Oct 31
    expect(events("2026-09-04")).not.toContain("halloween");
    expect(events("2026-10-31")).toContain("halloween");
    expect(events("2026-11-01")).not.toContain("halloween");
  });

  test("daysUntil counts whole days and is 0 on the day", () => {
    const halloween = activeSeasons(day("2026-10-10"), "").find((s) => s.event === "halloween")!;
    expect(halloween.daysUntil).toBe(21);
    expect(activeSeasons(day("2026-10-31"), "").find((s) => s.event === "halloween")!.daysUntil).toBe(0);
  });

  test("looks into next year near the turn of the year (Valentine's from December)", () => {
    expect(events("2026-12-20")).toContain("valentines");
    expect(events("2026-12-20")).toContain("christmas");
  });

  test("Mother's Day is May 10 for Mexico and the second Sunday of May elsewhere", () => {
    expect(activeSeasons(day("2027-05-01"), "MX").find((s) => s.event === "mothersDay")!.daysUntil).toBe(9);
    // second Sunday of May 2027 is May 9
    expect(activeSeasons(day("2027-05-01"), "US").find((s) => s.event === "mothersDay")!.daysUntil).toBe(8);
  });

  test("wedding season runs Apr 1 – Sep 30 with the same lead window and 0 days inside it", () => {
    expect(events("2027-02-03")).not.toContain("weddings");
    expect(activeSeasons(day("2027-02-04"), "").find((s) => s.event === "weddings")!.daysUntil).toBe(56);
    expect(activeSeasons(day("2027-07-15"), "").find((s) => s.event === "weddings")!.daysUntil).toBe(0);
    expect(events("2027-10-01")).not.toContain("weddings");
  });

  test("every active season carries English and Spanish seeds", () => {
    for (const season of activeSeasons(day("2026-10-20"), "")) {
      expect(season.seeds.length).toBeGreaterThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 2: Run to see it fail.**

- [ ] **Step 3: Implement** — `src/config/seasonalSeeds.ts`:

```ts
/**
 * Our own calendar of selling seasons for digital products, used by Discover. This is not Etsy data. Each season
 * shows from SEASON_LEAD_DAYS before it starts until it ends, with seed search terms in English and Spanish.
 */
export type SeasonEvent = "valentines" | "mothersDay" | "backToSchool" | "halloween" | "dayOfTheDead" | "christmas" | "weddings";

export const SEASON_LEAD_DAYS = 56;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ActiveSeason {
  event: SeasonEvent;
  /** Whole days until the season starts; 0 on its first day and while it lasts. */
  daysUntil: number;
  seeds: string[];
}

interface Season {
  event: SeasonEvent;
  /** First and last day of the season in a given year (UTC midnight). */
  span: (year: number, region: string) => [Date, Date];
  seeds: string[];
}

const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const single = (month: number, day: number) => (year: number): [Date, Date] => [utc(year, month, day), utc(year, month, day)];

/** Second Sunday of May (US and most countries' Mother's Day). */
function secondSundayOfMay(year: number): Date {
  const first = utc(year, 5, 1);
  const offset = (7 - first.getUTCDay()) % 7;
  return utc(year, 5, 1 + offset + 7);
}

const SEASONS: Season[] = [
  { event: "valentines", span: single(2, 14), seeds: ["valentines clipart", "valentine png", "san valentin clipart"] },
  {
    event: "mothersDay",
    span: (year, region) => {
      const date = region === "MX" ? utc(year, 5, 10) : secondSundayOfMay(year);
      return [date, date];
    },
    seeds: ["mothers day png", "mothers day clipart", "dia de las madres png"],
  },
  { event: "backToSchool", span: single(8, 1), seeds: ["back to school clipart", "teacher clipart", "regreso a clases png"] },
  { event: "halloween", span: single(10, 31), seeds: ["halloween clipart", "spooky png", "clipart halloween"] },
  { event: "dayOfTheDead", span: single(11, 2), seeds: ["day of the dead clipart", "dia de muertos png", "calavera clipart"] },
  { event: "christmas", span: single(12, 25), seeds: ["christmas clipart", "christmas png", "clipart navidad"] },
  {
    event: "weddings",
    span: (year) => [utc(year, 4, 1), utc(year, 9, 30)],
    seeds: ["wedding clipart", "wedding invitation png", "boda clipart"],
  },
];

/** Seasons whose window (lead period through last day) contains `today`, nearest first. */
export function activeSeasons(today: Date, region: string): ActiveSeason[] {
  const day = utc(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate()).getTime();
  const active: ActiveSeason[] = [];
  for (const season of SEASONS) {
    for (const year of [today.getUTCFullYear(), today.getUTCFullYear() + 1]) {
      const [start, end] = season.span(year, region);
      const windowStart = start.getTime() - SEASON_LEAD_DAYS * DAY_MS;
      if (day >= windowStart && day <= end.getTime()) {
        active.push({ event: season.event, daysUntil: Math.max(0, Math.round((start.getTime() - day) / DAY_MS)), seeds: season.seeds });
        break;
      }
    }
  }
  return active.sort((a, b) => a.daysUntil - b.daysUntil || a.event.localeCompare(b.event));
}
```

- [ ] **Step 4: Verify** — `npx vitest run tests/config/seasonalSeeds.test.ts` → PASS (6); typecheck/lint.
- [ ] **Step 5: Hand-off.**

---

### Task 6: Client — scrolling layout and demand-region selector

**Files:**
- Create: `client/src/lib/demandRegion.ts`, `client/src/lib/demandRegion.test.ts`, `client/src/components/DemandRegionSelector.tsx`
- Modify: `client/src/pages/DashboardPage.tsx`, `client/src/lib/keywordInsights.ts` (doc comment only), `client/src/components/SupplyStrip.tsx` (add one optional prop)

**Interfaces:**
- Consumes: `regionLabel(t, code)`, `t.etsy.demandRegionLabel` (Task 2).
- Produces: `resolveDemandRegion(stored: string | null, active: string[]): string | undefined`, `loadDemandRegion(): string | null`, `saveDemandRegion(region: string): void` (key `inntena_demand_region`, try/catch), `DemandRegionSelector({ regions, value, onChange })`, `SupplyStrip` prop `demandControl?: ReactNode`.

- [ ] **Step 1: Write the failing test** — `client/src/lib/demandRegion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveDemandRegion } from "./demandRegion";

describe("resolveDemandRegion", () => {
  it("keeps the stored region while it is active", () => {
    expect(resolveDemandRegion("MX", ["", "US", "MX"])).toBe("MX");
  });
  it("falls back to the first active region when the stored one is gone or missing", () => {
    expect(resolveDemandRegion("FR", ["US", "MX"])).toBe("US");
    expect(resolveDemandRegion(null, ["", "US"])).toBe("");
  });
  it("treats worldwide ('') as a valid stored region", () => {
    expect(resolveDemandRegion("", ["US", ""])).toBe("");
  });
  it("is undefined when no region is active", () => {
    expect(resolveDemandRegion("US", [])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npm test --prefix client -- demandRegion`.

- [ ] **Step 3: Implement**

`client/src/lib/demandRegion.ts`:

```ts
const STORAGE_KEY = "inntena_demand_region";

/** The region that drives demand, the verdict and Discover: the stored choice while it is active, else the first active one. */
export function resolveDemandRegion(stored: string | null, active: string[]): string | undefined {
  if (stored !== null && active.includes(stored)) return stored;
  return active[0];
}

/** The last chosen demand region, or null when none was stored or storage is unavailable. */
export function loadDemandRegion(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Remembers the chosen demand region; storage failures are ignored (it is only a convenience). */
export function saveDemandRegion(region: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, region);
  } catch {
    // Private mode or blocked storage: the choice simply is not remembered.
  }
}
```

`client/src/components/DemandRegionSelector.tsx`:

```tsx
import { useLanguage } from "../context/LanguageContext";
import { regionLabel } from "../lib/i18n";

interface DemandRegionSelectorProps {
  regions: string[];
  value: string;
  onChange: (region: string) => void;
}

/** Segmented control choosing which active region the demand figure and verdict refer to. Hidden with one region. */
export function DemandRegionSelector({ regions, value, onChange }: DemandRegionSelectorProps) {
  const { t } = useLanguage();
  if (regions.length < 2) return null;
  return (
    <div role="radiogroup" aria-label={t.etsy.demandRegionLabel} className="flex flex-wrap gap-1">
      {regions.map((region) => {
        const selected = region === value;
        return (
          <button
            key={region || "worldwide"}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(region)}
            className={`rounded border px-2 py-0.5 text-xs ${
              selected ? "border-primary-line bg-primary-tint text-primary" : "border-border text-text-muted hover:text-text"
            }`}
          >
            {regionLabel(t, region)}
          </button>
        );
      })}
    </div>
  );
}
```

`SupplyStrip.tsx`: add `demandControl?: ReactNode;` to `SupplyStripProps` (JSDoc: "Optional control rendered in the demand block, e.g. the demand-region selector."), destructure it, and pass `action={demandControl}` to the demand `Block`.

`keywordInsights.ts`: change the doc comment of `buildInsights` from "(the first active one)" to "(the demand region the user chose)". No code change.

`DashboardPage.tsx`:
1. Imports: `DemandRegionSelector`; `loadDemandRegion`, `resolveDemandRegion`, `saveDemandRegion`.
2. State: `const [storedDemandRegion, setStoredDemandRegion] = useState<string | null>(loadDemandRegion);` and a handler `handleDemandRegionChange(region)` that sets it and calls `saveDemandRegion`.
3. Replace `const demandRegion = activeRegions[0];` with `const demandRegion = resolveDemandRegion(storedDemandRegion, activeRegions);`.
4. Update the component JSDoc: the page now scrolls normally; the keyword column is sticky with its own scroll.
5. Replace the whole `return (...)` with:

```tsx
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {user && !user.emailVerified && <VerificationBanner />}
      <Navbar />
      <main className="flex flex-1 flex-col gap-4 px-6 py-4">
        <RegionTabs
          added={addedRegions}
          active={activeRegions}
          onToggle={handleToggleActive}
          onRemove={handleRemoveRegion}
          onAdd={handleAddRegion}
        />
        <div className="grid items-start gap-6 md:grid-cols-[320px_1fr]">
          {/* Sticky, viewport-tall column: a long keyword list scrolls inside it while the page scrolls on the right. */}
          <div className="flex min-h-0 flex-col gap-4 md:sticky md:top-4 md:max-h-[calc(100vh-2rem)]">
            <KeywordForm
              onCreated={() => refetchKeywords()}
              limitReached={atLimit}
              maxKeywords={maxKeywords ?? undefined}
            />
            {keywords.length > 0 && (
              <div className="flex shrink-0 flex-col gap-2">
                {maxKeywords !== null && (
                  <p className={`text-xs ${atLimit ? "text-primary" : "text-text-muted"}`}>
                    {t.keywordList.limitCounter(keywords.length, maxKeywords)}
                    {atLimit && <> · {t.keywordList.limitReached(maxKeywords)}</>}
                  </p>
                )}
                <KeywordListToolbar
                  query={query}
                  onQueryChange={setQuery}
                  sortMode={sortMode}
                  onSortModeChange={handleSortModeChange}
                />
              </div>
            )}
            <div className="keyword-scroll min-h-0 flex-1 overflow-y-auto">
              {loadingKeywords ? (
                <p className="text-sm text-text-muted">{t.dashboard.loadingKeywords}</p>
              ) : keywordsError ? (
                <p className="text-sm text-primary">{t.dashboard.keywordsError}</p>
              ) : (
                <KeywordList
                  keywords={arranged}
                  query={query}
                  insights={insights}
                  activeRegions={activeRegions}
                  onChanged={() => refetchKeywords()}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            {selectedId === null || activeRegions.length === 0 || loadingTrends ? (
              <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
                <p className="py-16 text-center text-sm text-text-muted">
                  {selectedId === null
                    ? t.dashboard.selectKeywordPrompt
                    : activeRegions.length === 0
                      ? t.dashboard.activateRegionPrompt
                      : t.dashboard.loadingTrends}
                </p>
              </section>
            ) : (
              <>
                <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="truncate font-display text-xl font-semibold text-text">{selectedKeyword?.term}</h1>
                      <p className="text-xs text-text-muted">
                        {selectedKeyword && selectedKeyword.regions.length > 0
                          ? t.dashboard.dataAvailableIn(selectedKeyword.regions.map((code) => regionLabel(t, code)).join(", "))
                          : t.dashboard.noDataYet}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-muted">{t.dashboard.showingDays(countChartDays(visibleSeries))}</span>
                      <ChartRangeSelector value={range} onChange={handleRangeChange} />
                    </div>
                  </div>
                  {selectedInsight && demandRegion !== undefined && (
                    <div className="mt-4">
                      <SupplyStrip
                        insight={selectedInsight}
                        regionName={regionLabel(t, demandRegion)}
                        demandControl={
                          <DemandRegionSelector regions={activeRegions} value={demandRegion} onChange={handleDemandRegionChange} />
                        }
                      />
                    </div>
                  )}
                </section>
                <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">{t.dashboard.trend}</h2>
                  <div className="h-[320px]">
                    <TrendChart series={visibleSeries} />
                  </div>
                </section>
                <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">{t.dashboard.relatedRising}</h2>
                  <RelatedQueriesList columns={relatedColumns} />
                </section>
              </>
            )}
          </div>
        </div>
      </main>
      <AppFooter showEtsyNotice={etsyEnabled} />
    </div>
  );
```

Check that `TrendChart` fills a fixed-height parent (it uses a `ResponsiveContainer`); if it sets its own height, keep its behaviour and drop the `h-[320px]` wrapper class to a `min-h-[260px]` as before.

- [ ] **Step 4: Verify** — `npm test --prefix client`, `npm run typecheck --prefix client`, `npm run lint --prefix client` (3 baseline warnings). Do not start a dev server; the controller checks the layout in the browser.
- [ ] **Step 5: Hand-off.**

---

### Task 7: Generalise the Etsy service (composite count keys + listing samples)

**Files:**
- Modify: `src/services/etsySupply.service.ts`
- Modify (append tests): `tests/services/etsySupply.service.test.ts`

**Interfaces:**
- Consumes: `etsySupply` (composite key), `etsyListingSamples`, `ListingSampleRow` (Task 1); `EtsyFetcher` with optional filters, `EtsySamplesFetcher`, `fetchListingCountFromEtsy(term, fetchImpl, filters)`, `fetchListingSamplesFromEtsy(term, taxonomyId)` (Task 3).
- Produces (keep every existing export and behaviour):
  - `interface SupplyKey { term: string; taxonomyId?: number | null; shopLocation?: string | null }`
  - `supplyKeyId(key: SupplyKey | string): string` — the normalized term alone when there are no filters (so `readings.get(normalizeTerm(term))` keeps working), otherwise `"term|taxonomyId|shopLocation"`.
  - `samplesKeyId(term: string, taxonomyId?: number | null): string` — `"term|taxonomyId"` (0 = all).
  - `SAMPLES_REFRESH_AFTER_MS = 3 h`, `SAMPLES_MAX_AGE_MS = 6 h`.
  - `interface SamplesReading { listings: ListingSampleRow[] | null; fetchedAt: Date | null; status: SupplyStatus }`
  - Service methods: `isEnabled()`, `readSupply(keys: (SupplyKey | string)[]): Promise<Map<string, SupplyReading>>` (keyed by `supplyKeyId`), `readListingSamples(term: string, taxonomyId?: number | null): Promise<SamplesReading>`, `onIdle()`.
  - New dep: `samplesFetcher?: EtsySamplesFetcher`.
  - The count fetcher is called as `fetcher(term)` when the key has no filters (existing tests assert that exact call), and as `fetcher(term, { taxonomyId?, shopLocation? })` otherwise (unset filters omitted).

- [ ] **Step 1: Write the failing tests** — append to `tests/services/etsySupply.service.test.ts` (reuse its `T0`, `HOUR`, `setup`, `failWith`; extend `setup` to accept and return a `samplesFetcher` mock defaulting to `async () => ({ listings: [sample(1)], remainingToday: 4000 })`, and pass it to `createEtsySupplyService`). Add imports: `etsyListingSamples` from schema; `SAMPLES_MAX_AGE_MS`, `SAMPLES_REFRESH_AFTER_MS`, `samplesKeyId`, `supplyKeyId` from the service; `type ListingSampleRow` from schema.

```ts
const sample = (id: number): ListingSampleRow => ({
  listingId: id, title: `L${id}`, price: 4.25, currency: "USD", url: `https://www.etsy.com/listing/${id}`,
  thumbnailUrl: null, favorites: 0, views: 0,
});

describe("supply keys", () => {
  test("a key without filters is the bare normalized term; filters make a distinct id", () => {
    expect(supplyKeyId("  Boho  Clipart ")).toBe("boho clipart");
    expect(supplyKeyId({ term: "Boho Clipart", taxonomyId: null, shopLocation: null })).toBe("boho clipart");
    expect(supplyKeyId({ term: "boho clipart", taxonomyId: 562 })).toBe("boho clipart|562|");
    expect(supplyKeyId({ term: "boho clipart", shopLocation: "Mexico" })).toBe("boho clipart|0|Mexico");
    expect(samplesKeyId("Boho Clipart")).toBe("boho clipart|0");
    expect(samplesKeyId("boho clipart", 562)).toBe("boho clipart|562");
  });

  test("the same term with different filters is fetched separately, with the filters passed through", async () => {
    const { service, fetcher } = setup();
    const readings = await service.readSupply([
      "boho clipart",
      { term: "boho clipart", taxonomyId: 562 },
      { term: "boho clipart", taxonomyId: 562, shopLocation: "Mexico" },
    ]);
    await service.onIdle();
    expect(readings.size).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenCalledWith("boho clipart");
    expect(fetcher).toHaveBeenCalledWith("boho clipart", { taxonomyId: 562 });
    expect(fetcher).toHaveBeenCalledWith("boho clipart", { taxonomyId: 562, shopLocation: "Mexico" });
    const rows = await db.select().from(etsySupply);
    expect(rows).toHaveLength(3);
  });

  test("a stored filtered count is served under its own id and not under the plain term", async () => {
    await db.insert(etsySupply).values({ term: "boho clipart", taxonomyId: 562, listingCount: 0, fetchedAt: new Date(T0 - HOUR) });
    const { service, fetcher } = setup();
    const readings = await service.readSupply([{ term: "boho clipart", taxonomyId: 562 }]);
    await service.onIdle();
    expect(readings.get("boho clipart|562|")).toMatchObject({ count: 0, status: "fresh" });
    expect(readings.has("boho clipart")).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("listing samples", () => {
  async function seedSamples(key: string, listings: ListingSampleRow[], ageMs: number) {
    await db.insert(etsyListingSamples).values({ key, payload: listings, fetchedAt: new Date(T0 - ageMs) });
  }

  test("missing samples are fetched in the background and reported as refreshing", async () => {
    const { service, samplesFetcher } = setup();
    const reading = await service.readListingSamples("Boho Clipart", 562);
    await service.onIdle();
    expect(reading).toEqual({ listings: null, fetchedAt: null, status: "refreshing" });
    expect(samplesFetcher).toHaveBeenCalledWith("boho clipart", 562);
    const [row] = await db.select().from(etsyListingSamples);
    expect(row).toMatchObject({ key: "boho clipart|562", payload: [sample(1)] });
  });

  test("shows samples exactly 6 h old, hides them a millisecond later, and refreshes after 3 h", async () => {
    await seedSamples("edge|0", [sample(2)], SAMPLES_MAX_AGE_MS);
    await seedSamples("old|0", [sample(3)], SAMPLES_MAX_AGE_MS + 1);
    await seedSamples("young|0", [sample(4)], SAMPLES_REFRESH_AFTER_MS);
    const { service, samplesFetcher } = setup();

    expect(await service.readListingSamples("edge")).toMatchObject({ listings: [sample(2)], status: "fresh" });
    expect(await service.readListingSamples("old")).toMatchObject({ listings: null, status: "refreshing" });
    expect(await service.readListingSamples("young")).toMatchObject({ listings: [sample(4)], status: "fresh" });
    await service.onIdle();

    const fetched = samplesFetcher.mock.calls.map((call) => call[0]);
    expect(fetched).toContain("edge"); // older than 3 h → background refresh
    expect(fetched).toContain("old");
    expect(fetched).not.toContain("young"); // exactly 3 h is still fresh enough
  });

  test("an empty listing list is a real result", async () => {
    const { service, samplesFetcher } = setup();
    samplesFetcher.mockResolvedValue({ listings: [], remainingToday: 4000 });
    await service.readListingSamples("zzqxjkwv");
    await service.onIdle();
    expect(await service.readListingSamples("zzqxjkwv")).toMatchObject({ listings: [], status: "fresh" });
  });

  test("samples share the breaker: failures count and open the circuit for counts too", async () => {
    const { service, samplesFetcher, fetcher } = setup();
    samplesFetcher.mockImplementation(failWith(500));
    for (const term of ["a", "b", "c"]) {
      await service.readListingSamples(term);
      await service.onIdle();
    }
    const reading = (await service.readSupply(["fresh term"])).get("fresh term")!;
    await service.onIdle();
    expect(reading.status).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("is inert when disabled", async () => {
    const { service, samplesFetcher } = setup({ enabled: false });
    expect(await service.readListingSamples("x")).toEqual({ listings: null, fetchedAt: null, status: "unavailable" });
    await service.onIdle();
    expect(samplesFetcher).not.toHaveBeenCalled();
  });

  test("the purge deletes samples older than 6 h and counts older than 24 h, keeping both boundaries", async () => {
    await seedSamples("keep|0", [sample(1)], SAMPLES_MAX_AGE_MS);
    await seedSamples("drop|0", [sample(1)], SAMPLES_MAX_AGE_MS + 1);
    const { service } = setup();
    await service.readSupply(["anything"]); // the first read triggers a purge
    await service.onIdle();
    const keys = (await db.select().from(etsyListingSamples)).map((r) => r.key).sort();
    expect(keys).toEqual(["keep|0"]);
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/services/etsySupply.service.test.ts` → the new tests fail.

- [ ] **Step 3: Implement** — rewrite `src/services/etsySupply.service.ts` keeping the existing constants, `SupplyStatus`, `SupplyReading`, the breaker rules, `purgeStale`'s fire-and-forget pattern, the drain/startDrain structure and its comments. The changes:

```ts
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { etsyListingSamples as samplesTable, etsySupply as etsySupplyTable, type ListingSampleRow } from "../db/schema.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { normalizeTerm } from "../utils/normalizeTerm.js";
import {
  EtsyHttpError,
  fetchListingCountFromEtsy,
  fetchListingSamplesFromEtsy,
  type EtsyCountFilters,
  type EtsyFetcher,
  type EtsySamplesFetcher,
} from "./etsyHttp.js";

// ...existing constants unchanged...

/** A stored listing sample older than this is refreshed in the background. */
export const SAMPLES_REFRESH_AFTER_MS = 3 * 60 * 60 * 1000;
/** Etsy's terms forbid showing listing content more than 6 h older than Etsy itself, so older samples are never returned. */
export const SAMPLES_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** What a count is about: a term, optionally within one Etsy category and/or from sellers in one country. */
export interface SupplyKey {
  term: string;
  taxonomyId?: number | null;
  shopLocation?: string | null;
}

export interface SamplesReading {
  /** The listings, or null when unknown or too old to show. An empty array is a real result. */
  listings: ListingSampleRow[] | null;
  fetchedAt: Date | null;
  status: SupplyStatus;
}

/**
 * Cache id of a count. A key without filters is just the normalized term — the id plain-term callers already use —
 * and a filtered key is "term|taxonomyId|shopLocation" (0 / '' meaning "all").
 */
export function supplyKeyId(key: SupplyKey | string): string {
  const k = typeof key === "string" ? { term: key } : key;
  const term = normalizeTerm(k.term);
  const taxonomyId = k.taxonomyId ?? 0;
  const shopLocation = k.shopLocation ?? "";
  return taxonomyId === 0 && shopLocation === "" ? term : `${term}|${taxonomyId}|${shopLocation}`;
}

/** Cache id of a listing sample: "term|taxonomyId" (0 meaning all categories). */
export function samplesKeyId(term: string, taxonomyId?: number | null): string {
  return `${normalizeTerm(term)}|${taxonomyId ?? 0}`;
}

type Job =
  | { kind: "count"; id: string; term: string; taxonomyId: number; shopLocation: string }
  | { kind: "samples"; id: string; term: string; taxonomyId: number };

interface ServiceDeps {
  db?: typeof db;
  fetcher?: EtsyFetcher;
  samplesFetcher?: EtsySamplesFetcher;
  isEnabled?: () => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}
```

Inside `createEtsySupplyService`:

- `const fetcher: EtsyFetcher = deps.fetcher ?? ((term, filters) => (filters ? fetchListingCountFromEtsy(term, fetch, filters) : fetchListingCountFromEtsy(term)));` — the unfiltered call stays exactly `fetchListingCountFromEtsy(term)`, which the existing `/api/supply` route tests assert.
- `const samplesFetcher: EtsySamplesFetcher = deps.samplesFetcher ?? ((term, taxonomyId) => fetchListingSamplesFromEtsy(term, taxonomyId));`
- Queue state becomes `const queued = new Set<string>(); const queue: Job[] = [];` (dedup by `job.id`; count ids and samples ids never collide because samples ids always contain one `|` and a count id with filters contains two — prefix the dedup key with `job.kind` to be safe: `${job.kind}:${job.id}`).
- `purgeStale` deletes from both tables:

```ts
        await database.delete(etsySupplyTable).where(lt(etsySupplyTable.fetchedAt, new Date(now() - MAX_DISPLAY_AGE_MS)));
        await database.delete(samplesTable).where(lt(samplesTable.fetchedAt, new Date(now() - SAMPLES_MAX_AGE_MS)));
```

- `refreshOne(job: Job)`:

```ts
  async function refreshOne(job: Job): Promise<void> {
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = now();

    let remainingToday: number | null;
    try {
      if (job.kind === "count") {
        const filters: EtsyCountFilters = {};
        if (job.taxonomyId !== 0) filters.taxonomyId = job.taxonomyId;
        if (job.shopLocation !== "") filters.shopLocation = job.shopLocation;
        const result = Object.keys(filters).length === 0 ? await fetcher(job.term) : await fetcher(job.term, filters);
        remainingToday = result.remainingToday;
        await storeCount(job, result.count);
      } else {
        const result = await samplesFetcher(job.term, job.taxonomyId === 0 ? undefined : job.taxonomyId);
        remainingToday = result.remainingToday;
        await storeSamples(job, result.listings);
      }
    } catch (err) {
      // (existing failure handling: EtsyHttpError status, 429 backoff, failure counter, breaker, logger.warn with
      //  { term: job.term, kind: job.kind, status, error }) — a storage error is logged with logger.error and
      //  must not count as an Etsy failure: distinguish it with a small StoreError class thrown by storeCount/storeSamples.
      return;
    } finally {
      // A samples job makes two requests; spacing the next request from the end of this job keeps both under the limit.
      lastRequestAt = now();
    }

    consecutiveFailures = 0;
    if (remainingToday !== null && remainingToday <= DAILY_RESERVE) {
      openCircuit(CIRCUIT_OPEN_MS);
      logger.warn("Etsy daily request budget nearly spent; pausing refreshes", { remainingToday });
    }
  }
```

with

```ts
  /** Thrown when Etsy answered but the database write failed: logged, never counted as an Etsy failure. */
  class StoreError extends Error {}

  async function storeCount(job: Extract<Job, { kind: "count" }>, count: number): Promise<void> {
    const fetchedAt = new Date(now());
    try {
      await database
        .insert(etsySupplyTable)
        .values({ term: job.term, taxonomyId: job.taxonomyId, shopLocation: job.shopLocation, listingCount: count, fetchedAt })
        .onConflictDoUpdate({
          target: [etsySupplyTable.term, etsySupplyTable.taxonomyId, etsySupplyTable.shopLocation],
          set: { listingCount: count, fetchedAt },
        });
    } catch (err) {
      throw new StoreError(err instanceof Error ? err.message : String(err));
    }
  }

  async function storeSamples(job: Extract<Job, { kind: "samples" }>, listings: ListingSampleRow[]): Promise<void> {
    const fetchedAt = new Date(now());
    try {
      await database
        .insert(samplesTable)
        .values({ key: job.id, payload: listings, fetchedAt })
        .onConflictDoUpdate({ target: samplesTable.key, set: { payload: listings, fetchedAt } });
    } catch (err) {
      throw new StoreError(err instanceof Error ? err.message : String(err));
    }
  }
```

In the `catch` of `refreshOne`: `if (err instanceof StoreError) { logger.error("Could not store Etsy data", { term: job.term, kind: job.kind, error: err.message }); return; }` before the existing Etsy-failure branch (so a storage failure neither trips the breaker nor resets the failure counter — same as today's behaviour).

- `drain`, `startDrain`, `schedule(jobs: Job[])` work on jobs; the dedup key is `${job.kind}:${job.id}`.
- `maybePurge()` = `if (now() - lastPurgeAt >= PURGE_INTERVAL_MS) purgeStale();`
- `readSupply`:

```ts
  async function readSupply(keys: (SupplyKey | string)[]): Promise<Map<string, SupplyReading>> {
    const readings = new Map<string, SupplyReading>();
    if (!isEnabled()) return readings;

    const jobs = new Map<string, Extract<Job, { kind: "count" }>>();
    for (const raw of keys) {
      const key = typeof raw === "string" ? { term: raw } : raw;
      const term = normalizeTerm(key.term);
      if (term === "") continue;
      const id = supplyKeyId(key);
      jobs.set(id, { kind: "count", id, term, taxonomyId: key.taxonomyId ?? 0, shopLocation: key.shopLocation ?? "" });
    }
    if (jobs.size === 0) return readings;
    maybePurge();

    const terms = [...new Set([...jobs.values()].map((job) => job.term))];
    const rows = await database.select().from(etsySupplyTable).where(inArray(etsySupplyTable.term, terms));
    const byId = new Map(rows.map((row) => [supplyKeyId({ term: row.term, taxonomyId: row.taxonomyId, shopLocation: row.shopLocation }), row]));
    const toRefresh: Job[] = [];

    for (const job of jobs.values()) {
      const row = byId.get(job.id);
      const age = row ? now() - row.fetchedAt.getTime() : Number.POSITIVE_INFINITY;
      if (row && age <= MAX_DISPLAY_AGE_MS) {
        readings.set(job.id, { count: row.listingCount, fetchedAt: row.fetchedAt, status: "fresh" });
        if (age > REFRESH_AFTER_MS) toRefresh.push(job);
      } else {
        readings.set(job.id, { count: null, fetchedAt: null, status: circuitOpen() ? "unavailable" : "refreshing" });
        toRefresh.push(job);
      }
    }

    if (!circuitOpen()) schedule(toRefresh);
    return readings;
  }
```

- `readListingSamples`:

```ts
  /** Up to five example listings for a term, from the cache; queues a refresh when missing or older than 3 h. */
  async function readListingSamples(rawTerm: string, taxonomyId: number | null = null): Promise<SamplesReading> {
    const unavailable: SamplesReading = { listings: null, fetchedAt: null, status: "unavailable" };
    if (!isEnabled()) return unavailable;
    const term = normalizeTerm(rawTerm);
    if (term === "") return unavailable;
    maybePurge();

    const id = samplesKeyId(term, taxonomyId);
    const job: Job = { kind: "samples", id, term, taxonomyId: taxonomyId ?? 0 };
    const [row] = await database.select().from(samplesTable).where(eq(samplesTable.key, id));
    const age = row ? now() - row.fetchedAt.getTime() : Number.POSITIVE_INFINITY;

    if (row && age <= SAMPLES_MAX_AGE_MS) {
      if (age > SAMPLES_REFRESH_AFTER_MS && !circuitOpen()) schedule([job]);
      return { listings: row.payload, fetchedAt: row.fetchedAt, status: "fresh" };
    }
    if (circuitOpen()) return unavailable;
    schedule([job]);
    return { listings: null, fetchedAt: null, status: "refreshing" };
  }
```

- Return `{ isEnabled, readSupply, readListingSamples, onIdle }`. Update the factory's JSDoc to describe both job kinds and their freshness rules. Remove the now-unused `and` import if lint flags it.

- [ ] **Step 4: Verify** — `npx vitest run tests/services/etsySupply.service.test.ts` → all old and new tests pass. Mutation-check: change `age <= SAMPLES_MAX_AGE_MS` to `<` → the 6 h boundary test must fail; restore. `npx tsc --noEmit && npm run typecheck:test && npm run lint && npm test` (the existing `/api/supply` route keeps working unchanged).
- [ ] **Step 5: Hand-off.**

---

### Task 8: Routes — supply by category and country, category PATCH, listing samples, CSP

**Files:**
- Modify: `src/routes/supply.route.ts`, `src/routes/keywords.route.ts`, `src/app.ts`, `render.yaml`, `.env.example`
- Create: `src/routes/etsyListings.route.ts`, `tests/supply/etsyListings.route.test.ts`, `tests/keywords/etsyCategory.test.ts`
- Modify (append/adjust): `tests/supply/supply.route.test.ts`

**Interfaces:**
- Consumes: `readSupply`, `readListingSamples`, `supplyKeyId`, `isEnabled` (Task 7); `etsyCountryFor` (Task 4); `isEtsyCategoryId`, `env.ETSY_LISTING_SAMPLES_ENABLED`, `hasAcceptedCurrentTerms` (Task 1).
- Produces (HTTP):
  - `GET /api/supply?region=XX` → `{ enabled, items: [{ keywordId, count, fetchedAt, status, local: { region, count, fetchedAt, status } | null }] }`. `count` is for the keyword's category. `local` is non-null only when `region` has a verified country.
  - `PATCH /api/keywords/:id/etsy-category` `{ taxonomyId: number | null }` → the updated keyword (200), 400 for an invalid body or id outside the 6 categories, 404 when not owned / archived.
  - `GET /api/keywords/:id/etsy-listings` → 404 when not owned or archived; `{ enabled: false, listings: [] }` when the flag is off, Etsy is off or terms are not accepted (no Etsy call); otherwise `{ enabled: true, status, fetchedAt, listings }` with `listings` possibly null (not fetched yet) or `[]`.

- [ ] **Step 1: Write the failing tests**

Adjust `tests/supply/supply.route.test.ts`: every existing `items` expectation that uses `toEqual` with full objects gains `local: null`. Then append:

```ts
describe("GET /api/supply with categories and seller country", () => {
  test("uses the keyword's category for the main count", async () => {
    const user = await createTestUser({ email: "cat@example.com" });
    await db.insert(keywords).values({ userId: user.id, term: "boho clipart", etsyTaxonomyId: 562 });
    const agent = await loginAgent("cat@example.com");
    await agent.get("/api/supply");
    await etsySupplyService.onIdle();
    expect(fetchMock).toHaveBeenCalledWith("boho clipart", fetch, { taxonomyId: 562 });
  });

  test("adds a local count only for a verified country, and none for worldwide or unknown codes", async () => {
    const user = await createTestUser({ email: "local@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "boho clipart" }).returning();
    await db.insert(etsySupply).values([
      { term: "boho clipart", listingCount: 73355, fetchedAt: new Date() },
      { term: "boho clipart", shopLocation: "Mexico", listingCount: 0, fetchedAt: new Date() },
    ]);
    const agent = await loginAgent("local@example.com");

    const mx = await agent.get("/api/supply?region=MX");
    expect(mx.body.items[0]).toMatchObject({ keywordId: kw!.id, count: 73355, local: { region: "MX", count: 0, status: "fresh" } });

    const ww = await agent.get("/api/supply?region=");
    expect(ww.body.items[0].local).toBeNull();
    const xx = await agent.get("/api/supply?region=XX");
    expect(xx.body.items[0].local).toBeNull();
    await etsySupplyService.onIdle();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), fetch, expect.objectContaining({ shopLocation: "XX" }));
  });
});
```

(Through the singleton, a filtered count calls `fetchListingCountFromEtsy(term, fetch, filters)` and an unfiltered one calls `fetchListingCountFromEtsy(term)` — the mock records those exact arguments.)

`tests/keywords/etsyCategory.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { keywords } from "../../src/db/schema.js";

async function loginAgent(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "password123" });
  return agent;
}

describe("PATCH /api/keywords/:id/etsy-category", () => {
  test("sets and clears an allowed category", async () => {
    const user = await createTestUser({ email: "c1@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "a" }).returning();
    const agent = await loginAgent("c1@example.com");
    const set = await agent.patch(`/api/keywords/${kw!.id}/etsy-category`).send({ taxonomyId: 562 });
    expect(set.status).toBe(200);
    expect(set.body.etsyTaxonomyId).toBe(562);
    const cleared = await agent.patch(`/api/keywords/${kw!.id}/etsy-category`).send({ taxonomyId: null });
    expect(cleared.body.etsyTaxonomyId).toBeNull();
    const list = await agent.get("/api/keywords");
    expect(list.body[0].etsyTaxonomyId).toBeNull();
  });

  test("rejects categories outside the offered list and malformed bodies", async () => {
    const user = await createTestUser({ email: "c2@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "a" }).returning();
    const agent = await loginAgent("c2@example.com");
    for (const body of [{ taxonomyId: 1 }, { taxonomyId: "562" }, { taxonomyId: 1.5 }, {}]) {
      expect((await agent.patch(`/api/keywords/${kw!.id}/etsy-category`).send(body)).status).toBe(400);
    }
  });

  test("404 for another user's keyword or an archived one", async () => {
    const owner = await createTestUser({ email: "c3@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: owner.id, term: "a" }).returning();
    const [archived] = await db.insert(keywords).values({ userId: owner.id, term: "b", removedAt: new Date() }).returning();
    await createTestUser({ email: "c4@example.com" });
    const intruder = await loginAgent("c4@example.com");
    expect((await intruder.patch(`/api/keywords/${kw!.id}/etsy-category`).send({ taxonomyId: 66 })).status).toBe(404);
    const ownerAgent = await loginAgent("c3@example.com");
    expect((await ownerAgent.patch(`/api/keywords/${archived!.id}/etsy-category`).send({ taxonomyId: 66 })).status).toBe(404);
  });
});
```

`tests/supply/etsyListings.route.test.ts` — same mocking scaffold as `supply.route.test.ts` but mocking `fetchListingSamplesFromEtsy` (and `fetchListingCountFromEtsy`), plus toggling `env.ETSY_LISTING_SAMPLES_ENABLED` in `beforeEach` (`true`) / `afterEach` (restore). Tests:

```ts
describe("GET /api/keywords/:id/etsy-listings", () => {
  test("requires a session", async () => {
    expect((await request(app).get("/api/keywords/1/etsy-listings")).status).toBe(401);
  });

  test("the flag off is a kill switch: disabled answer and no Etsy call", async () => {
    env.ETSY_LISTING_SAMPLES_ENABLED = false;
    const user = await createTestUser({ email: "f@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "boho clipart" }).returning();
    const res = await (await loginAgent("f@example.com")).get(`/api/keywords/${kw!.id}/etsy-listings`);
    await etsySupplyService.onIdle();
    expect(res.body).toEqual({ enabled: false, listings: [] });
    expect(samplesMock).not.toHaveBeenCalled();
  });

  test("no Etsy call for a user who has not accepted the current terms", async () => {
    const user = await createTestUser({ email: "t@example.com", termsVersion: null });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "x" }).returning();
    const res = await (await loginAgent("t@example.com")).get(`/api/keywords/${kw!.id}/etsy-listings`);
    await etsySupplyService.onIdle();
    expect(res.body).toEqual({ enabled: false, listings: [] });
    expect(samplesMock).not.toHaveBeenCalled();
  });

  test("404 for another user's keyword and for an archived keyword", async () => {
    const owner = await createTestUser({ email: "o@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: owner.id, term: "x" }).returning();
    const [archived] = await db.insert(keywords).values({ userId: owner.id, term: "y", removedAt: new Date() }).returning();
    await createTestUser({ email: "i@example.com" });
    expect((await (await loginAgent("i@example.com")).get(`/api/keywords/${kw!.id}/etsy-listings`)).status).toBe(404);
    expect((await (await loginAgent("o@example.com")).get(`/api/keywords/${archived!.id}/etsy-listings`)).status).toBe(404);
  });

  test("returns cached samples for the keyword's category, and never ones older than 6 h", async () => {
    const user = await createTestUser({ email: "s@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "Boho Clipart", etsyTaxonomyId: 562 }).returning();
    const listing = { listingId: 1, title: "L", price: 4, currency: "USD", url: "https://www.etsy.com/listing/1", thumbnailUrl: null, favorites: 0, views: 0 };
    await db.insert(etsyListingSamples).values({ key: "boho clipart|562", payload: [listing], fetchedAt: new Date(Date.now() - 1 * HOUR) });
    const agent = await loginAgent("s@example.com");
    const fresh = await agent.get(`/api/keywords/${kw!.id}/etsy-listings`);
    expect(fresh.body).toMatchObject({ enabled: true, status: "fresh", listings: [listing] });

    await db.update(etsyListingSamples).set({ fetchedAt: new Date(Date.now() - 7 * HOUR) });
    const stale = await agent.get(`/api/keywords/${kw!.id}/etsy-listings`);
    await etsySupplyService.onIdle();
    expect(stale.body.listings).toBeNull();
    expect(samplesMock).toHaveBeenCalledWith("boho clipart", 562);
  });

  test("an Etsy failure leaves the card unavailable instead of failing the request", async () => {
    samplesMock.mockRejectedValue(new etsyHttp.EtsyHttpError(500, "down"));
    const user = await createTestUser({ email: "e@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "x" }).returning();
    const res = await (await loginAgent("e@example.com")).get(`/api/keywords/${kw!.id}/etsy-listings`);
    await etsySupplyService.onIdle();
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });
});
```

(Define `samplesMock = vi.mocked(etsyHttp.fetchListingSamplesFromEtsy)`, reset it in `beforeEach` with `mockResolvedValue({ listings: [], remainingToday: 4000 })`. Note: the singleton's breaker state persists across tests in this file; keep failing tests last or reset by awaiting `onIdle()` and not exceeding 2 failures in the file.)

- [ ] **Step 2: Run to see them fail** — `npx vitest run tests/supply tests/keywords/etsyCategory.test.ts`.

- [ ] **Step 3: Implement**

`src/routes/supply.route.ts` — replace the terms check with `hasAcceptedCurrentTerms(req.userId!)` (drop the now-unused imports), select `etsyTaxonomyId` too, and build keys/items:

```ts
    const region = typeof req.query.region === "string" ? req.query.region : "";
    const country = etsyCountryFor(region);

    const own = await db
      .select({ id: keywords.id, term: keywords.term, taxonomyId: keywords.etsyTaxonomyId })
      .from(keywords)
      .where(and(eq(keywords.userId, req.userId!), isNull(keywords.removedAt)));

    const keys: SupplyKey[] = own.flatMap((keyword) => {
      const main: SupplyKey = { term: keyword.term, taxonomyId: keyword.taxonomyId };
      return country ? [main, { ...main, shopLocation: country }] : [main];
    });
    const readings = await etsySupplyService.readSupply(keys);

    res.json({
      enabled: true,
      items: own.map((keyword) => {
        const main = readings.get(supplyKeyId({ term: keyword.term, taxonomyId: keyword.taxonomyId }));
        const local = country
          ? readings.get(supplyKeyId({ term: keyword.term, taxonomyId: keyword.taxonomyId, shopLocation: country }))
          : undefined;
        return {
          keywordId: keyword.id,
          count: main?.count ?? null,
          fetchedAt: main?.fetchedAt?.toISOString() ?? null,
          status: main?.status ?? "unavailable",
          local: country
            ? { region, count: local?.count ?? null, fetchedAt: local?.fetchedAt?.toISOString() ?? null, status: local?.status ?? "unavailable" }
            : null,
        };
      }),
    });
```

Update the route's JSDoc: category-scoped count, `?region` for the verified local count.

`src/routes/keywords.route.ts` — next to `pinSchema`, add:

```ts
const etsyCategorySchema = z.object({
  taxonomyId: z
    .number()
    .int()
    .nullable()
    .refine((id) => id === null || isEtsyCategoryId(id), { message: "Categoría de Etsy no válida" }),
});
```

and after the `PATCH /:id/pin` handler, the same handler shape for `PATCH /:id/etsy-category` (JSDoc: "sets or clears the Etsy category that scopes an active keyword's supply count and listing examples"), with `.set({ etsyTaxonomyId: parsed.data.taxonomyId })`. Note: `z.object({ taxonomyId: ... })` with a missing field fails because `nullable()` does not allow `undefined` — that is the required 400 for `{}`.

`src/routes/etsyListings.route.ts`:

```ts
import { Router } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { keywords } from "../db/schema.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { etsySupplyService } from "../services/etsySupply.service.js";
import { hasAcceptedCurrentTerms } from "../utils/termsAcceptance.js";

export const etsyListingsRouter = Router();

/**
 * GET /api/keywords/:id/etsy-listings — up to five current Etsy listings for one of the caller's active keywords,
 * exactly as Etsy returned them, never older than 6 h (Etsy's terms for listing content). Off unless
 * ETSY_LISTING_SAMPLES_ENABLED is set, Etsy credentials exist and the user accepted the current terms; in every
 * "off" case no Etsy request is made. Answers from the cache and refreshes in the background.
 */
etsyListingsRouter.get("/:id/etsy-listings", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const [keyword] = await db
      .select({ term: keywords.term, taxonomyId: keywords.etsyTaxonomyId })
      .from(keywords)
      .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!), isNull(keywords.removedAt)));
    if (!keyword) {
      res.status(404).json({ error: "Keyword no encontrada" });
      return;
    }

    if (!env.ETSY_LISTING_SAMPLES_ENABLED || !etsySupplyService.isEnabled() || !(await hasAcceptedCurrentTerms(req.userId!))) {
      res.json({ enabled: false, listings: [] });
      return;
    }

    const reading = await etsySupplyService.readListingSamples(keyword.term, keyword.taxonomyId);
    res.json({
      enabled: true,
      status: reading.status,
      fetchedAt: reading.fetchedAt?.toISOString() ?? null,
      listings: reading.listings,
    });
  } catch (err) {
    next(err);
  }
});
```

`src/app.ts`: import `etsyListingsRouter` and mount it **before** `keywordsRouter`: `app.use("/api/keywords", etsyListingsRouter);`. In the CSP: `imgSrc: ["'self'", "data:", "https://i.etsystatic.com"],` and extend the CSP comment ("…and Etsy listing thumbnails, which the visitor's browser loads straight from Etsy's CDN").

`render.yaml` (after the Etsy keys):

```yaml
      # Listing examples ("On Etsy now"). Leave false until Etsy approves the updated app purpose.
      - key: ETSY_LISTING_SAMPLES_ENABLED
        value: "false"
```

`.env.example` (after `ETSY_API_SECRET=`):

```
# Shows up to 5 Etsy listings per keyword. Keep false until Etsy approves your app's purpose for it.
ETSY_LISTING_SAMPLES_ENABLED=false
```

- [ ] **Step 4: Verify** — `npx vitest run tests/supply tests/keywords` → all pass. `npx tsc --noEmit && npm run typecheck:test && npm run lint && npm test`.
- [ ] **Step 5: Hand-off.**

---

### Task 9: Discover — suggestions from Trends and seasons, filtered by Etsy supply

**Files:**
- Create: `src/utils/relatedQueries.ts`, `src/services/discover.service.ts`, `src/routes/discover.route.ts`, `tests/services/discover.service.test.ts`, `tests/discover/discover.route.test.ts`
- Modify: `src/routes/trends.route.ts` (import the moved helper), `src/app.ts` (mount — one line, after `/api/supply`)

**Interfaces:**
- Consumes: `activeSeasons`, `SeasonEvent` (Task 5); `readSupply`, `isEnabled` (Task 7; plain-term keys); `hasAcceptedCurrentTerms` (Task 1); `growthNumber` (`src/utils/relatedGrowth.ts`); `normalizeTerm`.
- Produces: `latestRelatedQueriesFor(related, keywordId)` in `src/utils/relatedQueries.ts`; constants `DISCOVER_LIMIT = 5`, `DAILY_NEW_TERMS = 10`, `MIN_GROWTH = 500`, `BREAKOUT_GROWTH = 5000`, `HIGH_SUPPLY_ABOVE = 100_000`, `LOW_SUPPLY_BELOW = 10_000`; pure `buildCandidates`, `rankSuggestions`, `createDailyQuota`; `createDiscoverService(deps)` with `suggestionsFor(userId, region, etsyAllowed)`; singleton `discoverService`; HTTP `GET /api/discover?region=XX` → `{ suggestions: DiscoverSuggestion[] }` (shape in Task 2).

- [ ] **Step 1: Write the failing tests** — `tests/services/discover.service.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { db } from "../../src/db/client.js";
import { keywords, relatedQueries } from "../../src/db/schema.js";
import { createTestUser } from "../helpers/factories.js";
import {
  buildCandidates,
  createDailyQuota,
  createDiscoverService,
  rankSuggestions,
} from "../../src/services/discover.service.js";

describe("buildCandidates", () => {
  const seasons = [{ event: "halloween" as const, daysUntil: 17, seeds: ["halloween clipart", "spooky png"] }];

  test("keeps breakouts and growth ≥ 500, drops tracked terms (normalized) and duplicates, best origin wins", () => {
    const related = [
      { query: "Boho Rainbow PNG", growthValue: "836500", from: "boho rainbow clipart" },
      { query: "boho rainbow png", growthValue: "600", from: "other" },
      { query: "small growth", growthValue: "250", from: "x" },
      { query: "halloween clipart", growthValue: "700", from: "x" },
      { query: "Already Mine", growthValue: "Breakout", from: "x" },
    ];
    const tracked = new Set(["already mine"]);
    const out = buildCandidates(related, seasons, tracked);
    expect(out).toEqual([
      { term: "boho rainbow png", origin: { type: "related", from: "boho rainbow clipart", breakout: true }, rank: 0 },
      { term: "halloween clipart", origin: { type: "season", event: "halloween", daysUntil: 17 }, rank: 1 },
      { term: "spooky png", origin: { type: "season", event: "halloween", daysUntil: 17 }, rank: 1 },
    ]);
  });
});

describe("rankSuggestions", () => {
  test("drops high supply, orders by origin rank then low < medium < unknown, then alphabetically, max 5", () => {
    const c = (term: string, rank: number) => ({ term, origin: { type: "related" as const, from: "x", breakout: rank === 0 }, rank });
    const supply = new Map<string, { count: number | null; status: "fresh" | "refreshing" | "unavailable" }>([
      ["a", { count: 200_000, status: "fresh" }],
      ["b", { count: 50_000, status: "fresh" }],
      ["c", { count: 0, status: "fresh" }],
      ["d", { count: null, status: "refreshing" }],
    ]);
    const out = rankSuggestions([c("d", 0), c("b", 0), c("c", 0), c("a", 0), c("e", 2), c("f", 1), c("g", 1), c("h", 2)], supply, true);
    expect(out.map((s) => s.term)).toEqual(["c", "b", "d", "f", "g"]);
    expect(out[0]!.supply).toEqual({ count: 0, status: "fresh" });
  });

  test("without Etsy every suggestion has supply null and nothing is dropped for supply", () => {
    const out = rankSuggestions([{ term: "z", origin: { type: "related", from: "x", breakout: true }, rank: 0 }], new Map(), false);
    expect(out).toEqual([{ term: "z", origin: { type: "related", from: "x", breakout: true }, supply: null }]);
  });
});

describe("createDailyQuota", () => {
  test("allows 10 new terms per user per UTC day; terms already seen today are free", () => {
    let now = Date.parse("2026-10-14T10:00:00Z");
    const quota = createDailyQuota(() => now);
    const terms = Array.from({ length: 12 }, (_, i) => `t${i}`);
    expect(quota.take(1, terms).size).toBe(10);
    expect(quota.take(1, ["t0", "t11"])).toEqual(new Set(["t0"]));
    expect(quota.take(2, ["t11"]).size).toBe(1); // per user
    now = Date.parse("2026-10-15T00:00:01Z");
    expect(quota.take(1, ["t11"]).size).toBe(1); // new day
  });
});

describe("createDiscoverService", () => {
  test("uses the latest collection of related queries for the region, excludes archived and active terms", async () => {
    const user = await createTestUser({ email: "d@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "boho clipart" }).returning();
    await db.insert(keywords).values({ userId: user.id, term: "Old Idea", removedAt: new Date() });
    await db.insert(relatedQueries).values([
      { keywordId: kw!.id, geo: "US", query: "boho png", growthValue: "836500", collectedAt: new Date("2026-10-13T06:00:00Z") },
      { keywordId: kw!.id, geo: "US", query: "old idea", growthValue: "900", collectedAt: new Date("2026-10-13T06:00:00Z") },
      { keywordId: kw!.id, geo: "US", query: "stale query", growthValue: "Breakout", collectedAt: new Date("2026-10-01T06:00:00Z") },
      { keywordId: kw!.id, geo: "MX", query: "otra región", growthValue: "Breakout", collectedAt: new Date("2026-10-13T06:00:00Z") },
    ]);
    const readSupply = vi.fn(async (terms: string[]) => new Map(terms.map((t) => [t, { count: 100, fetchedAt: new Date(), status: "fresh" as const }])));
    const service = createDiscoverService({ supply: { isEnabled: () => true, readSupply }, now: () => Date.parse("2026-06-20T12:00:00Z") });

    const out = await service.suggestionsFor(user.id, "US", true);
    const terms = out.map((s) => s.term);
    expect(terms[0]).toBe("boho png");
    expect(terms).not.toContain("old idea");
    expect(terms).not.toContain("stale query");
    expect(terms).not.toContain("otra región");
    expect(terms).not.toContain("boho clipart");
    expect(readSupply).toHaveBeenCalled();
  });

  test("never calls Etsy when etsyAllowed is false", async () => {
    const user = await createTestUser({ email: "d2@example.com" });
    const readSupply = vi.fn();
    const service = createDiscoverService({ supply: { isEnabled: () => true, readSupply }, now: () => Date.parse("2026-10-14T12:00:00Z") });
    const out = await service.suggestionsFor(user.id, "", false);
    expect(readSupply).not.toHaveBeenCalled();
    expect(out.length).toBeGreaterThan(0); // seasons still produce suggestions
    expect(out.every((s) => s.supply === null)).toBe(true);
  });
});
```

`tests/discover/discover.route.test.ts`: requires a session (401); with `ETSY_API_KEY` unset returns suggestions with `supply: null` and no Etsy call (mock `fetchListingCountFromEtsy` as in the supply route test); for a user with `termsVersion: null`, no Etsy call. Await `etsySupplyService.onIdle()` in `afterEach`.

- [ ] **Step 2: Run to see them fail.**

- [ ] **Step 3: Implement**

`src/utils/relatedQueries.ts` — move `latestRelatedQueriesFor` from `src/routes/trends.route.ts` verbatim (with its JSDoc), exported; `trends.route.ts` imports it instead.

`src/services/discover.service.ts`:

```ts
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { keywords, relatedQueries } from "../db/schema.js";
import { activeSeasons, type ActiveSeason, type SeasonEvent } from "../config/seasonalSeeds.js";
import { growthNumber } from "../utils/relatedGrowth.js";
import { latestRelatedQueriesFor } from "../utils/relatedQueries.js";
import { normalizeTerm } from "../utils/normalizeTerm.js";
import { etsySupplyService, type SupplyReading, type SupplyStatus } from "./etsySupply.service.js";

export const DISCOVER_LIMIT = 5;
export const DAILY_NEW_TERMS = 10;
export const MIN_GROWTH = 500;
export const BREAKOUT_GROWTH = 5000;
/** Same thresholds as the client's opportunity logic (client/src/lib/opportunity.ts). */
export const LOW_SUPPLY_BELOW = 10_000;
export const HIGH_SUPPLY_ABOVE = 100_000;

export type DiscoverOrigin =
  | { type: "related"; from: string; breakout: boolean }
  | { type: "season"; event: SeasonEvent; daysUntil: number };

export interface Candidate {
  term: string;
  origin: DiscoverOrigin;
  /** 0 = breakout, 1 = season, 2 = other high growth. */
  rank: number;
}

export interface DiscoverSuggestion {
  term: string;
  origin: DiscoverOrigin;
  supply: { count: number | null; status: SupplyStatus } | null;
}

interface RelatedInput {
  query: string;
  growthValue: string;
  /** The tracked keyword this query rose with. */
  from: string;
}

/**
 * Candidate keywords: rising related queries with growth ≥ 500 % (breakouts above 5,000 % or labelled "Breakout")
 * and the seed terms of active seasons. Terms the user already has (active or archived) and duplicates are dropped;
 * a term reached by several origins keeps the best one. Sorted by rank, then term.
 */
export function buildCandidates(related: RelatedInput[], seasons: ActiveSeason[], tracked: Set<string>): Candidate[] {
  const best = new Map<string, Candidate>();
  const offer = (candidate: Candidate) => {
    if (candidate.term === "" || tracked.has(candidate.term)) return;
    const current = best.get(candidate.term);
    if (!current || candidate.rank < current.rank) best.set(candidate.term, candidate);
  };
  for (const item of related) {
    const growth = growthNumber(item.growthValue);
    if (growth < MIN_GROWTH) continue;
    const breakout = growth > BREAKOUT_GROWTH;
    offer({ term: normalizeTerm(item.query), origin: { type: "related", from: item.from, breakout }, rank: breakout ? 0 : 2 });
  }
  for (const season of seasons) {
    for (const seed of season.seeds) {
      offer({ term: normalizeTerm(seed), origin: { type: "season", event: season.event, daysUntil: season.daysUntil }, rank: 1 });
    }
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank || a.term.localeCompare(b.term));
}

const levelOrder = (count: number | null | undefined) =>
  count === null || count === undefined ? 2 : count < LOW_SUPPLY_BELOW ? 0 : 1;

/** Drops crowded terms (> 100,000 listings), orders by origin, then low < medium < unknown supply, then term; at most 5. */
export function rankSuggestions(
  candidates: Candidate[],
  supply: Map<string, Pick<SupplyReading, "count" | "status">>,
  etsyAllowed: boolean,
): DiscoverSuggestion[] {
  return candidates
    .map((candidate) => ({ candidate, reading: etsyAllowed ? supply.get(candidate.term) : undefined }))
    .filter(({ reading }) => !(reading && reading.count !== null && reading.count > HIGH_SUPPLY_ABOVE))
    .sort(
      (a, b) =>
        a.candidate.rank - b.candidate.rank ||
        levelOrder(a.reading?.count) - levelOrder(b.reading?.count) ||
        a.candidate.term.localeCompare(b.candidate.term),
    )
    .slice(0, DISCOVER_LIMIT)
    .map(({ candidate, reading }) => ({
      term: candidate.term,
      origin: candidate.origin,
      supply: etsyAllowed ? { count: reading?.count ?? null, status: reading?.status ?? "unavailable" } : null,
    }));
}

/**
 * Caps how many distinct candidate terms each user can send to Etsy per UTC day, so Discover cannot drain the shared
 * daily budget. Terms already taken today are free to look up again. In memory, like the rest of the Etsy guards.
 */
export function createDailyQuota(now: () => number = Date.now, limit = DAILY_NEW_TERMS) {
  const byUser = new Map<number, { day: string; terms: Set<string> }>();
  return {
    take(userId: number, terms: string[]): Set<string> {
      const day = new Date(now()).toISOString().slice(0, 10);
      let record = byUser.get(userId);
      if (!record || record.day !== day) {
        record = { day, terms: new Set() };
        byUser.set(userId, record);
      }
      const allowed = new Set<string>();
      for (const term of terms) {
        if (record.terms.has(term)) allowed.add(term);
        else if (record.terms.size < limit) {
          record.terms.add(term);
          allowed.add(term);
        }
      }
      return allowed;
    },
  };
}

interface DiscoverDeps {
  db?: typeof db;
  supply?: { isEnabled: () => boolean; readSupply: (terms: string[]) => Promise<Map<string, SupplyReading>> };
  now?: () => number;
}

/** Builds each user's Discover suggestions from their latest related queries and the season calendar. */
export function createDiscoverService(deps: DiscoverDeps = {}) {
  const database = deps.db ?? db;
  const supply = deps.supply ?? etsySupplyService;
  const now = deps.now ?? Date.now;
  const quota = createDailyQuota(now);

  async function suggestionsFor(userId: number, region: string, etsyAllowed: boolean): Promise<DiscoverSuggestion[]> {
    const own = await database
      .select({ id: keywords.id, term: keywords.term, removedAt: keywords.removedAt })
      .from(keywords)
      .where(eq(keywords.userId, userId));
    const tracked = new Set(own.map((keyword) => normalizeTerm(keyword.term)));
    const active = own.filter((keyword) => keyword.removedAt === null);

    const rows = active.length
      ? await database
          .select()
          .from(relatedQueries)
          .where(and(inArray(relatedQueries.keywordId, active.map((keyword) => keyword.id)), eq(relatedQueries.geo, region)))
          .orderBy(desc(relatedQueries.collectedAt))
      : [];
    const related = active.flatMap((keyword) =>
      latestRelatedQueriesFor(rows, keyword.id).map((row) => ({ query: row.query, growthValue: row.growthValue, from: keyword.term })),
    );

    const candidates = buildCandidates(related, activeSeasons(new Date(now()), region), tracked);
    const useEtsy = etsyAllowed && supply.isEnabled();
    let readings = new Map<string, SupplyReading>();
    if (useEtsy && candidates.length > 0) {
      const allowed = quota.take(userId, candidates.map((c) => c.term));
      if (allowed.size > 0) readings = await supply.readSupply([...allowed]);
    }
    return rankSuggestions(candidates, readings, useEtsy);
  }

  return { suggestionsFor };
}

export const discoverService = createDiscoverService();
```

`src/routes/discover.route.ts`:

```ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { discoverService } from "../services/discover.service.js";
import { hasAcceptedCurrentTerms } from "../utils/termsAcceptance.js";

export const discoverRouter = Router();

/**
 * GET /api/discover?region=XX — up to five keyword suggestions: rising searches related to the caller's keywords and
 * upcoming seasons, filtered by Etsy supply when Etsy is enabled and the user accepted the current terms. Without
 * Etsy the suggestions still come back, with `supply: null`. These are rising searches, not proven sales.
 */
discoverRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const region = typeof req.query.region === "string" ? req.query.region : "";
    const etsyAllowed = await hasAcceptedCurrentTerms(req.userId!);
    res.json({ suggestions: await discoverService.suggestionsFor(req.userId!, region, etsyAllowed) });
  } catch (err) {
    next(err);
  }
});
```

`src/app.ts`: `app.use("/api/discover", discoverRouter);` after `/api/supply`.

- [ ] **Step 4: Verify** — `npx vitest run tests/services/discover.service.test.ts tests/discover tests/trends` → pass; mutation-check: remove the `tracked.has` check → the exclusion test fails; restore. Full backend suite + typechecks + lint.
- [ ] **Step 5: Hand-off.**

---

### Task 10: Client — category, local supply, "On Etsy now", Discover

**Files:**
- Create: `client/src/lib/discover.ts`, `client/src/lib/discover.test.ts`, `client/src/lib/useEtsyListings.ts`, `client/src/lib/useEtsyListings.test.ts`, `client/src/lib/useDiscover.ts`, `client/src/components/EtsyCategorySelect.tsx`, `client/src/components/EtsyListings.tsx`, `client/src/components/DiscoverStrip.tsx`
- Modify: `client/src/lib/useSupply.ts` (+ its test), `client/src/components/SupplyStrip.tsx`, `client/src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: types and strings from Task 2; `DemandRegionSelector`, `demandRegion`, `SupplyStrip.demandControl` and the new layout from Task 6; HTTP shapes from Tasks 8 and 9 (as specified there); `api`, `getApiErrorCode`, `getApiErrorLimit`, `getErrorMessage` from `lib/api.ts`; `regionLabel`; `formatCount`, `growthLocale`.
- Produces: `useSupply(signature: string, region: string | undefined)`; `applySupplyCutoff` also clears a stale `local`; `SAMPLES_MAX_AGE_MS`, `applySamplesCutoff(response, now)`, `useEtsyListings(keywordId: number | null, signature: string)`; `useDiscover(region: string | undefined, signature: string)`; `describeOrigin(origin, t)`, `loadDiscoverOpen()`, `saveDiscoverOpen(open)` (key `inntena_discover_open`, default true).

- [ ] **Step 1: Write the failing tests**

`client/src/lib/useEtsyListings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SAMPLES_MAX_AGE_MS, applySamplesCutoff } from "./useEtsyListings";
import type { ListingSamplesResponse } from "./types";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const listing = { listingId: 1, title: "L", price: 4, currency: "USD", url: "u", thumbnailUrl: null, favorites: 0, views: 0 };
const at = (ageMs: number): ListingSamplesResponse => ({
  enabled: true, status: "fresh", fetchedAt: new Date(NOW - ageMs).toISOString(), listings: [listing],
});

describe("applySamplesCutoff", () => {
  it("keeps samples exactly 6 h old and hides them a millisecond later", () => {
    expect(applySamplesCutoff(at(SAMPLES_MAX_AGE_MS), NOW).listings).toEqual([listing]);
    expect(applySamplesCutoff(at(SAMPLES_MAX_AGE_MS + 1), NOW)).toMatchObject({ listings: null, status: "unavailable" });
  });
  it("keeps an empty list as a real result", () => {
    expect(applySamplesCutoff({ ...at(1000), listings: [] }, NOW).listings).toEqual([]);
  });
  it("passes through responses without listings or when disabled", () => {
    expect(applySamplesCutoff({ enabled: false, listings: [] }, NOW)).toEqual({ enabled: false, listings: [] });
    expect(applySamplesCutoff({ enabled: true, status: "refreshing", fetchedAt: null, listings: null }, NOW).status).toBe("refreshing");
  });
});
```

`client/src/lib/discover.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TRANSLATIONS } from "./i18n";
import { describeOrigin } from "./discover";

describe("describeOrigin", () => {
  const t = TRANSLATIONS.en;
  it("names the keyword a related query rose with", () => {
    expect(describeOrigin({ type: "related", from: "boho clipart", breakout: true }, t)).toBe('Rising with "boho clipart"');
  });
  it("names the season and the days left", () => {
    expect(describeOrigin({ type: "season", event: "halloween", daysUntil: 17 }, t)).toBe("Season: Halloween in 17 days");
    expect(describeOrigin({ type: "season", event: "weddings", daysUntil: 0 }, t)).toBe("Season: Wedding season (now)");
  });
});
```

Append to `client/src/lib/useSupply.test.ts`:

```ts
describe("applySupplyCutoff and local supply", () => {
  it("clears a stale local count even when the main count is fresh", () => {
    const now = Date.parse("2026-10-14T12:00:00Z");
    const fresh = new Date(now - 1000).toISOString();
    const stale = new Date(now - SUPPLY_MAX_AGE_MS - 1).toISOString();
    const [item] = applySupplyCutoff(
      [{ keywordId: 1, count: 5, fetchedAt: fresh, status: "fresh", local: { region: "MX", count: 0, fetchedAt: stale, status: "fresh" } }],
      now,
    );
    expect(item!.count).toBe(5);
    expect(item!.local).toEqual({ region: "MX", count: null, fetchedAt: null, status: "unavailable" });
  });
});
```

- [ ] **Step 2: Run to see them fail** — `npm test --prefix client`.

- [ ] **Step 3: Implement**

`useSupply.ts`:
- `applySupplyCutoff` also applies the 24 h rule to `item.local` (same logic; `local: null`/`undefined` passes through as `null`):

```ts
function cutLocal(local: SupplyItem["local"] | undefined, now: number): SupplyItem["local"] {
  if (!local || local.count === null) return local ?? null;
  const fetchedAt = local.fetchedAt === null ? Number.NaN : Date.parse(local.fetchedAt);
  return now - fetchedAt <= SUPPLY_MAX_AGE_MS ? local : { ...local, count: null, fetchedAt: null, status: "unavailable" };
}
```

  and in the map: compute the main part as today, then return `{ ...main, local: cutLocal(item.local, now) }`.
- Signature becomes `useSupply(signature: string, region: string | undefined)`; the request is ``api.get<SupplyResponse>(`/supply?region=${encodeURIComponent(region ?? "")}`)``; the load effect depends on `[signature, region]`. Update its JSDoc.

`client/src/lib/useEtsyListings.ts`:

```ts
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { ListingSamplesResponse } from "./types";

/** Etsy listing content must never be displayed more than 6 h after it was fetched (boundary inclusive). */
export const SAMPLES_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Age at which an open page asks the server for fresher samples. */
export const SAMPLES_REFETCH_AGE_MS = 3 * 60 * 60 * 1000;
const POLL_MS = 4000;
const MAX_POLLS = 3;
const AGE_CHECK_MS = 5 * 60 * 1000;

/** Hides samples older than 6 h exactly like missing ones. An empty list inside the window is a real result. */
export function applySamplesCutoff(response: ListingSamplesResponse, now: number): ListingSamplesResponse {
  if (!response.enabled || !response.listings) return response;
  const fetchedAt = response.fetchedAt ? Date.parse(response.fetchedAt) : Number.NaN;
  if (now - fetchedAt <= SAMPLES_MAX_AGE_MS) return response;
  return { ...response, listings: null, fetchedAt: null, status: "unavailable" };
}

/**
 * Up to five current Etsy listings for the selected keyword. Re-polls a few times while the server is fetching them,
 * re-applies the 6 h cutoff every 5 minutes and asks again once they are 3 h old. Failures are silent: this is
 * informational and must never break the page. Null until the first answer arrives.
 */
export function useEtsyListings(keywordId: number | null, signature: string): ListingSamplesResponse | null {
  const [response, setResponse] = useState<ListingSamplesResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const reloadRef = useRef<() => void>(() => {});
  const responseRef = useRef<ListingSamplesResponse | null>(null);
  responseRef.current = response;

  useEffect(() => {
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      const fetchedAt = responseRef.current?.fetchedAt ? Date.parse(responseRef.current.fetchedAt) : Number.NaN;
      if (current - fetchedAt >= SAMPLES_REFETCH_AGE_MS) reloadRef.current();
    }, AGE_CHECK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setResponse(null);
    if (keywordId === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load(pollsDone: number) {
      try {
        const next = await api.get<ListingSamplesResponse>(`/keywords/${keywordId}/etsy-listings`);
        if (cancelled) return;
        setResponse(next);
        if (next.enabled && next.status === "refreshing" && pollsDone < MAX_POLLS) {
          timer = setTimeout(() => void load(pollsDone + 1), POLL_MS);
        }
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
```

`client/src/lib/discover.ts`:

```ts
import type { Translations } from "./i18n";
import type { DiscoverOrigin } from "./types";

const OPEN_KEY = "inntena_discover_open";

/** One line saying why a keyword is suggested: the keyword it rose with, or the season and the days left. */
export function describeOrigin(origin: DiscoverOrigin, t: Translations): string {
  return origin.type === "related"
    ? t.discover.fromRelated(origin.from)
    : t.discover.season(t.discover.events[origin.event], origin.daysUntil);
}

/** Whether the Discover strip is expanded; open by default and when storage is unavailable. */
export function loadDiscoverOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

/** Remembers whether the Discover strip is expanded; storage failures are ignored. */
export function saveDiscoverOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, String(open));
  } catch {
    // Not remembered; harmless.
  }
}
```

`client/src/lib/useDiscover.ts`:

```ts
import { useEffect, useState } from "react";
import { api } from "./api";
import type { DiscoverResponse, DiscoverSuggestion } from "./types";

/** Discover suggestions for the demand region; reloads when the region or the keyword list changes. Silent on failure. */
export function useDiscover(region: string | undefined, signature: string): DiscoverSuggestion[] | null {
  const [suggestions, setSuggestions] = useState<DiscoverSuggestion[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<DiscoverResponse>(`/discover?region=${encodeURIComponent(region ?? "")}`)
      .then((res) => {
        if (!cancelled) setSuggestions(res.suggestions);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [region, signature]);
  return suggestions;
}
```

`client/src/components/EtsyCategorySelect.tsx`:

```tsx
import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { api } from "../lib/api";
import { ETSY_CATEGORIES } from "../lib/etsyCategories";

interface EtsyCategorySelectProps {
  keywordId: number;
  value: number | null;
  /** Called after the category was saved, so the caller can reload keywords and supply. */
  onChanged: () => void;
}

/** Etsy category that scopes a keyword's supply count and listing examples ("All categories" = none). */
export function EtsyCategorySelect({ keywordId, value, onChanged }: EtsyCategorySelectProps) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);

  async function handleChange(next: string) {
    setSaving(true);
    try {
      await api.patch(`/keywords/${keywordId}/etsy-category`, { taxonomyId: next === "" ? null : Number(next) });
      onChanged();
    } catch {
      // The select snaps back to the saved value on the next render; nothing else to do.
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      aria-label={t.etsy.categoryLabel}
      value={value === null ? "" : String(value)}
      disabled={saving}
      onChange={(event) => void handleChange(event.target.value)}
      className="max-w-[11rem] rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-text"
    >
      <option value="">{t.etsy.allCategories}</option>
      {ETSY_CATEGORIES.map((category) => (
        <option key={category.id} value={category.id}>
          {t.etsy.categories[category.key]}
        </option>
      ))}
    </select>
  );
}
```

`SupplyStrip.tsx`: add `categoryControl?: ReactNode;` (JSDoc: "Optional control in the supply block, e.g. the Etsy category select."), pass it as `action` of the supply `Block`, and under the main count (inside the `supply.count !== null` branch) render the local line when `supply.local && supply.local.count !== null`:

```tsx
        {supply.local && supply.local.count !== null && (
          <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
            {t.etsy.localSupply(supply.local.count.toLocaleString(locale), regionLabel(t, supply.local.region))}
            <InfoTip label={t.etsy.localHelp}>
              <p>{t.etsy.localHelp}</p>
            </InfoTip>
          </p>
        )}
```

(import `regionLabel` from `../lib/i18n`). `!== null`, never truthiness: a local count of 0 is shown.

`client/src/components/EtsyListings.tsx`:

```tsx
import { useLanguage } from "../context/LanguageContext";
import { growthLocale } from "../lib/growth";
import { formatCount } from "../lib/opportunity";
import type { ListingSamplesResponse } from "../lib/types";
import { EtsyAttribution } from "./EtsyAttribution";

const MS_PER_HOUR = 3_600_000;

interface EtsyListingsProps {
  data: ListingSamplesResponse | null;
}

/** "On Etsy now": up to five current listings exactly as Etsy returned them, each linking to Etsy. */
export function EtsyListings({ data }: EtsyListingsProps) {
  const { t, language } = useLanguage();
  const locale = growthLocale(language);

  let body;
  if (data === null || data.listings === null) {
    body = (
      <p className="text-sm text-text-muted">
        {data?.status === "unavailable" ? t.etsy.listingsUnavailable : t.etsy.listingsLoading}
      </p>
    );
  } else if (data.listings.length === 0) {
    body = <p className="text-sm text-text-muted">{t.etsy.listingsEmpty}</p>;
  } else {
    body = (
      <ul className="space-y-2">
        {data.listings.map((listing) => (
          <li key={listing.listingId}>
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.etsy.openOnEtsy(listing.title)}
              className="flex gap-3 rounded border border-border p-2 hover:border-primary-line"
            >
              {listing.thumbnailUrl ? (
                <img src={listing.thumbnailUrl} alt="" loading="lazy" width={68} height={54} className="h-[54px] w-[68px] shrink-0 rounded object-cover" />
              ) : (
                <div className="h-[54px] w-[68px] shrink-0 rounded bg-bg" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm text-text">{listing.title}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {listing.price !== null && listing.currency
                    ? new Intl.NumberFormat(locale, { style: "currency", currency: listing.currency }).format(listing.price)
                    : null}
                  {" · "}
                  {t.etsy.favorites(formatCount(listing.favorites, locale))}
                  {" · "}
                  {t.etsy.views(formatCount(listing.views, locale))}
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    );
  }

  const hours = data?.fetchedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(data.fetchedAt)) / MS_PER_HOUR)) : null;
  return (
    <div className="flex flex-col gap-3">
      {body}
      <div className="text-xs text-text-muted">
        {hours !== null && <p>{t.etsy.listingsUpdated(hours)}</p>}
        <EtsyAttribution />
      </div>
    </div>
  );
}
```

(Read `EtsyAttribution.tsx` first and adapt the last line if it already renders its own wrapper.)

`client/src/components/DiscoverStrip.tsx`:

```tsx
import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { api, getApiErrorCode, getApiErrorLimit, getErrorMessage } from "../lib/api";
import { describeOrigin, loadDiscoverOpen, saveDiscoverOpen } from "../lib/discover";
import { growthLocale } from "../lib/growth";
import { formatCount, supplyLevel } from "../lib/opportunity";
import type { DiscoverSuggestion } from "../lib/types";

interface DiscoverStripProps {
  suggestions: DiscoverSuggestion[] | null;
  /** Called after a suggestion was added to the user's keywords. */
  onTracked: () => void;
}

/** Collapsible strip of up to five keyword suggestions with a one-click "Track". */
export function DiscoverStrip({ suggestions, onTracked }: DiscoverStripProps) {
  const { t, language } = useLanguage();
  const locale = growthLocale(language);
  const [open, setOpen] = useState(loadDiscoverOpen);
  const [busyTerm, setBusyTerm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setOpen((current) => {
      saveDiscoverOpen(!current);
      return !current;
    });
  }

  async function track(term: string) {
    setBusyTerm(term);
    setError(null);
    try {
      await api.post("/keywords", { term });
      onTracked();
    } catch (err) {
      const limit = getApiErrorLimit(err);
      setError(getApiErrorCode(err) === "KEYWORD_LIMIT_REACHED" && limit !== null ? t.keywordList.limitReached(limit) : getErrorMessage(err, t.auth.genericError));
    } finally {
      setBusyTerm(null);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface px-5 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t.discover.title}</h2>
          {open && <p className="text-xs text-text-muted">{t.discover.caveat}</p>}
        </div>
        <button type="button" onClick={toggle} aria-expanded={open} className="text-xs text-primary underline">
          {open ? t.discover.hide : t.discover.show}
        </button>
      </div>
      {open && (
        <div className="mt-3">
          {error && <p className="mb-2 text-xs text-primary">{error}</p>}
          {suggestions && suggestions.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {suggestions.map((suggestion) => (
                <li key={suggestion.term} className="flex flex-col justify-between gap-2 rounded border border-border bg-bg p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text" title={suggestion.term}>{suggestion.term}</p>
                    <p className="text-xs text-text-muted">
                      {suggestion.origin.type === "related" && suggestion.origin.breakout && (
                        <span className="font-mono font-semibold uppercase text-rise">{t.discover.breakout} · </span>
                      )}
                      {describeOrigin(suggestion.origin, t)}
                    </p>
                    {suggestion.supply && (
                      <p className="text-xs text-text-muted">
                        {suggestion.supply.count !== null
                          ? `${t.supply.listings(formatCount(suggestion.supply.count, locale))} · ${t.supply.supplyTitle}: ${
                              { low: "↓", medium: "→", high: "↑" }[supplyLevel(suggestion.supply.count)]
                            }`
                          : t.discover.supplyUnknown}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busyTerm !== null}
                    onClick={() => void track(suggestion.term)}
                    className="self-start rounded bg-primary-solid px-3 py-1 text-xs font-medium text-on-primary hover:bg-primary-solid-hover disabled:opacity-50"
                  >
                    {busyTerm === suggestion.term ? t.discover.tracking : t.discover.track}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">{t.discover.empty}</p>
          )}
        </div>
      )}
    </section>
  );
}
```

(Check `POST /api/keywords`'s body schema in `src/routes/keywords.route.ts`: if `category` is required, send `{ term, category: "" }` or the schema's default — do not change the backend.)

`DashboardPage.tsx`:
1. Compute `demandRegion` **before** the hooks that need it (it only reads state).
2. `const supplySignature = keywords.map((k) => `${k.id}:${k.etsyTaxonomyId ?? 0}`).join(",");` and `useSupply(supplySignature, demandRegion)`.
3. `const listings = useEtsyListings(selectedId, String(selectedKeyword?.etsyTaxonomyId ?? 0));`
4. `const suggestions = useDiscover(demandRegion, keywords.map((k) => k.id).join(","));`
5. Pass `categoryControl={selectedKeyword ? <EtsyCategorySelect keywordId={selectedKeyword.id} value={selectedKeyword.etsyTaxonomyId} onChanged={() => refetchKeywords()} /> : undefined}` to `SupplyStrip`.
6. Render `{suggestions !== null && <DiscoverStrip suggestions={suggestions} onTracked={() => refetchKeywords()} />}` between `RegionTabs` and the main grid.
7. Replace the related-queries `<section>` with a row:

```tsx
                <div className={`grid gap-4 ${listings?.enabled ? "lg:grid-cols-2" : ""}`}>
                  <section className="min-w-0 rounded-lg border border-border bg-surface p-5 shadow-sm">
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">{t.dashboard.relatedRising}</h2>
                    <RelatedQueriesList columns={relatedColumns} />
                  </section>
                  {listings?.enabled && (
                    <section className="min-w-0 rounded-lg border border-border bg-surface p-5 shadow-sm">
                      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">{t.etsy.listingsTitle}</h2>
                      <EtsyListings data={listings} />
                    </section>
                  )}
                </div>
```

- [ ] **Step 4: Verify** — `npm test --prefix client`, `npm run typecheck --prefix client`, `npm run lint --prefix client` (3 baseline warnings only). Do not start a dev server.
- [ ] **Step 5: Hand-off.**

---

### Task 11: Legal, docs, verification and QA (controller)

**Files:** `client/src/lib/legalContent.ts` (+ test), `src/config/terms.ts`, `docs/adr/0001-overall-architecture.md`, `README.md`, `CLAUDE.md` (not versioned).

- [ ] **Step 1: Country names** — run `npx tsx src/scripts/verifyEtsyCountries.ts` with the real key; remove every name that returns 0 from `ETSY_COUNTRY_NAMES`; record the output.
- [ ] **Step 2: Legal text** — in `legalContent.ts`, both languages:
  - Privacy "Who processes it": when Etsy listing examples are shown, their pictures load directly from Etsy's servers, so Etsy receives the visitor's IP address and browser details.
  - Terms "Data sources and accuracy": listing examples are shown as Etsy returns them, may change or disappear, and suggestions are rising searches and season dates, not proven sales.
  - Extend `legalContent.test.ts` so the privacy text must mention "Etsy" in the processors section.
  - Bump `CURRENT_TERMS_VERSION` in `src/config/terms.ts` to `"2026-10-14"`. Existing users re-accept through the existing modal.
- [ ] **Step 3: Docs** — ADR "Optional third-party integrations": add listing examples (≤ 6 h, as returned, behind `ETSY_LISTING_SAMPLES_ENABLED` pending Etsy approval), category/country counts, and Discover from Trends + season calendar with Etsy only as a supply filter. README "Etsy supply data": the same, plus the new env flag.
- [ ] **Step 4: Full verification** — backend `npx tsc --noEmit && npm run typecheck:test && npm run lint && npm test`; client `npm run typecheck --prefix client && npm run lint --prefix client && npm test --prefix client`; `npm audit --omit=dev --audit-level=high` both sides; the Linux CI replica (`node:22` + `postgres:16` containers, as on 2026-10-13); `npm --prefix client run build` (never `npm run build` while the owner's Vite is running).
- [ ] **Step 5: Browser QA** (dev server, real key, `ETSY_LISTING_SAMPLES_ENABLED=true` locally only, `docker/seed-dev.sql`):
  - No overlap at 1440 and 1024 px. The page scrolls; the keyword column stays sticky with its own scroll. Check light and dark, ES and EN.
  - The demand selector changes the verdict and the badges.
  - The category select changes the count. With MX the local line shows.
  - "On Etsy now" shows thumbnails with no CSP violations, and links open Etsy.
  - Discover lists terms the user does not track, and "Track" adds them.
  - With the flag off, the listings card disappears.
  - The production build (`NODE_ENV=production node dist/server.js` after `npm --prefix client run build` + `npx tsc`) loads thumbnails under the real CSP.
- [ ] **Step 6: Update `CLAUDE.md`** with what shipped, the verified countries, rulings, and the owner's to-do: keep `ETSY_LISTING_SAMPLES_ENABLED=false` in Render until Etsy approves the purpose.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| §1 A layout + demand region | 6, 10 |
| §1 B category + local counts | 1, 3, 4, 7, 8, 10 |
| §1 C listing samples | 1, 3, 7, 8, 10 |
| §1 D Discover | 5, 7, 9, 10 |
| §3 terms rules | Global Constraints; 7 (cutoffs), 8 (flag/terms gate), 9 (no analysis) |
| §4 verified facts | 3 (batch images, filters), 4 (country names) |
| §6.1–6.6 backend | 1, 3, 4, 5, 7, 8, 9 |
| §7 client | 2, 6, 10 |
| §8 legal | 11 |
| §9 rollout flag | 1, 8, 11 |
| §10 error handling | 3, 7, 8, 9 |
| §11 testing | each task + 11 |
| §12 risks | 4, 9 (quota), 11 |

**Type consistency:**
- `SupplyKey`/`supplyKeyId`/`samplesKeyId` are used the same way in Tasks 7 and 8.
- `ListingSampleRow` (server) has the same fields as `ListingSample` (client).
- `DiscoverOrigin`/`DiscoverSuggestion` are identical in Tasks 2 and 9.
- `SeasonEvent` has the same 7 values in Tasks 2 and 5.
- `useSupply(signature, region)`: Task 10 changes its only caller.
- `SupplyStrip` props `demandControl` (Task 6) and `categoryControl` (Task 10) are optional, so each task compiles on its own.

**Placeholders:** none. Two instructions are conditional on facts the implementer must read: the `TrendChart` height and the `POST /keywords` body. Each says exactly what to do in either case.
