import { stream, streamSimple } from "@earendil-works/pi-ai/compat";
import {
  NEURALWATT_BASE_URL,
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
} from "../constants";
import type { NeuralwattModel } from "../models/catalog";
import type { AnyStreamSimple } from "../stream-simple";
import type { NeuralwattApiHandler } from "./types";

export function createOpenAiCompletionsApi(options?: {
  streamSimple?: AnyStreamSimple;
}): NeuralwattApiHandler {
  return {
    stampModels: (models: NeuralwattModel[]) =>
      models.map((model) => {
        const { reasoningContract: _reasoningContract, ...compiled } = model;
        return {
          ...compiled,
          api: "openai-completions" as const,
          provider: NEURALWATT_PROVIDER_ID,
          baseUrl: model.baseUrl ?? NEURALWATT_BASE_URL,
          headers: NEURALWATT_REQUEST_HEADERS,
        };
      }),
    stream: (model, context, streamOptions) =>
      stream(model, context, streamOptions as never),
    streamSimple: options?.streamSimple ?? streamSimple,
  };
}
