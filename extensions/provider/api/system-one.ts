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
import { configuredApiBaseUrl } from "../../../src/config/loader";
import {
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
} from "../constants";
import {
  NEURALWATT_SYSTEM_ONE_API,
  type NeuralwattClassifierModel,
} from "../models/build";

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

export const classify: ClassifierFunction = (model, context, options) =>
  classifySystemOne(transport, model, context, options);

export function stampClassifierModels(
  models: NeuralwattClassifierModel[],
): ClassifierModel<ClassifierApi>[] {
  return models.map((model) => ({
    ...model,
    api: NEURALWATT_SYSTEM_ONE_API,
    provider: NEURALWATT_PROVIDER_ID,
    baseUrl: model.baseUrl ?? configuredApiBaseUrl(),
    headers: NEURALWATT_REQUEST_HEADERS,
  }));
}
