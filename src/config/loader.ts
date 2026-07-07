import { buildSchemaUrl, ConfigLoader } from "@aliou/pi-utils-settings";
import packageJson from "../../package.json";
import { DEFAULT_CONFIG } from "./defaults";
import { migrations } from "./migration";
import type { NeuralwattConfig, ResolvedNeuralwattConfig } from "./types";

export const configLoader = new ConfigLoader<
  NeuralwattConfig,
  ResolvedNeuralwattConfig
>("neuralwatt", DEFAULT_CONFIG, {
  migrations,
  schemaUrl: buildSchemaUrl("@aliou/pi-neuralwatt", packageJson.version),
});
