import { describe, expect, test, vi } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { env } from "../../src/config/env.js";

vi.mock("../../src/services/trendCollector.service.js", () => ({
  collectTrendsForAllRegions: vi.fn(),
}));

import { collectTrendsForAllRegions } from "../../src/services/trendCollector.service.js";

const mockedCollect = vi.mocked(collectTrendsForAllRegions);
const auth = { Authorization: `Bearer ${env.CRON_SECRET}` };

const summary = { outcome: "ok" as const, succeeded: 2, skipped: 1, failed: 0, regions: 1 };

/** Waits until the background run has been recorded as finished. */
async function waitForFinish(): Promise<Record<string, unknown>> {
  for (let i = 0; i < 50; i++) {
    const res = await request(app).get("/api/internal/collect/status").set(auth);
    if (res.body.finishedAt) return res.body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("run never finished");
}

describe("internal collect endpoints", () => {
  test("status requires the cron secret", async () => {
    const res = await request(app).get("/api/internal/collect/status");
    expect(res.status).toBe(401);
  });

  test("status is 404 before any run has been recorded", async () => {
    const res = await request(app).get("/api/internal/collect/status").set(auth);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("No hay recolecciones registradas desde el último reinicio");
  });

  test("POST requires the cron secret", async () => {
    const res = await request(app).post("/api/internal/collect");
    expect(res.status).toBe(401);
  });

  test("POST returns a runId; status shows running and then the final outcome", async () => {
    let finish!: (s: typeof summary) => void;
    mockedCollect.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));

    const started = await request(app).post("/api/internal/collect").set(auth);
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ ok: true, started: true });
    expect(typeof started.body.runId).toBe("string");

    const running = await request(app).get("/api/internal/collect/status").set(auth);
    expect(running.body).toMatchObject({ runId: started.body.runId, status: "running", finishedAt: null, summary: null });

    const conflict = await request(app).post("/api/internal/collect").set(auth);
    expect(conflict.status).toBe(409);

    finish(summary);
    const done = await waitForFinish();
    expect(done).toMatchObject({ runId: started.body.runId, status: "ok", summary });
  });

  test("a blocked outcome is reflected in the status", async () => {
    mockedCollect.mockResolvedValueOnce({ ...summary, outcome: "blocked" });
    await request(app).post("/api/internal/collect").set(auth);
    const done = await waitForFinish();
    expect(done.status).toBe("blocked");
  });

  test("a run that throws is recorded as failed with no summary", async () => {
    mockedCollect.mockRejectedValueOnce(new Error("boom"));
    const started = await request(app).post("/api/internal/collect").set(auth);
    const done = await waitForFinish();
    expect(done).toMatchObject({ runId: started.body.runId, status: "failed", summary: null });
  });
});
