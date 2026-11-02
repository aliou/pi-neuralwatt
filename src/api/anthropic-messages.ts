import type { ProviderStreams, StreamOptions } from "@earendil-works/pi-ai";
import {
  NEURALWATT_BASE_URL,
  NEURALWATT_PROVIDER_ID,
  NEURALWATT_REQUEST_HEADERS,
} from "../constants";
import { buildAnthropicThinkingLevelMap } from "../models/build";
import type { NeuralwattChatModel } from "../models/catalog";
import type { AnyStreamSimple } from "../stream-simple";
import type { NeuralwattApiHandler } from "./types";

type AnthropicMessagesBody = {
  thinking?: { type?: string };
  output_config?: { effort?: string };
  chat_template_kwargs?: Record<string, unknown>;
  [key: string]: unknown;
};

// Outside vLLM's effort enum (HTTP 400); both mean "reasoning off".
const EFFORT_OFF_VALUES = new Set(["none", "minimal"]);

function applyReasoningOff(body: AnthropicMessagesBody): AnthropicMessagesBody {
  delete body.thinking;
  delete body.output_config;
  body.chat_template_kwargs = {
    ...(body.chat_template_kwargs ?? {}),
    enable_thinking: false,
  };
  return body;
}

/**
 * vLLM's reasoning controls differ from first-party Anthropic: positive levels
 * go through `output_config.effort` (adaptive path, forced via compat) while
 * `thinking:{type:"disabled"}` is accepted but ignored, so off is expressed
 * through the chat-template kwarg instead.
 */
function makeReasoningInjector(
  upstream?: StreamOptions["onPayload"],
): NonNullable<StreamOptions["onPayload"]> {
  return async (payload, model) => {
    const next = await upstream?.(payload, model);
    const body = (next !== undefined ? next : payload) as AnthropicMessagesBody;

    if (body.thinking?.type === "disabled") {
      return applyReasoningOff(body);
    }

    const effort = body.output_config?.effort;
    if (effort && EFFORT_OFF_VALUES.has(effort)) {
      return applyReasoningOff(body);
    }

    return body;
  };
}

// The Anthropic SDK appends `/v1/messages` to the client base URL.
function toMessagesBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, "");
}

function stampAnthropicModels(models: NeuralwattChatModel[], baseUrl: string) {
  return models.map((model) => {
    const { reasoningContract, ...compiled } = model;
    // No retained contract: the identity map is the alias-free special case.
    const thinkingLevelMap = model.reasoning
      ? reasoningContract
        ? buildAnthropicThinkingLevelMap(reasoningContract)
        : model.thinkingLevelMap
          ? { ...model.thinkingLevelMap }
          : undefined
      : undefined;

    return {
      ...compiled,
      api: "anthropic-messages" as const,
      provider: NEURALWATT_PROVIDER_ID,
      baseUrl: toMessagesBaseUrl(model.baseUrl ?? baseUrl),
      headers: NEURALWATT_REQUEST_HEADERS,
      compat: {
        forceAdaptiveThinking: true,
        supportsTemperature: true,
        supportsStrictTools: false,
        supportsCacheControlOnTools: false,
      },
      ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
    };
  });
}

export function createAnthropicMessagesApi(options?: {
  upstream?: ProviderStreams;
  streamSimple?: AnyStreamSimple;
  baseUrl?: string;
}): NeuralwattApiHandler {
  const requireUpstream = (): ProviderStreams => {
    if (!options?.upstream) {
      throw new Error(
        "createAnthropicMessagesApi requires an upstream: pass pi-ai's anthropicMessagesApi() streams",
      );
    }
    return options.upstream;
  };
  const fallbackBaseUrl = options?.baseUrl ?? NEURALWATT_BASE_URL;
  const withReasoning = (options?: {
    onPayload?: StreamOptions["onPayload"];
  }) => ({
    ...options,
    onPayload: makeReasoningInjector(options?.onPayload),
  });

  return {
    stampModels: (models) => stampAnthropicModels(models, fallbackBaseUrl),
    stream: (model, context, streamOptions) =>
      requireUpstream().stream(
        model,
        context,
        withReasoning(streamOptions) as never,
      ),
    streamSimple: (model, context, simpleOptions) =>
      (options?.streamSimple ?? requireUpstream().streamSimple)(
        model,
        context,
        withReasoning(simpleOptions),
      ),
  };
}
