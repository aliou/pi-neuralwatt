import { bindProjectConfig } from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { configLoader } from "../_shared/config";
import { registerFlexModeCommand } from "./command";
import { registerFlexModeToggle } from "./flex-mode";

export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  bindProjectConfig(pi, configLoader);

  registerFlexModeCommand(pi);
  registerFlexModeToggle(pi);
}
