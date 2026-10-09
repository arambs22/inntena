import { createRandom } from "./random";

export interface Star {
  /** Horizontal position as a percentage of the container width (0-100). */
  x: number;
  /** Vertical position as a percentage of the container height (0-100). */
  y: number;
  /** Diameter in CSS pixels. */
  size: number;
  /** Peak opacity (0-1). */
  opacity: number;
}

/**
 * Generates a reproducible set of stars. Most are small and dim, a few are larger and
 * brighter, which reads as depth without any animation. Deterministic on purpose: the
 * sky must not reshuffle on every render or between server and client.
 */
export function generateStars(count: number, seed = 7): Star[] {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => {
    const bright = random() > 0.85;
    return {
      x: random() * 100,
      y: random() * 100,
      size: bright ? 2 : 1,
      opacity: bright ? 0.55 + random() * 0.35 : 0.2 + random() * 0.35,
    };
  });
}
