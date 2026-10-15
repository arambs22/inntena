import { describe, expect, test, vi } from "vitest";

vi.mock("google-trends-api", () => ({
  default: { interestOverTime: vi.fn(), relatedQueries: vi.fn() },
}));

import googleTrends from "google-trends-api";
import {
  fetchInterestOverTime,
  fetchRelatedQueries,
  GoogleBlockedError,
} from "../../src/services/googleTrends.service.js";

describe("fetchInterestOverTime", () => {
  test("drops the partial trailing point", async () => {
    vi.mocked(googleTrends.interestOverTime).mockResolvedValueOnce(
      JSON.stringify({
        default: {
          timelineData: [
            { time: "1790000000", value: [80] },
            { time: "1790086400", value: [0], isPartial: true },
          ],
        },
      })
    );
    const out = await fetchInterestOverTime("x", "");
    expect(out).toHaveLength(1);
    expect(out[0]!.value).toBe(80);
  });
});

describe("fetchRelatedQueries", () => {
  test("passes the property only when given", async () => {
    const spy = vi.mocked(googleTrends.relatedQueries);
    spy.mockResolvedValue(JSON.stringify({ default: { rankedList: [{}, { rankedKeyword: [] }] } }));
    await fetchRelatedQueries("a", "US");
    expect(spy.mock.calls[0]![0]).not.toHaveProperty("property");
    await fetchRelatedQueries("a", "US", "froogle");
    expect(spy.mock.calls[1]![0]).toMatchObject({ property: "froogle" });
  });
});

describe("Google block detection", () => {
  const html = '  <html lang="en"><head><title>Sorry</title></head></html>';

  test("fetchInterestOverTime throws GoogleBlockedError when Google answers with HTML", async () => {
    vi.mocked(googleTrends.interestOverTime).mockResolvedValueOnce(html);
    const err = await fetchInterestOverTime("x", "").catch((e) => e);
    expect(err).toBeInstanceOf(GoogleBlockedError);
    expect(err.code).toBe("GOOGLE_BLOCKED");
  });

  test("fetchRelatedQueries throws GoogleBlockedError when Google answers with HTML", async () => {
    vi.mocked(googleTrends.relatedQueries).mockResolvedValueOnce(html);
    await expect(fetchRelatedQueries("x", "")).rejects.toBeInstanceOf(GoogleBlockedError);
  });

  test("other unparsable bodies still surface as plain parse errors", async () => {
    vi.mocked(googleTrends.interestOverTime).mockResolvedValueOnce("not json");
    const err = await fetchInterestOverTime("x", "").catch((e) => e);
    expect(err).not.toBeInstanceOf(GoogleBlockedError);
  });
});
