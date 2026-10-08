import type { Component, SettingsListTheme } from "@earendil-works/pi-tui";
import {
  Input,
  Key,
  matchesKey,
  truncateToWidth,
} from "@earendil-works/pi-tui";

export interface ApiBaseUrlEditorOptions {
  initial: string;
  defaultBaseUrl: string;
  theme: SettingsListTheme;
  requestRender: () => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "validating"; url: string }
  | { kind: "error"; message: string };

export function normalizeApiBaseUrlInput(value: string): string {
  return value.trim().replace(/\/+$/u, "");
}

export async function checkApiBase(
  base: string,
  timeoutMs = 8_000,
): Promise<string | null> {
  try {
    const response = await fetch(`${base}/models`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? null : `HTTP ${response.status} from ${base}/models`;
  } catch (error) {
    return error instanceof Error && error.name === "TimeoutError"
      ? `Timed out reaching ${base}/models`
      : `Could not reach ${base}/models`;
  }
}

export class ApiBaseUrlEditor implements Component {
  private readonly input = new Input();
  private readonly defaultBaseUrl: string;
  private readonly theme: SettingsListTheme;
  private readonly requestRender: () => void;
  private readonly onSubmit: (value: string) => void;
  private readonly onCancel: () => void;
  private status: Status = { kind: "idle" };

  constructor(options: ApiBaseUrlEditorOptions) {
    this.defaultBaseUrl = options.defaultBaseUrl;
    this.theme = options.theme;
    this.requestRender = options.requestRender;
    this.onSubmit = options.onSubmit;
    this.onCancel = options.onCancel;
    this.input.setValue(options.initial);
    this.input.onSubmit = (value) => void this.submit(value);
    this.input.onEscape = () => this.onCancel();
  }

  private async submit(raw: string): Promise<void> {
    const base = normalizeApiBaseUrlInput(raw);
    if (base) {
      this.status = { kind: "validating", url: `${base}/models` };
      this.requestRender();
      const error = await checkApiBase(base);
      if (error) {
        this.status = { kind: "error", message: error };
        this.requestRender();
        return;
      }
    }
    this.onSubmit(base);
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.onCancel();
      return;
    }
    if (this.status.kind === "validating") return;
    this.status = { kind: "idle" };
    this.input.handleInput(data);
  }

  render(width: number): string[] {
    const lines: string[] = [];
    lines.push(
      truncateToWidth(this.theme.label("API base URL", true), width, "", true),
    );
    lines.push(...this.input.render(width));
    if (this.status.kind === "validating") {
      lines.push(
        truncateToWidth(
          this.theme.description(`Validating ${this.status.url} …`),
          width,
          "",
          true,
        ),
      );
    } else if (this.status.kind === "error") {
      lines.push(
        truncateToWidth(
          this.theme.value(this.status.message, true),
          width,
          "",
          true,
        ),
      );
    } else {
      lines.push(
        truncateToWidth(
          this.theme.description(
            `Enter to save · empty = direct upstream (${this.defaultBaseUrl})`,
          ),
          width,
          "",
          true,
        ),
      );
    }
    return lines;
  }
}
