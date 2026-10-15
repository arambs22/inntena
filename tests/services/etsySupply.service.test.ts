import { describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client.js";
import { etsyListingSamples, etsySupply, type ListingSampleRow } from "../../src/db/schema.js";
import { logger } from "../../src/utils/logger.js";
import { EtsyHttpError, type EtsyFetcher, type EtsySamplesFetcher } from "../../src/services/etsyHttp.js";
import {
  CIRCUIT_OPEN_MS,
  DAILY_RESERVE,
  MAX_DISPLAY_AGE_MS,
  MIN_REQUEST_INTERVAL_MS,
  RATE_LIMIT_BACKOFF_MS,
  REFRESH_AFTER_MS,
  SAMPLES_MAX_AGE_MS,
  SAMPLES_REFRESH_AFTER_MS,
  createEtsySupplyService,
  samplesKeyId,
  supplyKeyId,
} from "../../src/services/etsySupply.service.js";

const T0 = Date.parse("2026-10-09T12:00:00Z");
const HOUR = 60 * 60 * 1000;

const sample = (id: number): ListingSampleRow => ({
  listingId: id, title: `L${id}`, price: 4.25, currency: "USD", url: `https://www.etsy.com/listing/${id}`,
  thumbnailUrl: null, favorites: 0, views: 0,
});

function setup(options: { fetcher?: EtsyFetcher; samplesFetcher?: EtsySamplesFetcher; enabled?: boolean } = {}) {
  vi.spyOn(logger, "warn").mockImplementation(() => {});
  vi.spyOn(logger, "error").mockImplementation(() => {});
  let clock = T0;
  const sleeps: number[] = [];
  const fetcher = vi.fn<EtsyFetcher>(options.fetcher ?? (async () => ({ count: 100, remainingToday: 4000 })));
  const samplesFetcher = vi.fn<EtsySamplesFetcher>(
    options.samplesFetcher ?? (async () => ({ listings: [sample(1)], remainingToday: 4000 })),
  );
  const service = createEtsySupplyService({
    fetcher,
    samplesFetcher,
    isEnabled: () => options.enabled ?? true,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  return { service, fetcher, samplesFetcher, sleeps, now: () => clock, advance: (ms: number) => void (clock += ms) };
}

async function seed(term: string, count: number, ageMs: number) {
  await db.insert(etsySupply).values({ term, listingCount: count, fetchedAt: new Date(T0 - ageMs) });
}

const failWith = (status: number | null) => async (): Promise<never> => {
  throw new EtsyHttpError(status, "boom");
};

describe("etsy supply service: reading", () => {
  test("is inert when disabled: empty result and no Etsy call", async () => {
    const { service, fetcher } = setup({ enabled: false });
    expect((await service.readSupply(["boho clipart"])).size).toBe(0);
    await service.onIdle();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("returns a fresh count and does not refresh it", async () => {
    await seed("boho clipart", 73419, 1 * HOUR);
    const { service, fetcher } = setup();
    const reading = (await service.readSupply(["boho clipart"])).get("boho clipart")!;
    await service.onIdle();
    expect(reading).toMatchObject({ count: 73419, status: "fresh" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("refreshes in the background only once the count is older than 12 h, still showing it meanwhile", async () => {
    await seed("exactly twelve", 10, REFRESH_AFTER_MS);
    await seed("just over twelve", 20, REFRESH_AFTER_MS + 1);
    const { service, fetcher } = setup();

    const readings = await service.readSupply(["exactly twelve", "just over twelve"]);
    await service.onIdle();

    expect(readings.get("exactly twelve")).toMatchObject({ count: 10, status: "fresh" });
    expect(readings.get("just over twelve")).toMatchObject({ count: 20, status: "fresh" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("just over twelve");
  });

  test("shows a count that is exactly 24 h old but hides one a millisecond older", async () => {
    await seed("on the line", 7, MAX_DISPLAY_AGE_MS);
    await seed("too old", 8, MAX_DISPLAY_AGE_MS + 1);
    const { service } = setup();

    const readings = await service.readSupply(["on the line", "too old"]);

    expect(readings.get("on the line")).toMatchObject({ count: 7, status: "fresh" });
    expect(readings.get("too old")).toMatchObject({ count: null, fetchedAt: null, status: "refreshing" });
    await service.onIdle();
  });

  test("keeps hiding an expired count even when Etsy is failing", async () => {
    await seed("expired", 50, MAX_DISPLAY_AGE_MS + HOUR);
    const { service } = setup({ fetcher: failWith(403) });
    const reading = (await service.readSupply(["expired"])).get("expired")!;
    await service.onIdle();
    expect(reading.count).toBeNull();
  });

  test("a term nobody has fetched yet is 'refreshing', then readable on the next read", async () => {
    const { service } = setup({ fetcher: async () => ({ count: 73419, remainingToday: 4000 }) });
    const first = (await service.readSupply(["boho clipart"])).get("boho clipart")!;
    await service.onIdle();
    const second = (await service.readSupply(["boho clipart"])).get("boho clipart")!;
    expect(first).toMatchObject({ count: null, status: "refreshing" });
    expect(second).toMatchObject({ count: 73419, status: "fresh" });
  });

  test("a stored count of zero is a real value, not a missing one", async () => {
    await seed("zzqxjkwv", 0, 1 * HOUR);
    const { service } = setup();
    const reading = (await service.readSupply(["zzqxjkwv"])).get("zzqxjkwv")!;
    expect(reading.count).toBe(0);
    expect(reading.status).toBe("fresh");
  });

  test("a fetched count of zero is stored and read back as zero", async () => {
    const { service } = setup({ fetcher: async () => ({ count: 0, remainingToday: 4000 }) });
    await service.readSupply(["zzqxjkwv"]);
    await service.onIdle();
    const reading = (await service.readSupply(["zzqxjkwv"])).get("zzqxjkwv")!;
    expect(reading.count).toBe(0);
  });

  test("looks terms up by their normalized form", async () => {
    await seed("boho clipart", 99, 1 * HOUR);
    const { service } = setup();
    const readings = await service.readSupply(["  BOHO   Clipart "]);
    expect(readings.get("boho clipart")).toMatchObject({ count: 99, status: "fresh" });
  });

  test("overwrites the stored row on refresh, leaving a single row", async () => {
    await seed("boho clipart", 100, REFRESH_AFTER_MS + HOUR);
    const { service } = setup({ fetcher: async () => ({ count: 250, remainingToday: 4000 }) });
    await service.readSupply(["boho clipart"]);
    await service.onIdle();
    const rows = await db.select().from(etsySupply).where(eq(etsySupply.term, "boho clipart"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.listingCount).toBe(250);
    expect(rows[0]!.fetchedAt.getTime()).toBeGreaterThanOrEqual(T0);
  });
});

describe("etsy supply service: purging stale rows", () => {
  const termsInDb = async () => (await db.select().from(etsySupply)).map((row) => row.term).sort();

  test("deletes rows older than 24 h but keeps fresh ones and one exactly 24 h old", async () => {
    await seed("stale", 1, MAX_DISPLAY_AGE_MS + 1);
    await seed("fresh", 2, HOUR);
    await seed("on the line", 3, MAX_DISPLAY_AGE_MS);
    const { service } = setup();

    await service.readSupply(["fresh"]);
    await service.onIdle();

    expect(await termsInDb()).toEqual(["fresh", "on the line"]);
  });

  test("also purges at the end of a refresh cycle", async () => {
    const { service, advance } = setup();
    await service.readSupply(["first"]);
    await service.onIdle();
    await seed("stale", 1, MAX_DISPLAY_AGE_MS + 1);

    advance(1000);
    await service.readSupply(["second"]);
    await service.onIdle();

    expect(await termsInDb()).toEqual(["first", "second"]);
  });

  test("a failing delete is logged and never rejects", async () => {
    const { service } = setup();
    const deleteSpy = vi.spyOn(db, "delete").mockImplementation(() => {
      throw new Error("delete exploded");
    });
    try {
      await expect(service.readSupply(["fresh"])).resolves.toBeDefined();
      await expect(service.onIdle()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    } finally {
      deleteSpy.mockRestore();
    }
  });
});

describe("etsy supply service: queue and rate guard", () => {
  test("concurrent reads of the same term share one Etsy request", async () => {
    const { service, fetcher } = setup();
    await Promise.all([service.readSupply(["boho clipart"]), service.readSupply(["Boho  Clipart"])]);
    await service.onIdle();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("spaces consecutive requests at least 220 ms apart", async () => {
    const { service, fetcher, sleeps } = setup();
    await service.readSupply(["a", "b", "c"]);
    await service.onIdle();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([MIN_REQUEST_INTERVAL_MS, MIN_REQUEST_INTERVAL_MS]);
  });
});

describe("etsy supply service: failure handling", () => {
  test("three consecutive failures open the circuit for 15 minutes", async () => {
    const { service, fetcher, advance } = setup({ fetcher: failWith(403) });
    await service.readSupply(["a", "b", "c"]);
    await service.onIdle();
    expect(fetcher).toHaveBeenCalledTimes(3);

    const blocked = (await service.readSupply(["d"])).get("d")!;
    await service.onIdle();
    expect(blocked.status).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(3);

    advance(CIRCUIT_OPEN_MS);
    const reopened = (await service.readSupply(["d"])).get("d")!;
    await service.onIdle();
    expect(reopened.status).toBe("refreshing");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  test("a success in between resets the failure count", async () => {
    const outcomes = [failWith(500), failWith(500), async () => ({ count: 1, remainingToday: 4000 }), failWith(500), failWith(500)];
    let call = 0;
    const { service } = setup({ fetcher: () => outcomes[call++]!() });
    await service.readSupply(["a", "b", "c", "d", "e"]);
    await service.onIdle();
    const next = (await service.readSupply(["f"])).get("f")!;
    expect(next.status).toBe("refreshing");
    await service.onIdle();
  });

  test("an HTTP 429 backs off for 60 seconds only", async () => {
    const { service, advance } = setup({ fetcher: failWith(429) });
    await service.readSupply(["a"]);
    await service.onIdle();

    expect((await service.readSupply(["b"])).get("b")!.status).toBe("unavailable");
    advance(RATE_LIMIT_BACKOFF_MS - 1);
    expect((await service.readSupply(["b"])).get("b")!.status).toBe("unavailable");
    advance(1);
    expect((await service.readSupply(["b"])).get("b")!.status).toBe("refreshing");
    await service.onIdle();
  });

  test("stops asking Etsy when the daily budget is nearly spent, and keeps asking when it is not", async () => {
    const low = setup({ fetcher: async () => ({ count: 1, remainingToday: DAILY_RESERVE }) });
    await low.service.readSupply(["a"]);
    await low.service.onIdle();
    expect((await low.service.readSupply(["b"])).get("b")!.status).toBe("unavailable");

    const fine = setup({ fetcher: async () => ({ count: 1, remainingToday: DAILY_RESERVE + 1 }) });
    await fine.service.readSupply(["a"]);
    await fine.service.onIdle();
    expect((await fine.service.readSupply(["b"])).get("b")!.status).toBe("refreshing");
    await fine.service.onIdle();
  });

  test("an open circuit still serves counts that are fresh", async () => {
    await seed("known", 42, 1 * HOUR);
    const { service } = setup({ fetcher: failWith(403) });
    await service.readSupply(["a", "b", "c"]);
    await service.onIdle();
    const reading = (await service.readSupply(["known"])).get("known")!;
    expect(reading).toMatchObject({ count: 42, status: "fresh" });
  });

  test("a fetcher that throws something unexpected never makes readSupply or onIdle reject", async () => {
    const { service } = setup({
      fetcher: async () => {
        throw new TypeError("kaboom");
      },
    });
    await expect(service.readSupply(["a"])).resolves.toBeDefined();
    await expect(service.onIdle()).resolves.toBeUndefined();
  });

  test("an unexpected internal failure does not reject unhandled, and the term can be scheduled again", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const { service, fetcher } = setup({ fetcher: failWith(500) });
      // Both the failure log and the recovery log throw, so refreshOne itself rejects.
      vi.spyOn(logger, "warn").mockImplementation(() => {
        throw new Error("logger exploded");
      });
      vi.spyOn(logger, "error").mockImplementation(() => {
        throw new Error("logger exploded");
      });

      await service.readSupply(["a"]);
      await expect(service.onIdle()).resolves.toBeUndefined();
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);

      await service.readSupply(["a"]);
      await service.onIdle();
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
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
    expect(samplesFetcher).toHaveBeenCalledWith("boho clipart", 562, expect.any(Function));
    const [row] = await db.select().from(etsyListingSamples);
    expect(row).toMatchObject({ key: "boho clipart|562", payload: [sample(1)] });
  });

  test("shows samples exactly 6 h old, hides them a millisecond later, and refreshes after 3 h", async () => {
    await seedSamples("edge|0", [sample(2)], SAMPLES_MAX_AGE_MS);
    await seedSamples("old|0", [sample(3)], SAMPLES_MAX_AGE_MS + 1);
    await seedSamples("young|0", [sample(4)], SAMPLES_REFRESH_AFTER_MS);
    const { service, samplesFetcher } = setup();

    // "young" is read first: the fake clock advances while earlier background jobs sleep between requests.
    expect(await service.readListingSamples("young")).toMatchObject({ listings: [sample(4)], status: "fresh" });
    expect(await service.readListingSamples("edge")).toMatchObject({ listings: [sample(2)], status: "fresh" });
    expect(await service.readListingSamples("old")).toMatchObject({ listings: null, status: "refreshing" });
    await service.onIdle();

    const fetched = samplesFetcher.mock.calls.map((call) => call[0]);
    expect(fetched).toContain("edge"); // older than 3 h -> background refresh
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

describe("samples request spacing and purge isolation", () => {
  test("the two requests of a samples job, and back-to-back jobs, are all at least 220 ms apart", async () => {
    const { service, samplesFetcher, now } = setup();
    const times: number[] = [];
    samplesFetcher.mockImplementation(async (_term, _taxonomyId, pause) => {
      times.push(now()); // search request
      if (pause) await pause();
      times.push(now()); // batch request
      return { listings: [sample(1)], remainingToday: 4000 };
    });
    await service.readListingSamples("a");
    await service.readListingSamples("b");
    await service.readListingSamples("c");
    await service.onIdle();
    expect(times).toHaveLength(6);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(MIN_REQUEST_INTERVAL_MS);
    }
  });

  test("a failing counts delete does not stop samples older than 6 h from being purged", async () => {
    await db.insert(etsyListingSamples).values({ key: "drop|0", payload: [sample(1)], fetchedAt: new Date(T0 - SAMPLES_MAX_AGE_MS - 1) });
    const { service } = setup();
    const realDelete = db.delete.bind(db);
    const deleteSpy = vi.spyOn(db, "delete").mockImplementation(((table: unknown) => {
      if (table === etsySupply) throw new Error("counts delete exploded");
      return realDelete(table as never);
    }) as never);
    try {
      await service.readSupply(["anything"]);
      await service.onIdle();
    } finally {
      deleteSpy.mockRestore();
    }
    expect(logger.error).toHaveBeenCalled();
    expect(await db.select().from(etsyListingSamples)).toHaveLength(0);
  });
});
