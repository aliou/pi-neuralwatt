import type { Migration } from "@aliou/pi-utils-settings";
import type { NeuralwattConfig } from "../types";

export {
  backupConfig,
  flatToNestedConfigMigration,
} from "./02-flat-to-nested-config";
export { renameHiddenToEarlyAccessMigration } from "./03-rename-hidden-to-early-access";

import { flatToNestedConfigMigration } from "./02-flat-to-nested-config";
import { renameHiddenToEarlyAccessMigration } from "./03-rename-hidden-to-early-access";

// Each migration is typed against its own historical input shape. The loader
// applies them in sequence on the raw config record, so they are cast to the
// current config type for the array.
export const migrations = [
  flatToNestedConfigMigration,
  renameHiddenToEarlyAccessMigration,
] as unknown as Migration<NeuralwattConfig>[];
