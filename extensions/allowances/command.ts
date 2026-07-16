import {
  type ConfigStore,
  registerSettingsCommand,
  SettingsDetailEditor,
  type SettingsSection,
  type SettingsTheme,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  configLoader,
  DEFAULT_CONFIG,
  type NeuralwattAllowancesConfig,
  type NeuralwattConfig,
  type NeuralwattRawConfig,
  type ResolvedNeuralwattConfig,
} from "../../src/config";
import { NEURALWATT_CONFIG_UPDATED_EVENT } from "../../src/events";
import { formatUsd } from "../../src/utils/quota-format";

const COMMAND_NAME = "neuralwatt:allowances";
const NUMBER_PATTERN = /^(?:\d+\.?\d*|\.\d+)$/;

const globalOnlyConfigStore: ConfigStore<
  NeuralwattConfig,
  ResolvedNeuralwattConfig
> = {
  getConfig: () => configLoader.getConfig(),
  getRawConfig: (scope) =>
    scope === "global"
      ? ((configLoader.getRawConfig("global") ??
          null) as NeuralwattConfig | null)
      : null,
  hasScope: (scope) => scope === "global",
  hasConfig: (scope) => scope === "global" && configLoader.hasConfig("global"),
  getEnabledScopes: () => ["global"],
  save: async (scope, config) => {
    if (scope !== "global") throw new Error("Allowances only save globally");
    await configLoader.save("global", config);
  },
};

function ensureAllowances(
  config: NeuralwattConfig,
): NeuralwattAllowancesConfig {
  config.allowances ??= {};
  return config.allowances;
}

function currentAllowances(
  config: NeuralwattConfig,
): NeuralwattAllowancesConfig {
  return config.allowances ?? {};
}

function hasAllowanceConfig(
  config: NeuralwattRawConfig | null,
): config is NeuralwattConfig {
  return Boolean(
    config &&
      typeof config === "object" &&
      "allowances" in config &&
      config.allowances &&
      typeof config.allowances === "object",
  );
}

function boolValue(value: boolean | undefined, fallback: boolean): boolean {
  return value ?? fallback;
}

function numberValue(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function formatOptionalUsd(value: number | undefined): string {
  return value === undefined ? "unset" : formatUsd(value);
}

function parseStrictNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed || !NUMBER_PATTERN.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalNumber(value: string): number | undefined {
  return parseStrictNumber(value);
}

function validatePositiveUsd(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseStrictNumber(trimmed);
  if (parsed === undefined || parsed <= 0) {
    return "Enter a positive USD amount, or leave blank to unset.";
  }
  return null;
}

function parseThresholds(value: string): number[] | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed
    .split(/[ ,]+/)
    .map((part) => parseStrictNumber(part))
    .filter((value): value is number => value !== undefined);
}

function validateThresholds(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = trimmed.split(/[ ,]+/).map((part) => parseStrictNumber(part));
  if (parsed.some((threshold) => threshold === undefined)) {
    return "Enter numbers separated by commas or spaces.";
  }
  const thresholds = parsed as number[];
  if (thresholds.some((threshold) => threshold <= 0 || threshold > 100)) {
    return "Thresholds must be between 1 and 100.";
  }
  return null;
}

function summaryEnabled(enabled: boolean): string {
  return enabled ? "enabled" : "disabled";
}

function featureSummary(config: NeuralwattConfig): string {
  return summaryEnabled(
    boolValue(
      currentAllowances(config).enabled,
      DEFAULT_CONFIG.allowances.enabled,
    ),
  );
}

function sessionSummary(config: NeuralwattConfig): string {
  const session = currentAllowances(config).session ?? {};
  const enabled = boolValue(
    session.enabled,
    DEFAULT_CONFIG.allowances.session.enabled,
  );
  return `${summaryEnabled(enabled)} · cap ${formatOptionalUsd(session.allowanceUsd)}`;
}

function requestSummary(config: NeuralwattConfig): string {
  const request = currentAllowances(config).request ?? {};
  const enabled = boolValue(
    request.enabled,
    DEFAULT_CONFIG.allowances.request.enabled,
  );
  return `${summaryEnabled(enabled)} · cap ${formatOptionalUsd(request.allowanceUsd)}`;
}

function widgetSummary(config: NeuralwattConfig): string {
  const widget = currentAllowances(config).widget ?? {};
  const enabled = boolValue(
    widget.enabled,
    DEFAULT_CONFIG.allowances.widget.enabled,
  );
  return `${summaryEnabled(enabled)} · ${widget.placement ?? DEFAULT_CONFIG.allowances.widget.placement}`;
}

function warningsSummary(config: NeuralwattConfig): string {
  const warnings = currentAllowances(config).warnings ?? {};
  const enabled = boolValue(
    warnings.enabled,
    DEFAULT_CONFIG.allowances.warnings.enabled,
  );
  const thresholds =
    warnings.remainingThresholds ??
    DEFAULT_CONFIG.allowances.warnings.remainingThresholds;
  return `${summaryEnabled(enabled)} · ${thresholds.join(", ")}%`;
}

