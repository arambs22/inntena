import { useEffect, useRef, useState } from "react";
import { Navbar } from "../components/Navbar";
import { KeywordForm } from "../components/KeywordForm";
import { KeywordList } from "../components/KeywordList";
import { RegionTabs } from "../components/RegionTabs";
import { TrendChart } from "../components/TrendChart";
import { RelatedQueriesList } from "../components/RelatedQueriesList";
import { VerificationBanner } from "../components/VerificationBanner";
import { api, isUnauthorized } from "../lib/api";
import { ChartRangeSelector } from "../components/ChartRangeSelector";
import { KeywordListToolbar } from "../components/KeywordListToolbar";
import { arrangeKeywords, loadSortMode, saveSortMode, type SortMode } from "../lib/keywordListView";
import {
  countChartDays,
  loadChartRange,
  saveChartRange,
  sliceSeries,
  type ChartRange,
} from "../lib/trendChart";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { regionLabel } from "../lib/i18n";
import type { Keyword, KeywordTrend, KeywordRelated } from "../lib/types";
import { useSupply } from "../lib/useSupply";
import { useEtsyListings } from "../lib/useEtsyListings";
import { useDiscover } from "../lib/useDiscover";
import { EtsyCategorySelect } from "../components/EtsyCategorySelect";
import { EtsyListings } from "../components/EtsyListings";
import { DiscoverStrip } from "../components/DiscoverStrip";
import { buildInsights } from "../lib/keywordInsights";
import { SupplyStrip } from "../components/SupplyStrip";
import { AppFooter } from "../components/AppFooter";
import { DemandRegionSelector } from "../components/DemandRegionSelector";
import { loadDemandRegion, resolveDemandRegion, saveDemandRegion } from "../lib/demandRegion";
import { latestFailure, formatAttemptTime } from "../lib/collectionStatus";
import { growthLocale } from "../lib/growth";

const ACTIVE_REGIONS_KEY = "inntena_regions_active";
/** Where the added-region list lived before it moved to the backend. Read once, migrated, then dropped. */
const LEGACY_ADDED_REGIONS_KEY = "nicheradar_regions_added";

