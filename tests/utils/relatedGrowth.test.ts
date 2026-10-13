import { describe, expect, test } from "vitest";
import { growthNumber, sortByGrowthDesc } from "../../src/utils/relatedGrowth.js";

describe("growthNumber", () => {
  test("reads the raw numeric value Google returns", () => {
    expect(growthNumber("250")).toBe(250);
    expect(growthNumber("836500")).toBe(836500);
  });

  test("reads the number out of an already formatted value", () => {
    expect(growthNumber("+250%")).toBe(250);
    expect(growthNumber("+1,250%")).toBe(1250);
  });

  test("treats a literal Breakout as larger than any number", () => {
    expect(growthNumber("Breakout")).toBe(Number.POSITIVE_INFINITY);
    expect(growthNumber("breakout")).toBe(Number.POSITIVE_INFINITY);
  });

  test("ranks unparseable values below every real one", () => {
    expect(growthNumber("")).toBeLessThan(0);
    expect(growthNumber("n/a")).toBeLessThan(0);
  });
});

describe("sortByGrowthDesc", () => {
  const row = (query: string, growthValue: string) => ({ query, growthValue });

  test("orders from the largest growth to the smallest", () => {
    const sorted = sortByGrowthDesc([row("a", "40"), row("b", "836500"), row("c", "250"), row("d", "59000")]);
    expect(sorted.map((r) => r.query)).toEqual(["b", "d", "c", "a"]);
  });

  test("puts a literal Breakout first and unparseable values last", () => {
    const sorted = sortByGrowthDesc([row("a", "n/a"), row("b", "300"), row("c", "Breakout")]);
    expect(sorted.map((r) => r.query)).toEqual(["c", "b", "a"]);
  });

  test("breaks ties alphabetically so the order is deterministic", () => {
    const sorted = sortByGrowthDesc([row("zebra", "100"), row("apple", "100"), row("mango", "100")]);
    expect(sorted.map((r) => r.query)).toEqual(["apple", "mango", "zebra"]);
  });

  test("does not mutate its input", () => {
    const input = [row("a", "1"), row("b", "2")];
    const copy = [...input];
    sortByGrowthDesc(input);
    expect(input).toEqual(copy);
  });
});
