import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { toggleFlexMode } from "./flex-mode";

export function registerFlexModeCommand(pi: ExtensionAPI): void {
  pi.registerCommand("neuralwatt:flex", {
    description: "Toggle the Neuralwatt flex variant of the current model",
    handler: async (_args, ctx) => {
      const result = await toggleFlexMode(pi, ctx);
      switch (result.status) {
        case "toggled":
          ctx.ui.notify(
            `Neuralwatt: flex mode ${result.enabled ? "enabled" : "disabled"}`,
            "info",
          );
          return;
        case "unresolved-model":
          ctx.ui.notify(
            result.virtual
              ? "Neuralwatt: flex mode requires a routed virtual model"
              : "Neuralwatt: flex mode requires a selected model",
            "error",
          );
          return;
        case "missing-variant":
          ctx.ui.notify(
            `Neuralwatt: ${result.variant} variant is unavailable for ${result.modelName}`,
            "error",
          );
          return;
        case "switch-failed":
          ctx.ui.notify("Neuralwatt: could not switch models", "error");
      }
    },
  });
}
