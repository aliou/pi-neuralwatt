import type { Migration } from "@aliou/pi-utils-settings";

export {
  backupConfig,
  flatToNestedConfigMigration,
} from "./02-flat-to-nested-config";
export { renameHiddenToEarlyAccessMigration } from "./03-rename-hidden-to-early-access";
export { removeSubBarIntegrationMigration } from "./04-remove-sub-bar-integration";

import { flatToNestedConfigMigration } from "./02-flat-to-nested-config";
import { renameHiddenToEarlyAccessMigration } from "./03-rename-hidden-to-early-access";
import { removeSubBarIntegrationMigration } from "./04-remove-sub-bar-integration";

export const migrations = [
  flatToNestedConfigMigration,
  renameHiddenToEarlyAccessMigration,
  removeSubBarIntegrationMigration,
] as Migration<object>[];
