/** Radius of the circular base the pillars stand on, in scene units. */
export const BASE_RADIUS = 3;

export interface Pillar {
  /** Angle around the base center, in degrees. */
  angle: number;
  /** Distance from the base center, in scene units. */
  radius: number;
  width: number;
  depth: number;
  height: number;
  /** How much the top face rises (positive) or falls (negative) per unit of width, giving the cap its slant. */
  capSlope: number;
}

/**
 * The composition is authored by hand rather than generated: a monumental group reads
 * better with deliberate rhythm (one dominant pillar, an irregular skyline, a few low
 * ones in front) than with random scatter. Tall pillars sit toward the rim so the group
 * opens up toward the viewer instead of hiding behind itself.
 */
export const PILLARS: readonly Pillar[] = [
  { angle: 215, radius: 1.8, width: 0.46, depth: 0.46, height: 4.9, capSlope: 0.42 },
  { angle: 0, radius: 1.7, width: 0.46, depth: 0.46, height: 4.2, capSlope: -0.38 },
  { angle: 110, radius: 1.9, width: 0.5, depth: 0.5, height: 3.7, capSlope: 0.36 },
  { angle: 330, radius: 1.9, width: 0.42, depth: 0.42, height: 3.3, capSlope: 0.34 },
  { angle: 55, radius: 1.2, width: 0.42, depth: 0.42, height: 3.0, capSlope: -0.36 },
  { angle: 275, radius: 1.0, width: 0.42, depth: 0.42, height: 2.7, capSlope: 0.34 },
  { angle: 165, radius: 1.1, width: 0.38, depth: 0.38, height: 2.2, capSlope: -0.3 },
];

/** Converts a pillar's polar coordinates on the base to scene x/z. */
export function pillarPosition(pillar: Pillar): { x: number; z: number } {
  const radians = (pillar.angle * Math.PI) / 180;
  return { x: Math.cos(radians) * pillar.radius, z: Math.sin(radians) * pillar.radius };
}
