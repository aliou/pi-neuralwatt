import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { formatDuration, parseDuration } from "../../../../src/duration";
import { NEURALWATT_FLEX_UPDATED_EVENT } from "../../../../src/events";
import {
  type FlexSessionState,
  getFlexSessionState,
  setFlexEnabled,
  setFlexTimeoutMs,
} from "../../../../src/flex-session";
import { FlexConfigComponent } from "./components/flex-config-display";

type Notify = (message: string, type: "info" | "error" | "warning") => void;

function formatState(state: FlexSessionState): string {
  return `Flex: ${state.enabled ? "on" : "off"}, timeout: ${formatDuration(state.timeoutMs)}`;
}

function emitFlexUpdated(pi: ExtensionAPI): void {
  const state = getFlexSessionState();
  pi.events.emit(NEURALWATT_FLEX_UPDATED_EVENT, {
    enabled: state.enabled,
    timeoutMs: state.timeoutMs,
  });
}

function applyArgs(tokens: string[], notify: Notify, pi: ExtensionAPI): void {
  const sub = tokens[0];

  if (!sub || sub === "status") {
    notify(formatState(getFlexSessionState()), "info");
    return;
  }

  if (sub === "on") {
    setFlexEnabled(true);
    emitFlexUpdated(pi);
    notify(formatState(getFlexSessionState()), "info");
    return;
  }

  if (sub === "off") {
    setFlexEnabled(false);
    emitFlexUpdated(pi);
    notify(formatState(getFlexSessionState()), "info");
    return;
  }

  if (sub === "timeout") {
    const raw = tokens[1];
    if (!raw) {
      notify("Usage: /neuralwatt:flex timeout <duration>", "error");
      return;
    }
    if (tokens.length > 2) {
      notify(
        "Too many arguments. Usage: /neuralwatt:flex timeout <duration>",
        "error",
      );
      return;
    }
    const ms = parseDuration(raw);
    if (ms === undefined || ms <= 0) {
      notify(`Invalid timeout: ${raw}. Use e.g. 30m, 1h, 1800000.`, "error");
      return;
    }
    setFlexTimeoutMs(ms);
    emitFlexUpdated(pi);
    notify(formatState(getFlexSessionState()), "info");
    return;
  }

  notify(
    `Unknown option: ${sub}. Use on, off, timeout <duration>, or status.`,
    "error",
  );
}

function getCompletions(prefix: string): AutocompleteItem[] | null {
  const tokens = prefix.trim().split(/\s+/);
  const first = tokens[0] ?? "";
  const isFirstComplete = !prefix.endsWith(" ") && tokens.length === 1;

  if (tokens.length === 0 || (tokens.length === 1 && isFirstComplete)) {
    const options = ["on", "off", "timeout", "status"];
    return options
      .filter((o) => o.startsWith(first))
      .map((o) => ({ value: o, label: o }));
  }

  if (tokens[0] === "timeout") {
    const second = tokens[1] ?? "";
    const durations = ["5m", "15m", "30m", "1h", "2h"];
    return durations
      .filter((d) => d.startsWith(second))
      .map((d) => ({ value: d, label: d }));
  }

  return null;
}

export function registerFlexCommand(pi: ExtensionAPI): void {
  pi.registerCommand("neuralwatt:flex", {
    description: "Configure Neuralwatt Flex tier for this session",
    getArgumentCompletions: (prefix) => getCompletions(prefix),
    handler: async (args, ctx) => {
      const trimmed = args.trim();

      if (trimmed.length > 0) {
        const tokens = trimmed.split(/\s+/);
        applyArgs(tokens, (msg, type) => ctx.ui.notify(msg, type), pi);
        return;
      }

      const initial = { ...getFlexSessionState() };

      const result = await ctx.ui.custom<null>(
        (tui, theme, _keybindings, done) => {
          return new FlexConfigComponent(
            theme,
            tui,
            initial,
            (state) => {
              setFlexEnabled(state.enabled);
              setFlexTimeoutMs(state.timeoutMs);
              emitFlexUpdated(pi);
            },
            () => done(null),
          );
        },
      );

      if (result === undefined) {
        ctx.ui.notify(formatState(getFlexSessionState()), "info");
      }
    },
  });
}
