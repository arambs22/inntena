import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { and, count, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { keywords, trendSnapshots, relatedQueries, users, keywordCollectionStatus } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { MAX_ACTIVE_KEYWORDS_PER_USER } from "../config/limits.js";
import { MAX_CONSECUTIVE_FAILURES } from "../services/trendCollector.service.js";

export const keywordsRouter = Router();

keywordsRouter.use(requireAuth);

/** Parses the `:id` route param, or null if it isn't a valid integer. */
function parseIdParam(req: Request): number | null {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? id : null;
}

/** Transaction handle passed to the callbacks of {@link withKeywordCapacity}. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Sentinel returned by {@link withKeywordCapacity} when the user is already at the active keyword cap. */
const LIMIT_REACHED = Symbol("KEYWORD_LIMIT_REACHED");

/**
 * Runs `write` inside a transaction only if the user has room for another active keyword.
 * The user's row is locked (`SELECT ... FOR UPDATE`) before counting, so concurrent requests from
 * the same user are serialized and cannot both slip under the cap.
 *
 * @returns the callback's result, or {@link LIMIT_REACHED} if the cap is already met.
 */
async function withKeywordCapacity<T>(userId: number, write: (tx: Tx) => Promise<T>): Promise<T | typeof LIMIT_REACHED> {
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [row] = await tx
      .select({ active: count() })
      .from(keywords)
      .where(and(eq(keywords.userId, userId), isNull(keywords.removedAt)));
    if ((row?.active ?? 0) >= MAX_ACTIVE_KEYWORDS_PER_USER) return LIMIT_REACHED;
    return write(tx);
  });
}

/** Sends the 422 response used whenever an action would exceed the active keyword cap. */
function sendLimitReached(res: Response): void {
  res.status(422).json({
    error: `Llegaste al máximo de ${MAX_ACTIVE_KEYWORDS_PER_USER} keywords activas. Archiva alguna para agregar otra.`,
    code: "KEYWORD_LIMIT_REACHED",
    limit: MAX_ACTIVE_KEYWORDS_PER_USER,
  });
}

/** GET /limit — the per-user active keyword cap and how many active keywords the user currently has. */
keywordsRouter.get("/limit", async (req, res, next) => {
  try {
    const [row] = await db
      .select({ active: count() })
      .from(keywords)
      .where(and(eq(keywords.userId, req.userId!), isNull(keywords.removedAt)));
    res.json({ max: MAX_ACTIVE_KEYWORDS_PER_USER, active: row?.active ?? 0 });
  } catch (err) {
    next(err);
  }
});

const createKeywordSchema = z.object({
  term: z.string().trim().min(1, "El término no puede estar vacío").max(100, "El término es demasiado largo"),
  category: z.string().trim().min(1).max(50, "La categoría es demasiado larga").optional(),
});

/** POST / — creates a keyword owned by the authenticated user, or restores it if it was previously archived under the same term. */
keywordsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = createKeywordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { term, category } = parsed.data;

    const [existing] = await db
      .select()
      .from(keywords)
      .where(and(eq(keywords.userId, req.userId!), eq(keywords.term, term)))
      .limit(1);

    if (existing && existing.removedAt === null) {
      res.status(409).json({ error: "Ya estás trackeando esa keyword" });
      return;
    }

    if (existing) {
      const restored = await withKeywordCapacity(req.userId!, async (tx) => {
        const [row] = await tx
          .update(keywords)
          .set({ removedAt: null, ...(category ? { category } : {}) })
          .where(eq(keywords.id, existing.id))
          .returning();
        return row;
      });
      if (restored === LIMIT_REACHED) {
        sendLimitReached(res);
        return;
      }
      res.status(200).json(restored);
      return;
    }

    const keyword = await withKeywordCapacity(req.userId!, async (tx) => {
      const [row] = await tx
        .insert(keywords)
        .values({ userId: req.userId!, term, ...(category ? { category } : {}) })
        .returning();
      return row;
    });
    if (keyword === LIMIT_REACHED) {
      sendLimitReached(res);
      return;
    }

    res.status(201).json(keyword);
  } catch (err) {
    // Drizzle wraps driver errors in a DrizzleQueryError; the original
    // Postgres error (with its `code`) lives in `.cause`.
    const pgCode = (err as { cause?: { code?: string } })?.cause?.code;
    if (pgCode === "23505") {
      res.status(409).json({ error: "Ya estás trackeando esa keyword" });
      return;
    }
    next(err);
  }
});

