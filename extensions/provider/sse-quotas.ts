import type { NeuralwattQuotas } from "../../src/types/quota-api";

const JOULES_PER_KWH = 3_600_000;

export function updateQuotasFromSseComment(
  quotas: NeuralwattQuotas | undefined,
  line: string,
): NeuralwattQuotas | undefined {
  if (!quotas) return;
  const trimmed = line.trim();
  const next = structuredClone(quotas);

  try {
    if (trimmed.startsWith(": energy ")) {
      const energy = JSON.parse(trimmed.slice(9)) as { energy_joules?: number };
      const energyKwh = (energy.energy_joules ?? 0) / JOULES_PER_KWH;
      if (energyKwh <= 0) return quotas;
      next.usage.current_month.energy_kwh += energyKwh;
      next.usage.lifetime.energy_kwh += energyKwh;
      if (next.subscription) {
        next.subscription.kwh_used += energyKwh;
        next.subscription.kwh_remaining = Math.max(
          0,
          next.subscription.kwh_remaining - energyKwh,
        );
      }
      next.snapshot_at = new Date().toISOString();
      return next;
    }

    if (trimmed.startsWith(": cost ")) {
      const cost = JSON.parse(trimmed.slice(7)) as {
        request_cost_usd?: number;
      };
      const requestCostUsd = cost.request_cost_usd ?? 0;
      if (requestCostUsd <= 0) return quotas;
      next.balance.credits_remaining_usd = Math.max(
        0,
        next.balance.credits_remaining_usd - requestCostUsd,
      );
      next.balance.credits_used_usd += requestCostUsd;
      next.usage.current_month.cost_usd += requestCostUsd;
      next.usage.lifetime.cost_usd += requestCostUsd;
      next.snapshot_at = new Date().toISOString();
      return next;
    }
  } catch {
    return quotas;
  }

  return quotas;
}

export async function readQuotaCommentsFromTee(
  body: ReadableStream<Uint8Array>,
  onComment: (line: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) onComment(line);
    }

    const final = decoder.decode(new Uint8Array(0), { stream: false });
    const remaining = (buffer + final).trim();
    if (remaining) onComment(remaining);
  } catch {
    // The SDK side may abort the tee; quota comments are best-effort.
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}
