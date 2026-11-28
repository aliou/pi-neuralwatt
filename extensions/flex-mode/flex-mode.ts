import type { Api, Model } from "@earendil-works/pi-ai";
import {
  type ExtensionAPI,
  type ExtensionContext,
  VIRTUAL_MODEL_STATE_ENTRY,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Check } from "typebox/value";
import {
  NEURALWATT_FLEX_TOGGLE_EVENT,
  type NeuralwattFlexTogglePayload,
} from "../../src/events";

const FLEX_MODEL_SUFFIX = "-flex";
const VirtualRouteSchema = Type.Object({
  provider: Type.String(),
  modelId: Type.String(),
  state: Type.Object({
    provider: Type.String(),
    modelId: Type.String(),
  }),
});

export type FlexModeResult =
  | { status: "toggled"; enabled: boolean }
  | { status: "unresolved-model"; virtual: boolean }
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

function flexVariantId(modelId: string, enabled?: boolean): string {
  const turnOn = enabled ?? !isFlexModelId(modelId);
  if (turnOn) {
    return isFlexModelId(modelId) ? modelId : `${modelId}${FLEX_MODEL_SUFFIX}`;
  }
  return isFlexModelId(modelId)
    ? modelId.slice(0, -FLEX_MODEL_SUFFIX.length)
    : modelId;
}

function resolveModel(ctx: ExtensionContext): Model<Api> | undefined {
  const selected = ctx.model;
  if (!selected) return undefined;
  if (!isVirtualModel(selected)) return selected;

  const branch = ctx.sessionManager.getBranch();
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (
      entry.type !== "custom" ||
      entry.customType !== VIRTUAL_MODEL_STATE_ENTRY
    )
      continue;
    if (!Check(VirtualRouteSchema, entry.data)) continue;
    if (
      entry.data.provider !== selected.provider ||
      entry.data.modelId !== selected.id
    )
      continue;
    return ctx.modelRegistry.find(
      entry.data.state.provider,
      entry.data.state.modelId,
    );
  }
  return undefined;
}

export function registerFlexModeToggle(pi: ExtensionAPI): void {
  let currentContext: ExtensionContext | undefined;

  pi.on("session_start", (_event, ctx) => {
    currentContext = ctx;
  });
  pi.on("model_select", (_event, ctx) => {
    currentContext = ctx;
  });

  pi.events.on(NEURALWATT_FLEX_TOGGLE_EVENT, async (data: unknown) => {
    const { enabled, respond } = data as NeuralwattFlexTogglePayload;
    const model = currentContext ? resolveModel(currentContext) : undefined;
    if (!model || !currentContext) {
      respond?.({ enabled: false });
      return;
    }

    const turnOn = enabled ?? !isFlexModelId(model.id);
    const target = currentContext.modelRegistry.find(
      model.provider,
      flexVariantId(model.id, turnOn),
    );
    if (!target) {
      respond?.({ enabled: isFlexModelId(model.id) });
      return;
    }
    if (target.id === model.id) {
      respond?.({ enabled: isFlexModelId(model.id) });
      return;
    }

    const switched = await pi.setModel(target);
    if (!switched) return;
    respond?.({ enabled: turnOn });
  });
}

export async function toggleFlexMode(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<FlexModeResult> {
  const model = resolveModel(ctx);
  if (!model) {
    return {
      status: "unresolved-model",
      virtual: isVirtualModel(ctx.model),
    };
  }

  const target = ctx.modelRegistry.find(
    model.provider,
    flexVariantId(model.id),
  );
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
