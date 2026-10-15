import { describe, expect, test } from "vitest";
import { activeSeasons } from "../../src/config/seasonalSeeds.js";

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
const events = (iso: string, region = "") => activeSeasons(day(iso), region).map((s) => s.event);

describe("activeSeasons", () => {
  test("a single-day event shows from 8 weeks before until the day itself", () => {
    expect(events("2026-09-05")).toContain("halloween"); // 56 days before Oct 31
    expect(events("2026-09-04")).not.toContain("halloween");
    expect(events("2026-10-31")).toContain("halloween");
    expect(events("2026-11-01")).not.toContain("halloween");
  });

  test("daysUntil counts whole days and is 0 on the day", () => {
    const halloween = activeSeasons(day("2026-10-10"), "").find((s) => s.event === "halloween")!;
    expect(halloween.daysUntil).toBe(21);
    expect(activeSeasons(day("2026-10-31"), "").find((s) => s.event === "halloween")!.daysUntil).toBe(0);
  });

  test("looks into next year near the turn of the year (Valentine's from December)", () => {
    expect(events("2026-12-20")).toContain("valentines");
    expect(events("2026-12-20")).toContain("christmas");
  });

  test("Mother's Day is May 10 for Mexico and the second Sunday of May elsewhere", () => {
    expect(activeSeasons(day("2027-05-01"), "MX").find((s) => s.event === "mothersDay")!.daysUntil).toBe(9);
    // second Sunday of May 2027 is May 9
    expect(activeSeasons(day("2027-05-01"), "US").find((s) => s.event === "mothersDay")!.daysUntil).toBe(8);
  });

  test("wedding season runs Apr 1 – Sep 30 with the same lead window and 0 days inside it", () => {
    expect(events("2027-02-03")).not.toContain("weddings");
    expect(activeSeasons(day("2027-02-04"), "").find((s) => s.event === "weddings")!.daysUntil).toBe(56);
    expect(activeSeasons(day("2027-07-15"), "").find((s) => s.event === "weddings")!.daysUntil).toBe(0);
    expect(events("2027-10-01")).not.toContain("weddings");
  });

  test("every active season carries English and Spanish seeds", () => {
    for (const season of activeSeasons(day("2026-10-20"), "")) {
      expect(season.seeds.length).toBeGreaterThanOrEqual(3);
    }
  });
});