function projectOverrideSection(): SettingsSection[] {
  if (!hasAllowanceConfig(configLoader.getRawConfig("local"))) return [];
  const effective = configLoader.getConfig();
  return [
    {
      label: "Project override",
      items: [
        {
          id: "projectOverride",
          label: "Project config",
          description:
            "This command edits user-wide defaults. Project allowances in .pi/extensions/neuralwatt.json take precedence.",
          currentValue: `${featureSummary(effective)} · session ${sessionSummary(effective)} · request ${requestSummary(effective)}`,
          values: [],
        },
      ],
    },
  ];
}

function setFeatureEnabled(config: NeuralwattConfig, enabled: boolean) {
  const updated = structuredClone(config);
  ensureAllowances(updated).enabled = enabled;
  return updated;
}

function sessionEditor(
  baseConfig: NeuralwattConfig,
  setDraft: (config: NeuralwattConfig) => void,
  theme: SettingsTheme,
  onDone: (summary?: string) => void,
) {
  const draft = structuredClone(baseConfig);
  const update = () => setDraft(structuredClone(draft));

  return new SettingsDetailEditor({
    title: "Session allowance",
    theme,
    onDone,
    getDoneSummary: () => sessionSummary(draft),
    fields: [
      {
        id: "session.enabled",
        type: "boolean",
        label: "Enabled",
        description: "Send X-Session-ID and optional X-Session-Allowance-USD.",
        getValue: () =>
          boolValue(
            currentAllowances(draft).session?.enabled,
            DEFAULT_CONFIG.allowances.session.enabled,
          ),
        setValue: (value) => {
          const allowances = ensureAllowances(draft);
          allowances.session ??= {};
          allowances.session.enabled = value;
          update();
        },
      },
      {
        id: "session.allowanceUsd",
        type: "text",
        label: "Allowance USD",
        description: "Blank means no explicit session allowance cap.",
        getValue: () =>
          numberValue(currentAllowances(draft).session?.allowanceUsd),
        setValue: (value) => {
          const allowances = ensureAllowances(draft);
          allowances.session ??= {};
          allowances.session.allowanceUsd = parseOptionalNumber(value);
          update();
        },
        validate: validatePositiveUsd,
        emptyValueText: "unset",
      },
    ],
  });
}

function requestEditor(
  baseConfig: NeuralwattConfig,
  setDraft: (config: NeuralwattConfig) => void,
  theme: SettingsTheme,
  onDone: (summary?: string) => void,
) {
  const draft = structuredClone(baseConfig);
  const update = () => setDraft(structuredClone(draft));

  return new SettingsDetailEditor({
    title: "Request allowance",
    theme,
    onDone,
    getDoneSummary: () => requestSummary(draft),
    fields: [
      {
        id: "request.enabled",
        type: "boolean",
        label: "Enabled",
        description: "Send X-Request-Allowance-USD when a cap is set.",
        getValue: () =>
          boolValue(
            currentAllowances(draft).request?.enabled,
            DEFAULT_CONFIG.allowances.request.enabled,
          ),
        setValue: (value) => {
          const allowances = ensureAllowances(draft);
          allowances.request ??= {};
          allowances.request.enabled = value;
          update();
        },
      },
      {
        id: "request.allowanceUsd",
        type: "text",
        label: "Allowance USD",
        description:
          "Maximum spend for one Neuralwatt request. Blank unsets it.",
        getValue: () =>
          numberValue(currentAllowances(draft).request?.allowanceUsd),
        setValue: (value) => {
          const allowances = ensureAllowances(draft);
          allowances.request ??= {};
          allowances.request.allowanceUsd = parseOptionalNumber(value);
          update();
        },
        validate: validatePositiveUsd,
        emptyValueText: "unset",
      },
    ],
  });
}

function widgetEditor(
  baseConfig: NeuralwattConfig,
  setDraft: (config: NeuralwattConfig) => void,
  theme: SettingsTheme,
  onDone: (summary?: string) => void,
) {
  const draft = structuredClone(baseConfig);
  const update = () => setDraft(structuredClone(draft));

  return new SettingsDetailEditor({
    title: "Allowance widget",
    theme,
    onDone,
    getDoneSummary: () => widgetSummary(draft),
    fields: [
      {
        id: "widget.enabled",
        type: "boolean",
        label: "Enabled",
        description: "Show session allowance state near the editor.",
        getValue: () =>
          boolValue(
            currentAllowances(draft).widget?.enabled,
            DEFAULT_CONFIG.allowances.widget.enabled,
          ),
        setValue: (value) => {
          const allowances = ensureAllowances(draft);
          allowances.widget ??= {};
          allowances.widget.enabled = value;
          update();
        },
      },
      {
        id: "widget.placement",
        type: "enum",
        label: "Placement",
        options: ["aboveEditor", "belowEditor"],
        getValue: () =>
          currentAllowances(draft).widget?.placement ??
          DEFAULT_CONFIG.allowances.widget.placement,
        setValue: (value) => {
          if (value !== "aboveEditor" && value !== "belowEditor") return;
          const allowances = ensureAllowances(draft);
          allowances.widget ??= {};
          allowances.widget.placement = value;
          update();
        },
      },
    ],
  });
}