/** GET / — lists the authenticated user's active keywords, or active+archived (with per-region coverage) when ?includeRemoved=true. */
keywordsRouter.get("/", async (req, res, next) => {
  try {
    if (req.query.includeRemoved === "true") {
      const retentionDays = await getRetentionDays(req.userId!);
      await purgeExpired(req.userId!, retentionDays);

      const all = await db
        .select()
        .from(keywords)
        .where(eq(keywords.userId, req.userId!))
        .orderBy(keywords.createdAt);

      const regionsByKeyword = await getKeywordRegionsBatch(all.map((kw) => kw.id));
      const withRegions = all.map((kw) => ({ ...kw, regions: regionsByKeyword.get(kw.id) ?? [] }));

      res.json(withRegions);
      return;
    }

    const result = await db
      .select()
      .from(keywords)
      .where(and(eq(keywords.userId, req.userId!), isNull(keywords.removedAt)))
      .orderBy(keywords.category, keywords.term);

    const geoParam = req.query.geo;
    const geos = typeof geoParam === "string" ? geoParam.split(",") : null;
    const keywordIds = result.map((kw) => kw.id);
    const regionsByKeyword = await getKeywordRegionsBatch(keywordIds);
    const statusByKeyword = geos ? await getCollectionStatusBatch(keywordIds, geos) : null;
    const withRegions = result.map((kw) => ({
      ...kw,
      regions: regionsByKeyword.get(kw.id) ?? [],
      ...(statusByKeyword ? { collectionStatus: statusByKeyword.get(kw.id) ?? {} } : {}),
    }));
    res.json(withRegions);
  } catch (err) {
    next(err);
  }
});

/** DELETE /:id — archives a keyword owned by the authenticated user (soft delete; its data is kept until it expires from history). */
keywordsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = parseIdParam(req);
    if (id === null) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const archived = await db
      .update(keywords)
      .set({ removedAt: new Date(), pinnedAt: null })
      .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!), isNull(keywords.removedAt)))
      .returning({ id: keywords.id });

    if (archived.length === 0) {
      res.status(404).json({ error: "Keyword no encontrada" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /:id/permanent — permanently deletes an archived keyword owned by the authenticated
 * user, ahead of its normal history retention expiry. Only archived keywords qualify — an active
 * one has to be archived first, same precondition the restore endpoint uses in reverse. Its trend
 * snapshots, related queries, and collection status all cascade-delete with it (see schema.ts).
 */
keywordsRouter.delete("/:id/permanent", async (req, res, next) => {
  try {
    const id = parseIdParam(req);
    if (id === null) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const deleted = await db
      .delete(keywords)
      .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!), isNotNull(keywords.removedAt)))
      .returning({ id: keywords.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Keyword archivada no encontrada" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/** PATCH /:id/restore — un-archives a keyword owned by the authenticated user. */
keywordsRouter.patch("/:id/restore", async (req, res, next) => {
  try {
    const id = parseIdParam(req);
    if (id === null) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const [archived] = await db
      .select({ id: keywords.id })
      .from(keywords)
      .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!), isNotNull(keywords.removedAt)))
      .limit(1);
    if (!archived) {
      res.status(404).json({ error: "Keyword archivada no encontrada" });
      return;
    }

    const restored = await withKeywordCapacity(req.userId!, async (tx) => {
      const [row] = await tx
        .update(keywords)
        .set({ removedAt: null })
        .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!), isNotNull(keywords.removedAt)))
        .returning();
      return row;
    });
    if (restored === LIMIT_REACHED) {
      sendLimitReached(res);
      return;
    }

    if (!restored) {
      res.status(404).json({ error: "Keyword archivada no encontrada" });
      return;
    }

    res.json(restored);
  } catch (err) {
    next(err);
  }
});

const autoCollectSchema = z.object({
  paused: z.boolean(),
});

