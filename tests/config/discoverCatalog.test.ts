import { describe, expect, test } from "vitest";
import { CATALOG_FAMILIES, DISCOVER_CATALOG } from "../../src/config/discoverCatalog.js";
import { normalizeTerm } from "../../src/utils/normalizeTerm.js";

describe("DISCOVER_CATALOG", () => {
  test("has no duplicates after normalization", () => {
    const terms = DISCOVER_CATALOG.map((entry) => normalizeTerm(entry.term));
    expect(new Set(terms).size).toBe(terms.length);
  });

  test("terms are non-empty, contain no pipe and are multi-word niche phrases", () => {
    for (const { term } of DISCOVER_CATALOG) {
      expect(term.trim()).not.toBe("");
      expect(term).not.toContain("|");
      expect(term.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2);
    }
  });

  test("every family is used and every entry has a known family", () => {
    const used = new Set(DISCOVER_CATALOG.map((entry) => entry.family));
    for (const family of CATALOG_FAMILIES) expect(used.has(family)).toBe(true);
    expect([...used].every((family) => (CATALOG_FAMILIES as readonly string[]).includes(family))).toBe(true);
  });

  test("is large enough to offer variety", () => {
    expect(DISCOVER_CATALOG.length).toBeGreaterThanOrEqual(140);
  });
});
