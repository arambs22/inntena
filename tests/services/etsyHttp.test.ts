import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { env } from "../../src/config/env.js";
import { EtsyHttpError, REQUEST_TIMEOUT_MS, fetchListingCountFromEtsy, fetchListingSamplesFromEtsy } from "../../src/services/etsyHttp.js";

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

  test("awaits the pause exactly once between the search and the batch call", async () => {
    const order: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      order.push(url.includes("/batch") ? "batch" : "search");
      return url.includes("/batch") ? ok({ count: 1, results: [listing(1)] }) : search([1]);
    });
    const pause = vi.fn(async () => {
      order.push("pause");
    });
    await fetchListingSamplesFromEtsy("x", undefined, asFetch(fetchImpl), pause);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["search", "pause", "batch"]);
  });

  test("does not pause when the search is empty (no second call)", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(search([]));
    const pause = vi.fn(async () => {});
    await fetchListingSamplesFromEtsy("x", undefined, asFetch(fetchImpl), pause);
    expect(pause).not.toHaveBeenCalled();
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
