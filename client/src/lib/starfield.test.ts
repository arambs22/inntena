import { describe, expect, it } from "vitest";
import { generateStars } from "./starfield";

describe("generateStars", () => {
  it("returns exactly the requested number of stars", () => {
    expect(generateStars(70)).toHaveLength(70);
    expect(generateStars(0)).toHaveLength(0);
  });

  it("is deterministic for a given seed, so the sky never reshuffles between renders", () => {
    expect(generateStars(40, 3)).toEqual(generateStars(40, 3));
  });

  it("produces a different sky for a different seed", () => {
    expect(generateStars(40, 1)).not.toEqual(generateStars(40, 2));
  });

  it("keeps every star inside the container and with a visible opacity", () => {
    for (const star of generateStars(200)) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThan(100);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThan(100);
      expect(star.opacity).toBeGreaterThan(0);
      expect(star.opacity).toBeLessThanOrEqual(1);
      expect([1, 2]).toContain(star.size);
    }
  });

  it("mixes a minority of larger, brighter stars in with the small ones", () => {
    const stars = generateStars(400);
    const large = stars.filter((s) => s.size === 2).length;
    expect(large).toBeGreaterThan(0);
    expect(large).toBeLessThan(stars.length / 2);
  });
});
