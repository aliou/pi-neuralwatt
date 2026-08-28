/**
 * Drift check for the offline fallback model table.
 *
 * Compares `NEURALWATT_MODELS` (extensions/provider/models/public-models.ts)
 * against the live `/v1/models` catalog and reports any drift. The fallback is
 * only the first-start seed — the runtime catalog is built from the API — so
 * drift is a "keep the seed fresh" signal, not a build blocker. This runs on a
 * schedule (see .github/workflows/model-sync.yml), never in the PR test suite.
 *
 * Exit codes:
 *   0  no drift
 *   1  drift detected (a markdown report is printed to stdout)
 *   2  the check could not run (network/HTTP/unexpected error)
 */

import { NEURALWATT_MODELS } from "../extensions/provider/models";
import { buildThinkingLevelMap } from "../extensions/provider/models/build";
import type { NeuralwattApiModel } from "../src/types/models-api";

const API_URL = "https://api.neuralwatt.com/v1/models";
const EPSILON = 0.001;

const REASONING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

interface Discrepancy {
  model: string;
  field: string;
  hardcoded: unknown;
  api: unknown;
}

/**
 * Models whose real serving limit is known to be lower than the advertised
 * `max_model_len`. The Kimi K3 endpoints reject anything above 327,680 total
 * tokens, despite the API advertising 1,048,560 with a null output cap for the
 * whole family. The catalog pins the enforced limit, so the drift check skips
 * the advertised context-window comparison for these IDs. Remove an entry once
 * the API metadata agrees with the serving limit again.
 */
const CONTEXT_WINDOW_OVERRIDES: ReadonlyMap<string, number> = new Map([
  ["kimi-k3", 327680],
  ["kimi-k3-fast", 327680],
  ["kimi-k3-flex", 327680],
]);

function isFlexModelId(id: string): boolean {
  return id.endsWith("-flex");
}

async function fetchApiModels(): Promise<NeuralwattApiModel[]> {
  const response = await fetch(API_URL, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      Referer: "https://github.com/aliou/pi-neuralwatt",
      "X-Title": "npm:@aliou/pi-neuralwatt",
    },
  });

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data: { data?: NeuralwattApiModel[] } = await response.json();
  // A response without a `data` array is a malformed/unexpected payload, not an
  // empty catalog. Throw so the run exits 2 (error) instead of reporting every
  // fallback model as removed and opening a bogus drift issue.
  if (!Array.isArray(data.data)) {
    throw new Error("API response has no `data` array");
  }
  // Filter out deprecated and pricing_tbd models, same as the live provider.
  return data.data.filter(
    (m) => !m.metadata?.deprecated && !m.metadata?.pricing.pricing_tbd,
  );
}

function compareModels(
  apiModels: NeuralwattApiModel[],
  hardcodedModels: typeof NEURALWATT_MODELS,
): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];

  for (const hardcoded of hardcodedModels) {
    const apiModel = apiModels.find((m) => m.id === hardcoded.id);

    if (!apiModel) {
      // Flex variants are our own billing construct; the API never lists them.
      if (!isFlexModelId(hardcoded.id)) {
        discrepancies.push({
          model: hardcoded.id,
          field: "exists",
          hardcoded: true,
          api: false,
        });
      }
      continue;
    }

    const meta = apiModel.metadata;

    // Context window, honoring known serving-limit overrides.
    const contextOverride = CONTEXT_WINDOW_OVERRIDES.get(hardcoded.id);
    if (contextOverride !== undefined) {
      if (apiModel.max_model_len === hardcoded.contextWindow) {
        discrepancies.push({
          model: hardcoded.id,
          field: "contextWindowOverrideStale",
          hardcoded: hardcoded.contextWindow,
          api: apiModel.max_model_len,
        });
      }
    } else if (apiModel.max_model_len !== hardcoded.contextWindow) {
      discrepancies.push({
        model: hardcoded.id,
        field: "contextWindow",
        hardcoded: hardcoded.contextWindow,
        api: apiModel.max_model_len,
      });
    }

    // Reasoning capability.
    if (meta && meta.capabilities.reasoning !== hardcoded.reasoning) {
      discrepancies.push({
        model: hardcoded.id,
        field: "reasoning",
        hardcoded: hardcoded.reasoning,
        api: meta.capabilities.reasoning,
      });
    }

    // Reasoning level map: the hardcoded snapshot must produce the same map the
    // live `reasoning` block would. Skipped for non-reasoning models (no map)
    // and flex variants (pricing-only).
    if (meta && hardcoded.reasoning && !isFlexModelId(hardcoded.id)) {
      const expected = buildThinkingLevelMap(meta.reasoning);
      const actual = hardcoded.thinkingLevelMap;
      for (const level of REASONING_LEVELS) {
        if (actual?.[level] !== expected[level]) {
          discrepancies.push({
            model: hardcoded.id,
            field: `thinkingLevelMap.${level}`,
            hardcoded: actual?.[level] ?? null,
            api: expected[level],
          });
        }
      }
    }

    // Vision / input modalities.
    if (meta) {
      const hasVision = hardcoded.input.includes("image");
      if (meta.capabilities.vision !== hasVision) {
        discrepancies.push({
          model: hardcoded.id,
          field: "input (vision)",
          hardcoded: hasVision,
          api: meta.capabilities.vision,
        });
      }
    }

    // Pricing. Flex variants are advertised at standard pricing; the 35% Flex
    // discount is a billing-time concept applied via costMultiplier in our
    // definitions, so skip price checks for them.
    if (meta && !isFlexModelId(hardcoded.id)) {
      if (
        Math.abs(meta.pricing.input_per_million - hardcoded.cost.input) >
        EPSILON
      ) {
        discrepancies.push({
          model: hardcoded.id,
          field: "cost.input",
          hardcoded: hardcoded.cost.input,
          api: meta.pricing.input_per_million,
        });
      }
      if (
        Math.abs(meta.pricing.output_per_million - hardcoded.cost.output) >
        EPSILON
      ) {
        discrepancies.push({
          model: hardcoded.id,
          field: "cost.output",
          hardcoded: hardcoded.cost.output,
          api: meta.pricing.output_per_million,
        });
      }
      const apiCacheRead = meta.pricing.cached_input_per_million ?? 0;
      if (Math.abs(apiCacheRead - hardcoded.cost.cacheRead) > EPSILON) {
        discrepancies.push({
          model: hardcoded.id,
          field: "cost.cacheRead",
          hardcoded: hardcoded.cost.cacheRead,
          api: apiCacheRead,
        });
      }
      const apiCacheWrite = meta.pricing.cached_output_per_million ?? 0;
      if (Math.abs(apiCacheWrite - hardcoded.cost.cacheWrite) > EPSILON) {
        discrepancies.push({
          model: hardcoded.id,
          field: "cost.cacheWrite",
          hardcoded: hardcoded.cost.cacheWrite,
          api: apiCacheWrite,
        });
      }
    }

    // Max output tokens. A null `max_output_tokens` means the API imposes no
    // separate output cap, so output is bounded by the context window. Models
    // with a context-window override are bounded by the enforced serving limit.
    if (meta && contextOverride === undefined) {
      const expectedMaxTokens =
        meta.limits.max_output_tokens ?? apiModel.max_model_len;
      if (expectedMaxTokens !== hardcoded.maxTokens) {
        discrepancies.push({
          model: hardcoded.id,
          field: "maxTokens",
          hardcoded: hardcoded.maxTokens,
          api: expectedMaxTokens,
        });
      }
    }
  }

  // API models missing from the fallback table.
  for (const apiModel of apiModels) {
    if (!hardcodedModels.some((m) => m.id === apiModel.id)) {
      discrepancies.push({
        model: apiModel.id,
        field: "exists",
        hardcoded: false,
        api: true,
      });
    }
  }

  return discrepancies;
}

