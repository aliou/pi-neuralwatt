import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config";
import type { NeuralwattAllowancesUpdatedPayload } from "../../src/events";
import { checkAllowanceWarnings, clearAllowanceWarningState } from "./warnings";

function ctx(notify = vi.fn()): ExtensionContext {
  return {
    hasUI: true,
    ui: { notify },
  } as unknown as ExtensionContext;
}

function snapshot(
  overrides: Partial<NeuralwattAllowancesUpdatedPayload> = {},
): NeuralwattAllowancesUpdatedPayload {
  return {
    sessionId: "session-1",
    sessionAllowanceUsd: 1,
    requestAllowanceUsd: null,
    sessionSpentUsd: 0.8,
    sessionAllowanceRemainingUsd: 0.2,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const warningConfig = {
  ...DEFAULT_CONFIG.allowances.warnings,
  enabled: true,
  remainingThresholds: [50, 20, 10],
};

beforeEach(() => {
  clearAllowanceWarningState();
});

describe("checkAllowanceWarnings", () => {
  it("warns once for crossed thresholds in a session", () => {
    const notify = vi.fn();
    const currentCtx = ctx(notify);

    checkAllowanceWarnings(currentCtx, snapshot(), warningConfig);
    checkAllowanceWarnings(currentCtx, snapshot(), warningConfig);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain("20% remaining");
  });

  it("marks higher crossed thresholds when first update is already critical", () => {
    const notify = vi.fn();
    const currentCtx = ctx(notify);

    checkAllowanceWarnings(
      currentCtx,
      snapshot({ sessionSpentUsd: 0.95, sessionAllowanceRemainingUsd: 0.05 }),
      warningConfig,
    );
    checkAllowanceWarnings(currentCtx, snapshot(), warningConfig);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1]).toBe("error");
  });

  it("does not warn without remaining allowance state", () => {
    const notify = vi.fn();

    checkAllowanceWarnings(
      ctx(notify),
      snapshot({ sessionAllowanceRemainingUsd: null }),
      warningConfig,
    );

    expect(notify).not.toHaveBeenCalled();
  });

  it("does not warn when warnings are disabled", () => {
    const notify = vi.fn();

    checkAllowanceWarnings(ctx(notify), snapshot(), {
      ...warningConfig,
      enabled: false,
    });

    expect(notify).not.toHaveBeenCalled();
  });
});
