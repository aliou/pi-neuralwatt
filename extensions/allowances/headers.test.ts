import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config";
import { applyAllowanceHeaders } from "./headers";

describe("applyAllowanceHeaders", () => {
  it("does nothing when allowances are disabled", () => {
    const headers: Record<string, string | null | undefined> = {};

    applyAllowanceHeaders(headers, "session-1", DEFAULT_CONFIG.allowances);

    expect(headers).toEqual({});
  });

  it("injects session and request allowance headers", () => {
    const headers: Record<string, string | null | undefined> = {};

    applyAllowanceHeaders(headers, "session-1", {
      ...DEFAULT_CONFIG.allowances,
      enabled: true,
      session: { enabled: true, allowanceUsd: 1 },
      request: { enabled: true, allowanceUsd: 0.05 },
    });

    expect(headers).toEqual({
      "X-Session-ID": "session-1",
      "X-Session-Allowance-USD": "1",
      "X-Request-Allowance-USD": "0.05",
    });
  });

  it("does not inject unset allowance caps", () => {
    const headers: Record<string, string | null | undefined> = {};

    applyAllowanceHeaders(headers, "session-1", {
      ...DEFAULT_CONFIG.allowances,
      enabled: true,
      session: { enabled: true },
      request: { enabled: true },
    });

    expect(headers).toEqual({
      "X-Session-ID": "session-1",
    });
  });
});