function warningsEditor(
  baseConfig: NeuralwattConfig,
  setDraft: (config: NeuralwattConfig) => void,
  theme: SettingsTheme,
  onDone: (summary?: string) => void,
) {
  const draft = structuredClone(baseConfig);
  const update = () => setDraft(structuredClone(draft));

  return new SettingsDetailEditor({
    title: "Session warnings",
    theme,
    onDone,
    getDoneSummary: () => warningsSummary(draft),
    fields: [
      {
        id: "warnings.enabled",
        type: "boolean",
        label: "Enabled",
        description:
          "Warn once per crossed threshold in the current Pi session.",
        getValue: () =>
          boolValue(
            currentAllowances(draft).warnings?.enabled,
            DEFAULT_CONFIG.allowances.warnings.enabled,
          ),
        setValue: (value) => {
          const allowances = ensureAllowances(draft);
          allowances.warnings ??= {};
          allowances.warnings.enabled = value;
          update();
        },
      },
      {
        id: "warnings.remainingThresholds",
        type: "text",
        label: "Thresholds",
        description: "Remaining percentages, separated by commas or spaces.",
        getValue: () =>
          (
            currentAllowances(draft).warnings?.remainingThresholds ??
            DEFAULT_CONFIG.allowances.warnings.remainingThresholds
          ).join(", "),
        setValue: (value) => {
          const allowances = ensureAllowances(draft);
          allowances.warnings ??= {};
          allowances.warnings.remainingThresholds = parseThresholds(value);
          update();
        },
        validate: validateThresholds,
      },
    ],
  });
}

export function registerAllowancesCommand(pi: ExtensionAPI): void {
  registerSettingsCommand<NeuralwattConfig, ResolvedNeuralwattConfig>(pi, {
    commandName: COMMAND_NAME,
    commandDescription: "Configure Neuralwatt request and session allowances",
    title: "Neuralwatt Allowances",
    configStore: globalOnlyConfigStore,
    buildSections: (tabConfig, _resolved, ctx): SettingsSection[] => {
      const config = tabConfig ?? {};
      return [
        ...projectOverrideSection(),
        {
          label: "Global",
          items: [
            {
              id: "allowances.enabled",
              label: "Allowance feature",
              description:
                "Master switch for allowance headers, widget, and warnings.",
              currentValue: featureSummary(config),
              values: ["enabled", "disabled"],
            },
            {
              id: "request",
              label: "Request allowance",
              description:
                "Per-request USD cap applied to each Neuralwatt request.",
              currentValue: requestSummary(config),
              values: [],
              submenu: (_currentValue, done) =>
                requestEditor(config, ctx.setDraft, ctx.theme, done),
            },
          ],
        },
      ];
    },
    extraTabs: [
      {
        id: "session",
        label: "Session",
        buildSections: (ctx): SettingsSection[] => {
          const config =
            ctx.getDraftForScope("global") ??
            ctx.getRawForScope("global") ??
            {};
          return [
            ...projectOverrideSection(),
            {
              label: "Session",
              items: [
                {
                  id: "session",
                  label: "Session allowance",
                  description:
                    "Per-Pi-session spend cap. Forks naturally use their new Pi session ID.",
                  currentValue: sessionSummary(config),
                  values: [],
                  submenu: (_currentValue, done) =>
                    sessionEditor(
                      config,
                      (updated) => ctx.setDraftForScope("global", updated),
                      ctx.theme,
                      done,
                    ),
                },
                {
                  id: "widget",
                  label: "Widget",
                  description:
                    "Optional editor-adjacent session allowance display.",
                  currentValue: widgetSummary(config),
                  values: [],
                  submenu: (_currentValue, done) =>
                    widgetEditor(
                      config,
                      (updated) => ctx.setDraftForScope("global", updated),
                      ctx.theme,
                      done,
                    ),
                },
                {
                  id: "warnings",
                  label: "Warnings",
                  description: "Low session allowance notifications.",
                  currentValue: warningsSummary(config),
                  values: [],
                  submenu: (_currentValue, done) =>
                    warningsEditor(
                      config,
                      (updated) => ctx.setDraftForScope("global", updated),
                      ctx.theme,
                      done,
                    ),
                },
              ],
            },
          ];
        },
      },
    ],
    onSettingChange: (id, newValue, config) => {
      if (id === "allowances.enabled") {
        return setFeatureEnabled(config, newValue === "enabled");
      }
      return null;
    },
    onSave: async () => {
      pi.events.emit(NEURALWATT_CONFIG_UPDATED_EVENT, {
        config: configLoader.getConfig(),
      });
    },
  });
}
