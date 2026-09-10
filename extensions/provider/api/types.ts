import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
  SimpleStreamOptions,
  StreamOptions,
} from "@earendil-works/pi-ai";
import type { NeuralwattModel } from "../models/catalog";

/** One Neuralwatt API surface: model stamping plus submission plumbing. */
export interface NeuralwattApiHandler {
  stampModels(models: NeuralwattModel[]): Model<Api>[];
  stream(
    model: Model<Api>,
    context: Context,
    options?: StreamOptions,
  ): AssistantMessageEventStream;
  streamSimple(
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions,
  ): AssistantMessageEventStream;
}
