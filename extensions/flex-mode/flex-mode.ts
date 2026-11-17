import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";

const FLEX_MODEL_SUFFIX = "-flex";

export type FlexModeResult =
  | { status: "toggled"; enabled: boolean }
  | { status: "requires-neuralwatt"; virtual: boolean }
  | {
      status: "missing-variant";
      modelName: string;
      variant: "standard" | "flex";
    }
  | { status: "switch-failed" };

function isVirtualModel(model: { api: string } | undefined): boolean {
  return model?.api === "pi-virtual";
}

function isFlexModelId(modelId: string): boolean {
  return modelId.endsWith(FLEX_MODEL_SUFFIX);
}

function flexVariantId(modelId: string): string {
  return isFlexModelId(modelId)
    ? modelId.slice(0, -FLEX_MODEL_SUFFIX.length)
    : `${modelId}${FLEX_MODEL_SUFFIX}`;
}

function latestResponse(
  branch: readonly SessionEntry[],
): AssistantMessage | undefined {
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role !== "assistant") continue;
    if (message.stopReason === "error" || message.stopReason === "aborted")
      continue;
    return message;
  }
  return undefined;
}

function resolveModel(ctx: ExtensionContext): Model<Api> | undefined {
  const selected = ctx.model;
  if (selected && !isVirtualModel(selected)) {
    return selected.provider === "neuralwatt" ? selected : undefined;
  }
  const routed = latestResponse(ctx.sessionManager.getBranch());
  return routed?.provider === "neuralwatt"
    ? ctx.modelRegistry.find("neuralwatt", routed.model)
    : undefined;
}

export async function toggleFlexMode(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<FlexModeResult> {
  const model = resolveModel(ctx);
  if (!model) {
    return {
      status: "requires-neuralwatt",
      virtual: isVirtualModel(ctx.model),
    };
  }

  const target = ctx.modelRegistry.find("neuralwatt", flexVariantId(model.id));
  if (!target) {
    return {
      status: "missing-variant",
      modelName: model.name,
      variant: isFlexModelId(model.id) ? "standard" : "flex",
    };
  }

  const switched = await pi.setModel(target);
  if (!switched) return { status: "switch-failed" };
  return { status: "toggled", enabled: isFlexModelId(target.id) };
}
