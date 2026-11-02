import type {
  Api,
  AssistantMessageEventStream,
  Model,
  SimpleStreamOptions,
  StreamOptions,
  TranscriptContext,
} from "@earendil-works/pi-ai";
import type { NeuralwattChatModel } from "../models/catalog";

/** One Neuralwatt API surface: model stamping plus chat submission plumbing. */
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
