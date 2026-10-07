import type {
  Api,
  AssistantMessageEventStream,
  Model,
  SimpleStreamOptions,
  StreamOptions,
  TranscriptContext,
} from "@earendil-works/pi-ai";
import type { NeuralwattChatModel } from "../models/catalog";

/**
 * One Neuralwatt API surface: model stamping plus chat submission plumbing.
 * Surfaces are chat-only: decision models (classifiers) are stamped in
 * `api/system-one.ts` and join the provider through `getAllModels()`.
 */
export interface NeuralwattApiHandler {
  stampModels(models: NeuralwattChatModel[]): Model<Api>[];
  stream(
    model: Model<Api>,
    context: TranscriptContext,
    options?: StreamOptions,
  ): AssistantMessageEventStream;
  streamSimple(
    model: Model<Api>,
    context: TranscriptContext,
    options?: SimpleStreamOptions,
  ): AssistantMessageEventStream;
}
