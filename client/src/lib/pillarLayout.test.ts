import { describe, expect, it } from "vitest";
import { BASE_RADIUS, PILLARS, pillarPosition } from "./pillarLayout";

describe("pillar layout", () => {
  it("has enough pillars to read as a monumental group", () => {
    expect(PILLARS.length).toBeGreaterThanOrEqual(5);
    expect(PILLARS.length).toBeLessThanOrEqual(9);
  });

  it("keeps every pillar fully inside the circular base", () => {
    for (const pillar of PILLARS) {
      const { x, z } = pillarPosition(pillar);
      // Distance from the base center to the pillar's farthest corner (half-diagonal of its footprint).
      const reach = Math.hypot(x, z) + Math.hypot(pillar.width, pillar.depth) / 2;
      expect(reach).toBeLessThan(BASE_RADIUS);
    }
  });

  it("never lets two pillars intersect", () => {
    for (let i = 0; i < PILLARS.length; i++) {
      for (let j = i + 1; j < PILLARS.length; j++) {
        const a = PILLARS[i];
        const b = PILLARS[j];
        const pa = pillarPosition(a);
        const pb = pillarPosition(b);
        const centerDistance = Math.hypot(pa.x - pb.x, pa.z - pb.z);
        const minDistance = Math.hypot(a.width, a.depth) / 2 + Math.hypot(b.width, b.depth) / 2;
        expect(centerDistance).toBeGreaterThan(minDistance);
      }
    }
  });

  it("varies the heights so the skyline is irregular, with one clearly tallest pillar", () => {
    const heights = PILLARS.map((p) => p.height).sort((a, b) => b - a);
    expect(new Set(heights).size).toBe(heights.length);
    expect(heights[0] - heights[1]).toBeGreaterThan(0.3);
  });

  it("gives every pillar a positive size and a sloped cap that stays inside its own height", () => {
    for (const pillar of PILLARS) {
      expect(pillar.width).toBeGreaterThan(0);
      expect(pillar.depth).toBeGreaterThan(0);
      expect(pillar.height).toBeGreaterThan(0);
      // The cap rises or falls by slope * width; it must never cut below the base of the pillar.
      expect(Math.abs(pillar.capSlope) * pillar.width).toBeLessThan(pillar.height);
    }
  });

  it("places a pillar at the position implied by its polar coordinates", () => {
    const { x, z } = pillarPosition({ angle: 90, radius: 2, width: 1, depth: 1, height: 1, capSlope: 0 });
    expect(x).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(2, 5);
  });
});
