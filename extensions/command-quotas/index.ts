import { bindProjectConfig } from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { configLoader } from "../../src/config";
import {
  NEURALWATT_CONFIG_UPDATED_EVENT,
  NEURALWATT_EXTENSIONS_REGISTER_EVENT,
  NEURALWATT_EXTENSIONS_REQUEST_EVENT,
  type NeuralwattConfigUpdatedPayload,
} from "../../src/events";
import { registerQuotasCommand } from "./command";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  bindProjectConfig(pi, configLoader);

  let enabled = configLoader.getConfig().quotaCommand.enabled;
  registerQuotasCommand(pi, () => enabled);

  pi.on("session_start", () => {
    enabled = configLoader.getConfig().quotaCommand.enabled;
  });

  pi.events.on(NEURALWATT_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as NeuralwattConfigUpdatedPayload).config.quotaCommand
      .enabled;
  });

  pi.events.on(NEURALWATT_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(NEURALWATT_EXTENSIONS_REGISTER_EVENT, {
      feature: "quotaCommand",
    });
  });
}
