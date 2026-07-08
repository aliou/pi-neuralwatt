import { describe, expect, it } from "vitest";
import { parseAllowanceHeaders } from "./events";

describe("parseAllowanceHeaders", () => {
  it("returns undefined when no session allowance headers are present", () => {
    expect(parseAllowanceHeaders({})).toBeUndefined();
    expect(
      parseAllowanceHeaders({ "x-request-cost-usd": "0.01" }),
    ).toBeUndefined();
  });

  it("parses session allowance headers case-insensitively", () => {
    expect(
      parseAllowanceHeaders({
        "X-Session-Spent-USD": "0.12",
        "x-session-allowance-remaining-usd": "0.88",
      }),
    ).toEqual({
      sessionSpentUsd: 0.12,
      sessionAllowanceRemainingUsd: 0.88,
    });
  });

  it("uses null remaining when no remaining header is present", () => {
    expect(parseAllowanceHeaders({ "X-Session-Spent-USD": "0.12" })).toEqual({
      sessionSpentUsd: 0.12,
      sessionAllowanceRemainingUsd: null,
    });
  });

  it("ignores invalid session-spent header values", () => {
    expect(
      parseAllowanceHeaders({ "X-Session-Spent-USD": "nope" }),
    ).toBeUndefined();
  });
});