function loadRegionList(key: string, fallback: string[]): string[] {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Protected landing page: keyword management plus trend chart and related queries, compared
 * across up to 3 active regions. The page scrolls normally; the keyword column is sticky and
 * viewport-tall, so a long keyword list scrolls inside its own panel while the right side scrolls
 * with the page.
 */
export function DashboardPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addedRegions, setAddedRegions] = useState<string[]>([]);
  const [activeRegions, setActiveRegions] = useState<string[]>(() => loadRegionList(ACTIVE_REGIONS_KEY, [""]));
  const [trendsByRegion, setTrendsByRegion] = useState<Record<string, KeywordTrend[]>>({});
  const [relatedByRegion, setRelatedByRegion] = useState<Record<string, KeywordRelated[]>>({});
  const [loadingKeywords, setLoadingKeywords] = useState(true);
  const [loadingTrends, setLoadingTrends] = useState(true);
  const [keywordsError, setKeywordsError] = useState(false);
  const [range, setRange] = useState<ChartRange>(loadChartRange);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>(loadSortMode);
  const [maxKeywords, setMaxKeywords] = useState<number | null>(null);
  const [storedDemandRegion, setStoredDemandRegion] = useState<string | null>(loadDemandRegion);
  const demandRegion = resolveDemandRegion(storedDemandRegion, activeRegions);
  const supplySignature = keywords.map((keyword) => `${keyword.id}:${keyword.etsyTaxonomyId ?? 0}`).join(",");
  const { enabled: etsyEnabled, items: supplyItems } = useSupply(supplySignature, demandRegion);
  const selectedKeyword = keywords.find((k) => k.id === selectedId) ?? null;
  const listings = useEtsyListings(selectedId, String(selectedKeyword?.etsyTaxonomyId ?? 0));
  const discover = useDiscover(demandRegion, keywords.map((keyword) => keyword.id).join(","));
  const hydratedRegions = useRef(false);

  function handleRangeChange(next: ChartRange) {
    setRange(next);
    saveChartRange(next);
  }

  function handleDemandRegionChange(region: string) {
    setStoredDemandRegion(region);
    saveDemandRegion(region);
  }

  function handleSortModeChange(next: SortMode) {
    setSortMode(next);
    saveSortMode(next);
  }

  useEffect(() => {
    // The counter is informational: if this request fails it is simply hidden.
    api
      .get<{ max: number; active: number }>("/keywords/limit")
      .then((res) => setMaxKeywords(res.max))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Runs once per mount even under StrictMode's double-invoked effects, so
    // the migration below can't interleave with a second copy of itself.
    if (hydratedRegions.current) return;
    hydratedRegions.current = true;

    /**
     * Loads the tracked regions from the backend. Users from before regions
     * were persisted server-side get an empty list back, so their old
     * localStorage list is pushed up once and then dropped. Whatever the
     * result, the active list is reconciled against it — otherwise a region
     * could stay active (and keep being fetched and charted) with no tab
     * rendered to switch it off.
     */
    async function hydrateRegions() {
      let tracked = await api.get<string[]>("/regions");

      if (tracked.length === 0) {
        const legacy = loadRegionList(LEGACY_ADDED_REGIONS_KEY, []).filter((code) => code !== "");
        if (legacy.length > 0) {
          await Promise.all(legacy.map((code) => api.post("/regions", { geo: code })));
          // Re-read instead of trusting the local list: the backend is the
          // source of truth now, and it may already hold regions this browser
          // never knew about.
          tracked = await api.get<string[]>("/regions");
        }
      }
      // Only dropped once the migration above actually went through; if it
      // threw, the key survives and the next load retries.
      localStorage.removeItem(LEGACY_ADDED_REGIONS_KEY);

      setAddedRegions(tracked);
      // Worldwide ("") is implicit: it always has a tab, so it never needs to
      // be in `tracked`. Anything else has to go, or it would stay active with
      // no tab to turn it off. Fall back to Worldwide if that empties the list.
      setActiveRegions((prev) => {
        const reconciled = prev.filter((code) => code === "" || tracked.includes(code));
        return reconciled.length > 0 ? reconciled : [""];
      });
    }

    hydrateRegions().catch((err) => {
      console.error("No se pudieron cargar las regiones guardadas", err);
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(ACTIVE_REGIONS_KEY, JSON.stringify(activeRegions));
  }, [activeRegions]);

  function refetchKeywords(regions: string[] = activeRegions) {
    const geoParam = regions.join(",");
    setKeywordsError(false);
    return api
      .get<Keyword[]>(`/keywords?geo=${encodeURIComponent(geoParam)}`)
      .then((res) => {
        setKeywords(res);
        return res;
      })
      .catch((err) => {
        // A 401 means ProtectedRoute is about to redirect to /login anyway —
        // no need to also flash an error. Anything else (rate limiting,
        // a server hiccup) must not silently render as "no keywords": the
        // request failed, it doesn't mean the account has none.
        if (!isUnauthorized(err)) {
          setKeywordsError(true);
        }
      });
  }

  useEffect(() => {
    refetchKeywords(activeRegions).finally(() => setLoadingKeywords(false));
  }, [activeRegions]);

  useEffect(() => {
    setLoadingTrends(true);
    Promise.all(
      activeRegions.map((region) =>
        Promise.all([
          api.get<KeywordTrend[]>(`/trends?geo=${encodeURIComponent(region)}`),
          api.get<KeywordRelated[]>(`/related?geo=${encodeURIComponent(region)}`),
        ]).then(([trends, related]) => ({ region, trends, related }))
      )
    )
      .then((results) => {
        const nextTrends: Record<string, KeywordTrend[]> = {};
        const nextRelated: Record<string, KeywordRelated[]> = {};
        for (const { region, trends, related } of results) {
          nextTrends[region] = trends;
          nextRelated[region] = related;
        }
        setTrendsByRegion(nextTrends);
        setRelatedByRegion(nextRelated);
      })
      .finally(() => setLoadingTrends(false));
  }, [activeRegions]);

  useEffect(() => {
    // Keeps a valid selection: picks one when there is none yet, or when the selected keyword is gone.
    // It defaults to the first keyword the user actually sees, not the backend's order — the list is
    // re-sorted client-side, so the two only coincide by accident.
    if (selectedId === null || !keywords.some((k) => k.id === selectedId)) {
      setSelectedId(arrangeKeywords(keywords, "", sortMode)[0]?.id ?? null);
    }
  }, [keywords, selectedId, sortMode]);

  function handleAddRegion(code: string) {
    setAddedRegions((prev) => (prev.includes(code) ? prev : [...prev, code]));
    api.post("/regions", { geo: code }).catch(() => {
      setAddedRegions((prev) => prev.filter((c) => c !== code));
    });
  }

  function handleRemoveRegion(code: string) {
    setAddedRegions((prev) => prev.filter((c) => c !== code));
    setActiveRegions((prev) => prev.filter((c) => c !== code));
    api.delete(`/regions/${encodeURIComponent(code)}`).catch(() => {
      api.get<string[]>("/regions").then(setAddedRegions);
      setActiveRegions((prev) => (prev.includes(code) ? prev : [...prev, code]));
    });
  }

  function handleToggleActive(code: string) {
    setActiveRegions((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, code];
    });
  }

  const arranged = arrangeKeywords(keywords, query, sortMode);
  const atLimit = maxKeywords !== null && keywords.length >= maxKeywords;
  const insights = etsyEnabled ? buildInsights(keywords, demandRegion === undefined ? undefined : trendsByRegion[demandRegion], supplyItems) : undefined;
  const selectedInsight = selectedKeyword && insights ? insights.get(selectedKeyword.id) : undefined;

  const chartSeries = activeRegions.map((region) => ({
    region,
    timeline: trendsByRegion[region]?.find((t) => t.id === selectedId)?.timeline ?? [],
  }));

  const visibleSeries = sliceSeries(chartSeries, range);

  const selectedFailure = latestFailure(selectedKeyword?.collectionStatus, activeRegions);
  const emptyChartMessage = selectedFailure
    ? (selectedFailure.reason === "googleBlocked" ? t.dashboard.noDataFailedGoogle : t.dashboard.noDataFailedOther)(
        formatAttemptTime(selectedFailure.at, growthLocale(language)),
      )
    : t.dashboard.noDataNew;

  const relatedColumns = activeRegions.map((region) => ({
    region,
    rising: relatedByRegion[region]?.find((r) => r.id === selectedId)?.rising ?? [],
  }));

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
        {discover !== null && <DiscoverStrip suggestions={discover.suggestions} checking={discover.checking} onTracked={() => refetchKeywords()} />}
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
                      {selectedKeyword && selectedKeyword.regions.length > 0 && (
                        <p className="text-xs text-text-muted">
                          {t.dashboard.dataAvailableIn(selectedKeyword.regions.map((code) => regionLabel(t, code)).join(", "))}
                        </p>
                      )}
                    </div>
                    {countChartDays(visibleSeries) > 0 && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-text-muted">{t.dashboard.showingDays(countChartDays(visibleSeries))}</span>
                        <ChartRangeSelector value={range} onChange={handleRangeChange} />
                      </div>
                    )}
                  </div>
                  {selectedInsight && demandRegion !== undefined && (
                    <div className="mt-4">
                      <SupplyStrip
                        insight={selectedInsight}
                        regionName={regionLabel(t, demandRegion)}
                        demandControl={
                          <DemandRegionSelector regions={activeRegions} value={demandRegion} onChange={handleDemandRegionChange} />
                        }
                        categoryControl={
                          selectedKeyword ? (
                            <EtsyCategorySelect
                              keywordId={selectedKeyword.id}
                              value={selectedKeyword.etsyTaxonomyId}
                              onChanged={() => refetchKeywords()}
                            />
                          ) : undefined
                        }
                      />
                    </div>
                  )}
                </section>
                <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">{t.dashboard.trend}</h2>
                  <div className="h-[320px]">
                    <TrendChart series={visibleSeries} emptyMessage={emptyChartMessage} />
                  </div>
                </section>
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
              </>
            )}
          </div>
        </div>
      </main>
      <AppFooter showEtsyNotice={etsyEnabled} />
    </div>
  );
}
