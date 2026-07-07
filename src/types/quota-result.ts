import type { NeuralwattQuotas } from "./quota-api";

export type QuotasErrorKind =
  | "cancelled"
  | "timeout"
  | "config"
  | "http"
  | "network";

export type QuotasResult =
  | { success: true; data: { quotas: NeuralwattQuotas } }
  | { success: false; error: { message: string; kind: QuotasErrorKind } };
