import { describe, expect, test } from "vitest";
import { normalizeTerm } from "../../src/utils/normalizeTerm.js";

describe("normalizeTerm", () => {
  test("lowercases and trims", () => {
    expect(normalizeTerm("  Boho Clipart ")).toBe("boho clipart");
  });

  test("collapses runs of whitespace, including tabs and newlines", () => {
    expect(normalizeTerm("boho \t\n  clipart")).toBe("boho clipart");
  });

  test("treats composed and decomposed accents as the same term", () => {
    const composed = "café illustrations";
    const decomposed = "café illustrations";
    expect(decomposed).not.toBe(composed);
    expect(normalizeTerm(decomposed)).toBe(normalizeTerm(composed));
  });

  test("is idempotent and keeps an empty string empty", () => {
    expect(normalizeTerm(normalizeTerm("  A  B "))).toBe("a b");
    expect(normalizeTerm("   ")).toBe("");
  });
});
