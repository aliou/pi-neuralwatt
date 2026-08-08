import { Panel } from "@aliou/pi-utils-ui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Input,
  type SettingItem,
  SettingsList,
  type TUI,
} from "@earendil-works/pi-tui";
import { formatDuration, parseDuration } from "../../../../../src/duration";
import type { FlexSessionState } from "../../../../../src/flex-session";

function buildTimeoutSubmenu(
  theme: Theme,
  currentValue: string,
  done: (value?: string) => void,
): Component {
  const initialMs = parseDuration(currentValue, "m") ?? 30 * 60 * 1000;
  const input = new Input();
  const initialValue = formatDuration(initialMs);
  input.setValue(initialValue);
  (input as unknown as { cursor: number }).cursor = initialValue.length;
  input.onSubmit = () => {
    const ms = parseDuration(input.getValue(), "m");
    if (ms !== undefined && ms > 0) {
      done(formatDuration(ms));
    }
  };
  input.onEscape = () => done();

  return {
    render: (width: number) => {
      const lines: string[] = [];
      lines.push(theme.fg("text", "  Timeout in minutes (e.g. 30, 30m, 1h):"));
      lines.push(...input.render(width));
      lines.push("");
      lines.push(theme.fg("dim", "  Presets: 5m, 15m, 30m, 1h, 2h"));
      return lines;
    },
    handleInput: (data: string) => {
      input.focused = true;
      input.handleInput(data);
    },
    invalidate: () => {},
  };
}

export class FlexConfigComponent implements Component {
  private panel: Panel;
  private settings: SettingsList;

  constructor(
    theme: Theme,
    tui: TUI,
    initial: FlexSessionState,
    onChange: (state: FlexSessionState) => void,
    onClose: () => void,
  ) {
    const state: FlexSessionState = { ...initial };

    const items: SettingItem[] = [
      {
        id: "enabled",
        label: "Enabled",
        currentValue: state.enabled ? "on" : "off",
        values: ["on", "off"],
        description:
          "Toggle Flex tier for this session. When on, service_tier is sent as flex.",
      },
      {
        id: "timeout",
        label: "Timeout",
        currentValue: formatDuration(state.timeoutMs),
        description:
          "How long to wait for a Flex request before the client aborts.",
        submenu: (currentValue, done) =>
          buildTimeoutSubmenu(theme, currentValue, done),
      },
    ];

    this.settings = new SettingsList(
      items,
      5,
      {
        label: (text, selected) =>
          selected
            ? theme.fg("accent", theme.bold(text))
            : theme.fg("text", text),
        value: (text, selected) =>
          selected ? theme.fg("accent", text) : theme.fg("muted", text),
        description: (text) => theme.fg("dim", text),
        cursor: theme.fg("accent", "> "),
        hint: (text) => theme.fg("dim", text),
      },
      (id, value) => {
        if (id === "enabled") {
          state.enabled = value === "on";
        } else if (id === "timeout") {
          const ms = parseDuration(value);
          if (ms !== undefined && ms > 0) {
            state.timeoutMs = ms;
          }
        }
        onChange({ ...state });
        tui.requestRender();
      },
      onClose,
    );

    this.panel = new Panel({
      title: "Neuralwatt Flex Mode",
      body: this.settings,
      borderStyle: (s) => theme.fg("border", s),
      titleStyle: (s) => theme.fg("accent", theme.bold(s)),
    });
  }

  render(width: number): string[] {
    return this.panel.render(width);
  }

  handleInput(data: string): void {
    this.settings.handleInput(data);
  }

  invalidate(): void {
    this.panel.invalidate();
  }
}
