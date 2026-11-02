import { DEFAULT_CONFIG } from "./defaults";
import type { NeuralwattApi } from "./types";

export function resolveApi(value: string | undefined): NeuralwattApi {
  if (value === "anthropic-messages" || value === "openai-completions") {
    return value;
  }
  return DEFAULT_CONFIG.provider.api;
}

export function resolveApiBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim().replace(/\/+$/u, "");
  if (!trimmed) {
    return DEFAULT_CONFIG.provider.apiBaseUrl;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_CONFIG.provider.apiBaseUrl;
    }
  } catch {
    return DEFAULT_CONFIG.provider.apiBaseUrl;
  }
  return trimmed;
}
