import { describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client.js";
import { etsySupply } from "../../src/db/schema.js";
import { logger } from "../../src/utils/logger.js";
import { EtsyHttpError, type EtsyFetcher } from "../../src/services/etsyHttp.js";
import {
  CIRCUIT_OPEN_MS,
  DAILY_RESERVE,
  MAX_DISPLAY_AGE_MS,
  MIN_REQUEST_INTERVAL_MS,
  RATE_LIMIT_BACKOFF_MS,
  REFRESH_AFTER_MS,
  createEtsySupplyService,
} from "../../src/services/etsySupply.service.js";

const T0 = Date.parse("2026-10-09T12:00:00Z");
const HOUR = 60 * 60 * 1000;

function setup(options: { fetcher?: EtsyFetcher; enabled?: boolean } = {}) {
  vi.spyOn(logger, "warn").mockImplementation(() => {});
  vi.spyOn(logger, "error").mockImplementation(() => {});
  let clock = T0;
  const sleeps: number[] = [];
  const fetcher = vi.fn<EtsyFetcher>(options.fetcher ?? (async () => ({ count: 100, remainingToday: 4000 })));
  const service = createEtsySupplyService({
    fetcher,
    isEnabled: () => options.enabled ?? true,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  return { service, fetcher, sleeps, advance: (ms: number) => void (clock += ms) };
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
    vi.spyOn(db, "delete").mockImplementation(() => {
      throw new Error("delete exploded");
    });
    await expect(service.readSupply(["fresh"])).resolves.toBeDefined();
    await expect(service.onIdle()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
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
