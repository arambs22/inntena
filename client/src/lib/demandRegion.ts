const STORAGE_KEY = "inntena_demand_region";

/** The region that drives demand, the verdict and Discover: the stored choice while it is active, else the first active one. */
export function resolveDemandRegion(stored: string | null, active: string[]): string | undefined {
  if (stored !== null && active.includes(stored)) return stored;
  return active[0];
}

/** The last chosen demand region, or null when none was stored or storage is unavailable. */
export function loadDemandRegion(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Remembers the chosen demand region; storage failures are ignored (it is only a convenience). */
export function saveDemandRegion(region: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, region);
  } catch {
    // Private mode or blocked storage: the choice simply is not remembered.
  }
}
