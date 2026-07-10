export interface FlexSessionState {
  enabled: boolean;
  timeoutMs: number;
}

const DEFAULT_FLEX_TIMEOUT_MS = 30 * 60 * 1000;

let state: FlexSessionState = {
  enabled: false,
  timeoutMs: DEFAULT_FLEX_TIMEOUT_MS,
};

export function getFlexSessionState(): Readonly<FlexSessionState> {
  return state;
}

export function setFlexEnabled(enabled: boolean): void {
  state.enabled = enabled;
}

export function setFlexTimeoutMs(timeoutMs: number): void {
  state.timeoutMs = timeoutMs;
}

export function resetFlexSessionState(): void {
  state = { enabled: false, timeoutMs: DEFAULT_FLEX_TIMEOUT_MS };
}
