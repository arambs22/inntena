import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { env } from "../../src/config/env.js";
import { EtsyHttpError, REQUEST_TIMEOUT_MS, fetchListingCountFromEtsy } from "../../src/services/etsyHttp.js";

const original = { key: env.ETSY_API_KEY, secret: env.ETSY_API_SECRET };

beforeEach(() => {
  env.ETSY_API_KEY = "test-key";
  env.ETSY_API_SECRET = "test-secret";
});
afterEach(() => {
  env.ETSY_API_KEY = original.key;
  env.ETSY_API_SECRET = original.secret;
  vi.useRealTimers();
});

const asFetch = (fn: unknown) => fn as typeof fetch;
const ok = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });

describe("fetchListingCountFromEtsy", () => {
  test("asks for one listing, sends key:secret, and returns the count and the remaining daily budget", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ count: 73419, results: [{ listing_id: 1 }] }, { "x-remaining-today": "4980" }));

    const result = await fetchListingCountFromEtsy("boho clipart & más", asFetch(fetchImpl));

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://openapi.etsy.com/v3/application/listings/active?keywords=boho%20clipart%20%26%20m%C3%A1s&limit=1");
    expect((init as RequestInit).headers).toMatchObject({ "x-api-key": "test-key:test-secret" });
    expect(result).toEqual({ count: 73419, remainingToday: 4980 });
  });

  test("treats an empty remaining-budget header as unknown, not as zero", async () => {
    const result = await fetchListingCountFromEtsy("x", asFetch(vi.fn().mockResolvedValue(ok({ count: 5 }, { "x-remaining-today": "" }))));
    expect(result.remainingToday).toBeNull();
  });

  test("rejects a fractional count", async () => {
    const error = await fetchListingCountFromEtsy("x", asFetch(vi.fn().mockResolvedValue(ok({ count: 1.5 })))).catch((e) => e);
    expect(error).toBeInstanceOf(EtsyHttpError);
    expect(error.status).toBeNull();
  });

  test("returns a count of zero as zero, not as missing", async () => {
    const result = await fetchListingCountFromEtsy("zzqxjkwv", asFetch(vi.fn().mockResolvedValue(ok({ count: 0, results: [] }))));
    expect(result.count).toBe(0);
  });

  test("reports an unknown remaining budget as null when the header is absent", async () => {
    const result = await fetchListingCountFromEtsy("x", asFetch(vi.fn().mockResolvedValue(ok({ count: 5 }))));
    expect(result.remainingToday).toBeNull();
  });

  test.each([403, 429, 500])("turns HTTP %i into an EtsyHttpError carrying the status, without leaking the credentials", async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status }));
    const error = await fetchListingCountFromEtsy("x", asFetch(fetchImpl)).catch((e) => e);
    expect(error).toBeInstanceOf(EtsyHttpError);
    expect(error.status).toBe(status);
    expect(error.message).not.toContain("test-key");
    expect(error.message).not.toContain("test-secret");
  });

  test.each([{ results: [] }, { count: "12" }, { count: -1 }, null])("rejects a response without a valid numeric count: %j", async (body) => {
    const error = await fetchListingCountFromEtsy("x", asFetch(vi.fn().mockResolvedValue(ok(body)))).catch((e) => e);
    expect(error).toBeInstanceOf(EtsyHttpError);
    expect(error.status).toBeNull();
  });

  test("wraps a network failure as an EtsyHttpError with no status", async () => {
    const error = await fetchListingCountFromEtsy("x", asFetch(vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")))).catch((e) => e);
    expect(error).toBeInstanceOf(EtsyHttpError);
    expect(error.status).toBeNull();
  });

  test("gives up after the timeout", async () => {
    vi.useFakeTimers();
    const hang = (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    const pending = fetchListingCountFromEtsy("x", asFetch(hang)).catch((e) => e);

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

    const error = await pending;
    expect(error).toBeInstanceOf(EtsyHttpError);
    expect(error.message).toMatch(/timed out/i);
  });
});
