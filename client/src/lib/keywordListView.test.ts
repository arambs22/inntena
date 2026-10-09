import { describe, expect, test } from "vitest";
import {
  DEFAULT_SORT_MODE,
  SORT_MODES,
  arrangeKeywords,
  filterKeywords,
  normalizeForSearch,
  parseStoredSortMode,
  sortKeywords,
} from "./keywordListView";
import type { Keyword } from "./types";

function kw(id: number, term: string, category: string, createdAt: string, pinnedAt: string | null = null): Keyword {
  return {
    id,
    userId: 1,
    term,
    category,
    createdAt,
    removedAt: null,
    autoCollectPaused: false,
    pinnedAt,
    regions: [],
  };
}

const ids = (items: Keyword[]) => items.map((k) => k.id);

describe("normalizeForSearch", () => {
  test("lowercases, strips accents and trims", () => {
    expect(normalizeForSearch("  Café Ñandú ")).toBe("cafe nandu");
  });
});

describe("filterKeywords", () => {
  const items = [
    kw(1, "Café vintage", "Food", "2026-01-01T00:00:00Z"),
    kw(2, "boho svg", "Wedding", "2026-01-02T00:00:00Z"),
    kw(3, "retro", "CAFÉ", "2026-01-03T00:00:00Z"),
  ];

  test("matches case- and accent-insensitively on term", () => {
    expect(ids(filterKeywords(items, "CAFE"))).toEqual([1, 3]);
  });

  test("matches on category", () => {
    expect(ids(filterKeywords(items, "wedd"))).toEqual([2]);
  });

  test("empty or whitespace query keeps every item in order", () => {
    expect(ids(filterKeywords(items, ""))).toEqual([1, 2, 3]);
    expect(ids(filterKeywords(items, "   "))).toEqual([1, 2, 3]);
  });

  test("returns an empty array when nothing matches", () => {
    expect(filterKeywords(items, "zzz")).toEqual([]);
  });
});

describe("sortKeywords", () => {
  const a = kw(1, "banana", "Zeta", "2026-01-02T00:00:00Z");
  const b = kw(2, "Apple", "Alpha", "2026-01-03T00:00:00Z");
  const c = kw(3, "cherry", "Alpha", "2026-01-01T00:00:00Z");

  test("newest sorts by createdAt descending", () => {
    expect(ids(sortKeywords([a, b, c], "newest"))).toEqual([2, 1, 3]);
  });

  test("oldest sorts by createdAt ascending", () => {
    expect(ids(sortKeywords([a, b, c], "oldest"))).toEqual([3, 1, 2]);
  });

  test("alphabetical sorts by term ignoring case", () => {
    expect(ids(sortKeywords([a, b, c], "alphabetical"))).toEqual([2, 1, 3]);
  });

  test("category sorts by category then term", () => {
    expect(ids(sortKeywords([a, b, c], "category"))).toEqual([2, 3, 1]);
  });

  test("pinned keywords come first in every mode, ordered among themselves by the mode", () => {
    const p1 = kw(10, "zulu", "Z", "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z");
    const p2 = kw(11, "alpha", "A", "2026-01-05T00:00:00Z", "2026-02-02T00:00:00Z");
    const rest = [a, b, c];
    for (const mode of SORT_MODES) {
      const sorted = sortKeywords([...rest, p1, p2], mode);
      expect(sorted.slice(0, 2).map((k) => k.pinnedAt !== null)).toEqual([true, true]);
      expect(sorted.slice(2).every((k) => k.pinnedAt === null)).toBe(true);
    }
    expect(ids(sortKeywords([a, p1, b, p2], "alphabetical")).slice(0, 2)).toEqual([11, 10]);
    expect(ids(sortKeywords([a, p1, b, p2], "newest")).slice(0, 2)).toEqual([11, 10]);
  });

  test("ties fall back to id deterministically", () => {
    const x = kw(5, "same", "cat", "2026-01-01T00:00:00Z");
    const y = kw(4, "same", "cat", "2026-01-01T00:00:00Z");
    for (const mode of SORT_MODES) {
      expect(ids(sortKeywords([x, y], mode))).toEqual([4, 5]);
      expect(ids(sortKeywords([y, x], mode))).toEqual([4, 5]);
    }
  });

  test("does not mutate its input", () => {
    const input = [a, b, c];
    const copy = [...input];
    const out = sortKeywords(input, "alphabetical");
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
  });
});

describe("arrangeKeywords", () => {
  test("filters then sorts", () => {
    const items = [
      kw(1, "cafe b", "x", "2026-01-01T00:00:00Z"),
      kw(2, "other", "x", "2026-01-02T00:00:00Z"),
      kw(3, "cafe a", "x", "2026-01-03T00:00:00Z"),
    ];
    expect(ids(arrangeKeywords(items, "café", "alphabetical"))).toEqual([3, 1]);
  });
});

describe("parseStoredSortMode", () => {
  test("accepts every valid mode", () => {
    for (const mode of SORT_MODES) expect(parseStoredSortMode(mode)).toBe(mode);
  });

  test("falls back to the default for null, empty or garbage", () => {
    expect(parseStoredSortMode(null)).toBe(DEFAULT_SORT_MODE);
    expect(parseStoredSortMode("")).toBe(DEFAULT_SORT_MODE);
    expect(parseStoredSortMode("popularity")).toBe(DEFAULT_SORT_MODE);
  });
});
