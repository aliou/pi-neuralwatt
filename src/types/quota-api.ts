/** Response from /v1/quota */

export interface NeuralwattKeyAllowance {
  limit_usd: number;
  period: string;
  spent_usd: number;
  remaining_usd: number;
  blocked: boolean;
}

export interface NeuralwattSubscription {
  plan: string;
  status: string;
  billing_interval: string;
  current_period_start: string;
  current_period_end: string;
  auto_renew: boolean;
  kwh_included: number;
  kwh_used: number;
  kwh_remaining: number;
  in_overage: boolean;
}

export interface NeuralwattQuotas {
  snapshot_at: string;
  balance: {
    credits_remaining_usd: number;
    total_credits_usd: number;
    credits_used_usd: number;
    accounting_method: string;
  };
  usage: {
    lifetime: {
      cost_usd: number;
      requests: number;
      tokens: number;
      energy_kwh: number;
    };
    current_month: {
      cost_usd: number;
      requests: number;
      tokens: number;
      energy_kwh: number;
    };
  };
  limits: {
    overage_limit_usd: number | null;
    rate_limit_tier: string;
  };
  subscription: NeuralwattSubscription | null;
  key: {
    name: string;
    allowance: NeuralwattKeyAllowance | null;
  };
}
