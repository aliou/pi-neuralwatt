import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  NEURALWATT_EXTENSIONS_REGISTER_EVENT,
  NEURALWATT_EXTENSIONS_REQUEST_EVENT,
} from "../../config";
import { registerQuotasCommand } from "./command";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();

  const config = configLoader.getConfig();

  if (config.quotaCommand) {
    registerQuotasCommand(pi);
  }

  pi.events.on(NEURALWATT_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(NEURALWATT_EXTENSIONS_REGISTER_EVENT, {
      feature: "quotaCommand",
    });
  });
}
