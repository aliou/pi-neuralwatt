import { describe, expect, it, vi } from "vitest";
import type { NeuralwattQuotas } from "../../src/types/quota-api";
import {
  readQuotaCommentsFromTee,
  updateQuotasFromSseComment,
} from "./sse-quotas";

function quotaFixture(): NeuralwattQuotas {
  return {
    snapshot_at: "2026-06-17T00:00:00.000Z",
    balance: {
      credits_remaining_usd: 10,
      total_credits_usd: 20,
      credits_used_usd: 10,
      accounting_method: "token",
    },
    usage: {
      lifetime: { cost_usd: 5, requests: 100, tokens: 1000, energy_kwh: 1 },
      current_month: {
        cost_usd: 2,
        requests: 10,
        tokens: 500,
        energy_kwh: 0.5,
      },
    },
    limits: { overage_limit_usd: null, rate_limit_tier: "standard" },
    subscription: {
      plan: "standard",
      status: "active",
      billing_interval: "month",
      current_period_start: "",
      current_period_end: "",
      auto_renew: false,
      kwh_included: 5,
      kwh_used: 1,
      kwh_remaining: 4,
      in_overage: false,
    },
    key: { name: "test", allowance: null },
  };
}

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("updateQuotasFromSseComment", () => {
  it("applies energy comments", () => {
    const quotas = quotaFixture();
    const result = updateQuotasFromSseComment(
      quotas,
      ': energy {"energy_joules":360000}',
    );

    expect(result).not.toBe(quotas);
    expect(result?.usage.current_month.energy_kwh).toBeCloseTo(0.6);
    expect(result?.usage.lifetime.energy_kwh).toBeCloseTo(1.1);
    expect(result?.subscription?.kwh_used).toBeCloseTo(1.1);
    expect(result?.subscription?.kwh_remaining).toBeCloseTo(3.9);
  });

  it("applies cost comments", () => {
    const quotas = quotaFixture();
    const result = updateQuotasFromSseComment(
      quotas,
      ': cost {"request_cost_usd":0.25}',
    );

    expect(result).not.toBe(quotas);
    expect(result?.balance.credits_remaining_usd).toBeCloseTo(9.75);
    expect(result?.balance.credits_used_usd).toBeCloseTo(10.25);
    expect(result?.usage.current_month.cost_usd).toBeCloseTo(2.25);
    expect(result?.usage.lifetime.cost_usd).toBeCloseTo(5.25);
  });

  it("ignores malformed and unknown comments", () => {
    const quotas = quotaFixture();
    expect(updateQuotasFromSseComment(quotas, ": energy nope")).toBe(quotas);
    expect(updateQuotasFromSseComment(quotas, ": mcr-session {}")).toBe(quotas);
  });
});

describe("readQuotaCommentsFromTee", () => {
  it("reads comments across split chunks", async () => {
    const onComment = vi.fn();
    await readQuotaCommentsFromTee(
      streamFromChunks([
        ': energy {"energy_',
        'joules":360000}\n: cost {"request_cost_usd":',
        "0.25}\n",
      ]),
      onComment,
    );

    expect(onComment).toHaveBeenCalledWith(': energy {"energy_joules":360000}');
    expect(onComment).toHaveBeenCalledWith(': cost {"request_cost_usd":0.25}');
  });
});
