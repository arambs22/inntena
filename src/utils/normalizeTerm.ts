/**
 * One canonical form per search term, so that "Boho  Clipart", " boho clipart " and an accent written
 * in composed or decomposed form all map to the same cache row.
 */
export function normalizeTerm(term: string): string {
  return term.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}
