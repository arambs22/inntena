import { describe, expect, it } from "vitest";
import { nextPollDelay } from "./polling";

describe("nextPollDelay", () => {
  it("backs off from 4 s to 30 s", () => {
    expect([0, 1, 2, 3, 4].map(nextPollDelay)).toEqual([4000, 8000, 15000, 30000, 30000]);
  });
  it("stops after about two minutes", () => {
    expect(nextPollDelay(5)).toBe(30000);
    expect(nextPollDelay(6)).toBeNull();
    expect(nextPollDelay(100)).toBeNull();
  });
});
