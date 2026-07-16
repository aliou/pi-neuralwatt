import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config";
import type { NeuralwattAllowancesUpdatedPayload } from "../../src/events";
import { renderAllowanceWidget } from "./widget";

function snapshot(
  overrides: Partial<NeuralwattAllowancesUpdatedPayload> = {},
): NeuralwattAllowancesUpdatedPayload {
  return {
    sessionId: "session-1",
    sessionAllowanceUsd: 1,
    requestAllowanceUsd: 0.05,
    sessionSpentUsd: 0.75,
    sessionAllowanceRemainingUsd: 0.25,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("renderAllowanceWidget", () => {
  it("renders remaining session allowance and the configured request cap", () => {
    expect(
      renderAllowanceWidget(snapshot(), {
        ...DEFAULT_CONFIG.allowances,
        request: { enabled: true, allowanceUsd: 0.05 },
      }),
    ).toEqual([
      "Neuralwatt allowance",
      "Session: $0.25 remaining (25% remaining)",
      "Spent: $0.75",
      "Request cap: $0.05",
    ]);
  });

  it("renders spent-only state when no session cap is reported", () => {
    expect(
      renderAllowanceWidget(
        snapshot({ sessionAllowanceRemainingUsd: null }),
        DEFAULT_CONFIG.allowances,
      ),
    ).toEqual(["Neuralwatt allowance", "Session spent: $0.75"]);
  });
});
