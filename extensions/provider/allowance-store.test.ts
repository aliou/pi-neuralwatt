import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config";
import { buildAllowancesFromHeaders } from "./allowance-store";

describe("buildAllowancesFromHeaders", () => {
  it("returns undefined when allowance headers are absent", () => {
    expect(
      buildAllowancesFromHeaders({}, "session-1", DEFAULT_CONFIG.allowances),
    ).toBeUndefined();
  });

  it("builds an allowance snapshot from response headers and config", () => {
    const snapshot = buildAllowancesFromHeaders(
      {
        "X-Session-Spent-USD": "0.25",
        "X-Session-Allowance-Remaining-USD": "0.75",
      },
      "session-1",
      {
        ...DEFAULT_CONFIG.allowances,
        enabled: true,
        session: { enabled: true, allowanceUsd: 1 },
        request: { enabled: true, allowanceUsd: 0.05 },
      },
    );

    expect(snapshot).toMatchObject({
      sessionId: "session-1",
      sessionAllowanceUsd: 1,
      requestAllowanceUsd: 0.05,
      sessionSpentUsd: 0.25,
      sessionAllowanceRemainingUsd: 0.75,
    });
    expect(snapshot?.updatedAt).toEqual(expect.any(String));
  });

  it("omits configured caps when their scopes are disabled", () => {
    const snapshot = buildAllowancesFromHeaders(
      { "X-Session-Spent-USD": "0.25" },
      "session-1",
      {
        ...DEFAULT_CONFIG.allowances,
        enabled: true,
        session: { enabled: false, allowanceUsd: 1 },
        request: { enabled: false, allowanceUsd: 0.05 },
      },
    );

    expect(snapshot).toMatchObject({
      sessionAllowanceUsd: null,
      requestAllowanceUsd: null,
    });
  });
});
