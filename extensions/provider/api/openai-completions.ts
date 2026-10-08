import type { StreamOptions } from "@earendil-works/pi-ai";
import { stream, streamSimple } from "@earendil-works/pi-ai/compat";
import {
  NEURALWATT_BASE_URL,
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
} from "../constants";
import type { NeuralwattReasoningReplay } from "../models/build";
import type { NeuralwattChatModel } from "../models/catalog";
import type { AnyStreamSimple } from "../stream-simple";
import type { NeuralwattApiHandler } from "./types";

type OpenAiCompletionsBody = {
  messages?: Array<Record<string, unknown>>;
  chat_template_kwargs?: unknown;
  [key: string]: unknown;
};

/**
 * Reasoning replay injector (issue #111). Replay of prior chain-of-thought is
 * per-model catalog data: the model's `reasoningReplay` knob (validated live
 * and dated — see `models/reasoning-replay.ts`) moves pi-ai's replayed
 * `reasoning` field to the knob's `field` on the wire and shallow-merges
 * `templateKwargs` into `chat_template_kwargs`. Knobless models — today all
 * of them — pass the payload through untouched: pi-ai's recorded replay
 * signature (`reasoning`) goes out unchanged.
 *
 * The `field` move is a move, not a copy: sending an empty target next to a
 * populated `reasoning` would make the gateway prefer the empty field and
 * silently drop the replay. A pre-set non-empty target wins; the duplicate is
 * dropped.
 */
function makeReasoningReplayInjector(
  upstream?: StreamOptions["onPayload"],
): NonNullable<StreamOptions["onPayload"]> {
  return async (payload, model) => {
    const next = await upstream?.(payload, model);
    const body = (next !== undefined ? next : payload) as OpenAiCompletionsBody;
    const knob = (model as { reasoningReplay?: NeuralwattReasoningReplay })
      ?.reasoningReplay;
    // Knobless model: catalog data says no rewrite; pass through untouched.
    if (!knob) return body;

    let result = body;

    if (
      knob.templateKwargs &&
      typeof knob.templateKwargs === "object" &&
      Object.keys(knob.templateKwargs).length > 0
    ) {
      result = {
        ...result,
        chat_template_kwargs: {
          ...(typeof body.chat_template_kwargs === "object" &&
          body.chat_template_kwargs !== null
            ? (body.chat_template_kwargs as Record<string, unknown>)
            : {}),
          ...knob.templateKwargs,
        },
      };
    }

    if (knob.field && Array.isArray(result.messages)) {
      const field = knob.field;
      result = {
        ...result,
        messages: result.messages.map((message) => {
          if (message?.role !== "assistant" || !("reasoning" in message)) {
            return message;
          }
          const { reasoning, ...rest } = message;
          if (field === "reasoning") return { ...rest, reasoning };
          // A pre-set non-empty target wins; drop the duplicate.
          const existing = rest[field];
          return typeof existing === "string" && existing.length > 0
            ? rest
            : { ...rest, [field]: reasoning };
        }),
      };
    }

    return result;
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
          baseUrl: model.baseUrl ?? NEURALWATT_BASE_URL,
          headers: NEURALWATT_REQUEST_HEADERS,
        };
      }),
    stream: (model, context, streamOptions) =>
      stream(model, context, withReasoningReplay(streamOptions) as never),
    streamSimple: (model, context, simpleOptions) =>
      ((options?.streamSimple ?? streamSimple) as AnyStreamSimple)(
        model,
        context,
        withReasoningReplay(simpleOptions),
      ),
  };
}
