import type {
  ClassifierApi,
  ClassifierFunction,
  ClassifierModel,
} from "@earendil-works/pi-ai";
import {
  classifySystemOne,
  isRecord,
  type SystemOneTransport,
} from "@earendil-works/pi-ai/api/system-one-shared";
import {
  NEURALWATT_BASE_URL,
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
} from "../constants";
import {
  NEURALWATT_SYSTEM_ONE_API,
  type NeuralwattClassifierModel,
} from "../models/build";

/**
 * Neuralwatt decision models (e.g. `clef-flash`) speak TypeSafe's System One
 * protocol: `POST {baseUrl}/systemone` with `{ model, state, questions }`,
 * answering with `{ answers, usage }` plus Neuralwatt-specific energy/cost
 * fields the classifier layer ignores. Request/reply mapping (bool ↔ `noul`,
 * per-choice probabilities, usage pricing) is pi-ai's shared System One
 * implementation; this module only carries the Neuralwatt transport.
 */
const transport: SystemOneTransport = {
  api: NEURALWATT_SYSTEM_ONE_API,
  label: "Neuralwatt System One API",
  url: (model) =>
    new URL("systemone", `${model.baseUrl.replace(/\/+$/u, "")}/`),
  payload: (model, request) => ({ model: model.id, ...request }),
  output: (body) => {
    if (!isRecord(body)) {
      throw new Error(
        "Neuralwatt System One API returned an unexpected response",
      );
    }
    return body;
  },
};

/**
 * Classify through `POST {baseUrl}/systemone`. Never rejects: transport,
 * protocol, and API-shape errors come back as an error `ClassifierResult`
 * (pi-ai's shared runner converts them).
 */
export const classify: ClassifierFunction = (model, context, options) =>
  classifySystemOne(transport, model, context, options);

/**
 * Stamp compiled decision models for registration. Classifier stamping is the
 * same on every chat surface: the api stays `typesafe-system-one` even when
 * the provider's chat surface is anthropic-messages.
 */
export function stampClassifierModels(
  models: NeuralwattClassifierModel[],
): ClassifierModel<ClassifierApi>[] {
  return models.map((model) => ({
    ...model,
    api: NEURALWATT_SYSTEM_ONE_API,
    provider: NEURALWATT_PROVIDER_ID,
    baseUrl: model.baseUrl ?? NEURALWATT_BASE_URL,
    headers: NEURALWATT_REQUEST_HEADERS,
  }));
}
