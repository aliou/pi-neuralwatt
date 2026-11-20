import { describe, expect, it } from "vitest";
import { formatEnergy } from "./quota-format";

describe("formatEnergy", () => {
  it("uses readable joule, watt-hour, and kilowatt-hour units", () => {
    expect(formatEnergy(45.78)).toBe("45.78 J");
    expect(formatEnergy(45_000)).toBe("12.5 Wh");
    expect(formatEnergy(4_500_000)).toBe("1.25 kWh");
  });
});
