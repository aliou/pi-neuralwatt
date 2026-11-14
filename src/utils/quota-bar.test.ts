import { describe, expect, it } from "vitest";
import { isFreeEnergyStale, percentFreeEnergyRemaining } from "./quota-bar";

describe("percentFreeEnergyRemaining", () => {
  it("rounds remaining over included", () => {
    expect(
      percentFreeEnergyRemaining({
        kwh_included: 0.825,
        kwh_remaining: 0.4125,
      }),
    ).toBe(50);
  });

  it("returns 0 when the allowance is empty", () => {
    expect(
      percentFreeEnergyRemaining({ kwh_included: 0, kwh_remaining: 0 }),
    ).toBe(0);
  });
});

describe("isFreeEnergyStale", () => {
  it("is fresh before the reset instant", () => {
    expect(
      isFreeEnergyStale(
        { reset_at: "2026-11-15T00:00:00Z" },
        Date.parse("2026-11-14T23:59:59Z"),
      ),
    ).toBe(false);
  });

  it("is stale at and after the reset instant", () => {
    expect(
      isFreeEnergyStale(
        { reset_at: "2026-11-15T00:00:00Z" },
        Date.parse("2026-11-15T00:00:00Z"),
      ),
    ).toBe(true);
  });
});
