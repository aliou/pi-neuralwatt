import type { Migration } from "@aliou/pi-utils-settings";
import type { NeuralwattConfig } from "../types";

export const migrations: Migration<NeuralwattConfig>[] = [
  {
    name: "disable-legacy-model-ids-by-default",
    shouldRun: (config) => config.includeLegacyModelIds === undefined,
    message:
      "[neuralwatt] legacy model IDs (ids including the provider and the quantization) are disabled by default. You can enable them with /neuralwatt:settings.",
    run: (config) => ({ ...config, includeLegacyModelIds: false }),
  },
];