function formatTable(discrepancies: Discrepancy[]): string {
  const lines = ["| Model | Field | Fallback | API |", "|---|---|---|---|"];
  for (const d of discrepancies) {
    if (d.field === "exists") {
      lines.push(
        d.hardcoded
          ? `| ${d.model} | exists | in fallback | missing from API |`
          : `| ${d.model} | exists | missing from fallback | in API (new model) |`,
      );
    } else {
      lines.push(
        `| ${d.model} | ${d.field} | ${JSON.stringify(d.hardcoded)} | ${JSON.stringify(d.api)} |`,
      );
    }
  }
  return lines.join("\n");
}

function formatSection(
  title: string,
  body: string,
  discrepancies: Discrepancy[],
): string {
  return [`## ${title}`, "", body, "", formatTable(discrepancies)].join("\n");
}

function report(discrepancies: Discrepancy[]): void {
  const newModels = discrepancies.filter(
    (d) => d.field === "exists" && d.api === true,
  );
  const missingModels = discrepancies.filter(
    (d) => d.field === "exists" && d.hardcoded === true,
  );
  const priceChanges = discrepancies.filter((d) => d.field.startsWith("cost."));
  const other = discrepancies.filter(
    (d) => d.field !== "exists" && !d.field.startsWith("cost."),
  );

  const sections = [
    "The offline fallback model table has drifted from the live Neuralwatt API.",
    "",
    `Compared \`NEURALWATT_MODELS\` against ${API_URL}. Update the fallback in \`extensions/provider/models/public-models.ts\` (see \`.agents/skills/neuralwatt-models/SKILL.md\`).`,
  ];

  if (newModels.length > 0) {
    sections.push(
      "",
      formatSection(
        "New upstream models",
        "In the API but missing from the fallback table. Add them so first start seeds them.",
        newModels,
      ),
    );
  }
  if (missingModels.length > 0) {
    sections.push(
      "",
      formatSection(
        "Removed upstream models",
        "In the fallback table but no longer in the API. Remove them once you confirm they are truly gone.",
        missingModels,
      ),
    );
  }
  if (priceChanges.length > 0) {
    sections.push(
      "",
      formatSection(
        "Price changes",
        "Upstream pricing changed for these models.",
        priceChanges,
      ),
    );
  }
  if (other.length > 0) {
    sections.push(
      "",
      formatSection(
        "Other drift",
        "Field-level drift that is neither a new/removed model nor a price change.",
        other,
      ),
    );
  }

  console.log(sections.join("\n"));
}

async function main(): Promise<void> {
  const apiModels = await fetchApiModels();
  const discrepancies = compareModels(apiModels, NEURALWATT_MODELS);

  if (discrepancies.length === 0) {
    console.log("No drift: the fallback table matches the live API.");
    return;
  }

  report(discrepancies);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[check-models] could not run: ${error}`);
  process.exit(2);
});
