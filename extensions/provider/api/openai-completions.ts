import type { StreamOptions } from "@earendil-works/pi-ai";
import { stream, streamSimple } from "@earendil-works/pi-ai/compat";
import {
  configuredApiBaseUrl,
  hostedToolsOptOut,
} from "../../../src/config/loader";
import {
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
  NEURALWATT_TOOLS_OPT_OUT_HEADER,
} from "../constants";
import type { NeuralwattChatModel } from "../models/catalog";
import type { AnyStreamSimple } from "../stream-simple";
import type { NeuralwattApiHandler } from "./types";

type OpenAiCompletionsBody = {
  messages?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

/**
 * Neuralwatt streams chain-of-thought in the `reasoning` field, and pi-ai
 * replays prior thinking under the field name it recorded from the stream —
 * also `reasoning`. The served chat templates only render `reasoning_content`
 * (verified against the Kimi K3 template), so replayed thinking never reaches
 * the model. Rename the replayed field on the wire. This is a move, not a
 * copy: sending an empty `reasoning_content` next to a populated `reasoning`
 * makes the gateway prefer the empty field and silently drops the replay.
 */
function makeReasoningReplayInjector(
  upstream?: StreamOptions["onPayload"],
): NonNullable<StreamOptions["onPayload"]> {
  return async (payload, model) => {
    const next = await upstream?.(payload, model);
    const body = (next !== undefined ? next : payload) as OpenAiCompletionsBody;
    const messages = body.messages;
    if (!Array.isArray(messages)) return body;

    return {
      ...body,
      messages: messages.map((message) => {
        if (message?.role !== "assistant" || !("reasoning" in message)) {
          return message;
        }
        const { reasoning, ...rest } = message;
        // A pre-set non-empty reasoning_content wins; drop the duplicate.
        return typeof rest.reasoning_content === "string" &&
          rest.reasoning_content.length > 0
          ? rest
          : { ...rest, reasoning_content: reasoning };
      }),
    };
  };
}

type StreamRequestOptions = {
  onPayload?: StreamOptions["onPayload"];
  headers?: StreamOptions["headers"];
};

function withOptOutHeader(options?: StreamRequestOptions) {
  if (!hostedToolsOptOut()) return options;
  return {
    ...options,
    headers: {
      ...options?.headers,
      [NEURALWATT_TOOLS_OPT_OUT_HEADER]: "true",
    },
  };
}

export function createOpenAiCompletionsApi(options?: {
  streamSimple?: AnyStreamSimple;
}): NeuralwattApiHandler {
  const withReasoningReplay = (options?: {
    onPayload?: StreamOptions["onPayload"];
  }) => ({
    ...options,
    onPayload: makeReasoningReplayInjector(options?.onPayload),
  });

  return {
    stampModels: (models: NeuralwattChatModel[]) =>
      models.map((model) => {
        const { reasoningContract: _reasoningContract, ...compiled } = model;
        return {
          ...compiled,
          api: "openai-completions" as const,
          provider: NEURALWATT_PROVIDER_ID,
          baseUrl: model.baseUrl ?? configuredApiBaseUrl(),
          headers: NEURALWATT_REQUEST_HEADERS,
        };
      }),
    stream: (model, context, streamOptions) =>
      stream(
        model,
        context,
        withOptOutHeader(withReasoningReplay(streamOptions)) as never,
      ),
    streamSimple: (model, context, simpleOptions) =>
      ((options?.streamSimple ?? streamSimple) as AnyStreamSimple)(
        model,
        context,
        withOptOutHeader(withReasoningReplay(simpleOptions)),
      ),
  };
}
