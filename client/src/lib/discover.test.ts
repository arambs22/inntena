import { describe, expect, it } from "vitest";
import { TRANSLATIONS } from "./i18n";
import { describeOrigin } from "./discover";

describe("describeOrigin", () => {
  const t = TRANSLATIONS.en;
  it("names the keyword a related query rose with", () => {
    expect(describeOrigin({ type: "related", from: "boho clipart", breakout: true }, t)).toBe('Rising with "boho clipart"');
  });
  it("names the season and the days left", () => {
    expect(describeOrigin({ type: "season", event: "halloween", daysUntil: 17 }, t)).toBe("Season: Halloween in 17 days");
    expect(describeOrigin({ type: "season", event: "weddings", daysUntil: 0 }, t)).toBe("Season: Wedding season (now)");
  });
});
