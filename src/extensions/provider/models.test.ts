import { describe, expect, it } from "vitest";
import { NEURALWATT_MODELS } from "./models";

interface ApiModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  max_model_len: number;
}

interface ApiResponse {
  object: "list";
  data: ApiModel[];
}

interface Discrepancy {
  model: string;
  field: string;
  hardcoded: unknown;
  api: unknown;
}

async function fetchApiModels(): Promise<ApiModel[]> {
  const apiKey = process.env.NEURALWATT_API_KEY;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Referer: "https://github.com/aliou/pi-neuralwatt",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch("https://api.neuralwatt.com/v1/models", {
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data: ApiResponse = await response.json();
  return data.data;
}

function compareModels(
  apiModels: ApiModel[],
  hardcodedModels: typeof NEURALWATT_MODELS,
): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];

  for (const hardcoded of hardcodedModels) {
    const apiModel = apiModels.find((m) => m.id === hardcoded.id);

    if (!apiModel) {
      discrepancies.push({
        model: hardcoded.id,
        field: "exists",
        hardcoded: true,
        api: false,
      });
      continue;
    }

    // Check context window
    if (apiModel.max_model_len !== hardcoded.contextWindow) {
      discrepancies.push({
        model: hardcoded.id,
        field: "contextWindow",
        hardcoded: hardcoded.contextWindow,
        api: apiModel.max_model_len,
      });
    }
  }

  // Check for API models not in hardcoded list
  for (const apiModel of apiModels) {
    const hardcoded = hardcodedModels.find((m) => m.id === apiModel.id);
    if (!hardcoded) {
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

describe("Neuralwatt models", () => {
  it("should match API model definitions", { timeout: 30000 }, async () => {
    const apiModels = await fetchApiModels();
    const discrepancies = compareModels(apiModels, NEURALWATT_MODELS);

    if (discrepancies.length > 0) {
      console.error("\nModel discrepancies found:");
      console.error("==========================");
      for (const d of discrepancies) {
        if (d.field === "exists") {
          if (d.hardcoded) {
            console.error(`  ${d.model}: Missing from API`);
          } else {
            console.error(`  ${d.model}: Missing from hardcoded models (NEW)`);
          }
        } else {
          console.error(`  ${d.model}.${d.field}:`);
          console.error(`    hardcoded: ${JSON.stringify(d.hardcoded)}`);
          console.error(`    api:       ${JSON.stringify(d.api)}`);
        }
      }
      console.error("==========================\n");
    }

    expect(discrepancies).toHaveLength(0);
  });
});
