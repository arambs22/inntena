import { Router } from "express";
import { randomUUID } from "node:crypto";
import { requireCronSecret } from "../middleware/cronAuth.middleware.js";
import { collectTrendsForAllRegions, type CollectionRunSummary } from "../services/trendCollector.service.js";
import { logger } from "../utils/logger.js";

export const internalRouter = Router();

/**
 * Guards against overlapping collection runs (a manual workflow_dispatch
 * landing on top of the scheduled one, a retried request, ...). Two runs at
 * once would double the request rate against Google and race on each
 * keyword's consecutiveFailures read-then-write.
 */
let collectionInFlight = false;

/** Record of a collection run, exposed so the triggering workflow can wait for the real outcome. */
interface CollectionRunRecord {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | CollectionRunSummary["outcome"] | "failed";
  summary: CollectionRunSummary | null;
}

/** Latest run since process start; lost on restart (a deploy mid-run), which the workflow detects via runId. */
let latestRun: CollectionRunRecord | null = null;

/**
 * POST /collect — triggers a full collection run across every region
 * tracked by any user. Protected by CRON_SECRET; called by the scheduled
 * GitHub Actions workflow (see .github/workflows/collect-trends.yml).
 *
 * Responds 202 with a `runId` immediately and runs the collection in the
 * background: a full run sleeps for seconds between every request and would
 * otherwise outlive the host's request timeout (Render's free tier in
 * particular). The caller polls GET /collect/status for the outcome.
 * Returns 409 if a run is already in flight.
 */
internalRouter.post("/collect", requireCronSecret, (_req, res) => {
  if (collectionInFlight) {
    res.status(409).json({ error: "Ya hay una recolección en curso" });
    return;
  }

  collectionInFlight = true;
  const run: CollectionRunRecord = {
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    summary: null,
  };
  latestRun = run;
  res.status(202).json({ ok: true, started: true, runId: run.runId });

  void (async () => {
    try {
      const summary = await collectTrendsForAllRegions();
      run.summary = summary;
      run.status = summary.outcome;
      logger.info("Scheduled collection run finished", { outcome: summary.outcome });
    } catch (err) {
      run.status = "failed";
      logger.error("Scheduled collection run failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      run.finishedAt = new Date().toISOString();
      collectionInFlight = false;
    }
  })();
});

/**
 * GET /collect/status — the latest run's record (running or finished), or 404
 * if no run has happened since the process started. Protected by CRON_SECRET.
 */
internalRouter.get("/collect/status", requireCronSecret, (_req, res) => {
  if (!latestRun) {
    res.status(404).json({ error: "No hay recolecciones registradas desde el último reinicio" });
    return;
  }
  res.json(latestRun);
});