/** PATCH /:id/auto-collect — pauses or resumes automatic collection for a keyword owned by the authenticated user. */
keywordsRouter.patch("/:id/auto-collect", async (req, res, next) => {
  try {
    const id = parseIdParam(req);
    if (id === null) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const parsed = autoCollectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const [updated] = await db
      .update(keywords)
      .set({ autoCollectPaused: parsed.data.paused })
      .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Keyword no encontrada" });
      return;
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const pinSchema = z.object({
  pinned: z.boolean(),
});

/** PATCH /:id/pin — pins or unpins an active keyword owned by the authenticated user. */
keywordsRouter.patch("/:id/pin", async (req, res, next) => {
  try {
    const id = parseIdParam(req);
    if (id === null) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const parsed = pinSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const [updated] = await db
      .update(keywords)
      .set({ pinnedAt: parsed.data.pinned ? new Date() : null })
      .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!), isNull(keywords.removedAt)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Keyword no encontrada" });
      return;
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/** Fetches a keyword by id, scoped to its owner — shared by the two per-keyword history endpoints below. */
async function getOwnedKeyword(id: number, userId: number) {
  const [keyword] = await db
    .select()
    .from(keywords)
    .where(and(eq(keywords.id, id), eq(keywords.userId, userId)))
    .limit(1);
  return keyword ?? null;
}

/** GET /:id/trends — full trend history for one keyword, across every region it has data for, regardless of archived status. */
keywordsRouter.get("/:id/trends", async (req, res, next) => {
  try {
    const id = parseIdParam(req);
    if (id === null) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const keyword = await getOwnedKeyword(id, req.userId!);
    if (!keyword) {
      res.status(404).json({ error: "Keyword no encontrada" });
      return;
    }

    const snapshots = await db
      .select()
      .from(trendSnapshots)
      .where(eq(trendSnapshots.keywordId, id))
      .orderBy(trendSnapshots.geo, trendSnapshots.date);

    const byRegion = new Map<string, { date: string; value: number }[]>();
    for (const s of snapshots) {
      const list = byRegion.get(s.geo) ?? [];
      list.push({ date: s.date, value: s.value });
      byRegion.set(s.geo, list);
    }

    res.json({
      id: keyword.id,
      term: keyword.term,
      category: keyword.category,
      series: Array.from(byRegion.entries()).map(([region, timeline]) => ({ region, timeline })),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /:id/related — full related-queries history for one keyword, across every region, regardless of archived status. */
keywordsRouter.get("/:id/related", async (req, res, next) => {
  try {
    const id = parseIdParam(req);
    if (id === null) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const keyword = await getOwnedKeyword(id, req.userId!);
    if (!keyword) {
      res.status(404).json({ error: "Keyword no encontrada" });
      return;
    }

    const related = await db
      .select()
      .from(relatedQueries)
      .where(eq(relatedQueries.keywordId, id))
      .orderBy(relatedQueries.geo, relatedQueries.collectedAt);

    const byRegion = new Map<string, { query: string; growthValue: string }[]>();
    for (const r of related) {
      const list = byRegion.get(r.geo) ?? [];
      list.push({ query: r.query, growthValue: r.growthValue });
      byRegion.set(r.geo, list);
    }

    res.json({
      id: keyword.id,
      term: keyword.term,
      category: keyword.category,
      columns: Array.from(byRegion.entries()).map(([region, rising]) => ({ region, rising })),
    });
  } catch (err) {
    next(err);
  }
});

async function getRetentionDays(userId: number): Promise<number> {
  const [user] = await db
    .select({ historyRetentionDays: users.historyRetentionDays })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.historyRetentionDays ?? 15;
}

async function purgeExpired(userId: number, retentionDays: number): Promise<void> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  await db
    .delete(keywords)
    .where(and(eq(keywords.userId, userId), isNotNull(keywords.removedAt), lt(keywords.removedAt, cutoff)));
}

/** Batched replacement for calling a per-keyword region lookup in a loop: one query per source table (not one pair per keyword), grouped in memory. */
async function getKeywordRegionsBatch(keywordIds: number[]): Promise<Map<number, string[]>> {
  if (keywordIds.length === 0) return new Map();

  const snapshotGeos = await db
    .selectDistinct({ keywordId: trendSnapshots.keywordId, geo: trendSnapshots.geo })
    .from(trendSnapshots)
    .where(inArray(trendSnapshots.keywordId, keywordIds));
  const relatedGeos = await db
    .selectDistinct({ keywordId: relatedQueries.keywordId, geo: relatedQueries.geo })
    .from(relatedQueries)
    .where(inArray(relatedQueries.keywordId, keywordIds));

  const byKeyword = new Map<number, Set<string>>();
  for (const { keywordId, geo } of [...snapshotGeos, ...relatedGeos]) {
    const set = byKeyword.get(keywordId) ?? new Set<string>();
    set.add(geo);
    byKeyword.set(keywordId, set);
  }
  return new Map(Array.from(byKeyword, ([id, set]) => [id, Array.from(set)]));
}

interface KeywordRegionStatus {
  blocked: boolean;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
}

/**
 * Batched replacement for calling a per-keyword collection-status lookup in a loop: one query for
 * every keyword's status rows, grouped in memory. A keyword only counts as "blocked" once it has
 * failed as many times in a row as the collector itself treats as a likely rate limit — a single
 * transient failure (a flaky related-queries request, say) must not light up the dashboard.
 */
async function getCollectionStatusBatch(
  keywordIds: number[],
  geos: string[]
): Promise<Map<number, Record<string, KeywordRegionStatus>>> {
  const result = new Map<number, Record<string, KeywordRegionStatus>>();
  if (keywordIds.length === 0) return result;

  const rows = await db
    .select()
    .from(keywordCollectionStatus)
    .where(inArray(keywordCollectionStatus.keywordId, keywordIds));

  for (const keywordId of keywordIds) {
    const byGeo: Record<string, KeywordRegionStatus> = {};
    for (const geo of geos) {
      const row = rows.find((r) => r.keywordId === keywordId && r.geo === geo);
      if (row) {
        byGeo[geo] = {
          blocked: row.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES,
          lastAttemptAt: row.lastAttemptAt.toISOString(),
          lastSuccessAt: row.lastSuccessAt ? row.lastSuccessAt.toISOString() : null,
          consecutiveFailures: row.consecutiveFailures,
        };
      }
    }
    result.set(keywordId, byGeo);
  }
  return result;
}
