import type { Migration } from "@aliou/pi-utils-settings";
import type { NeuralwattConfig } from "../types";

export { disableLegacyModelIdsByDefaultMigration } from "./01-disable-legacy-model-ids-by-default";
export {
  backupConfig,
  flatToNestedConfigMigration,
} from "./02-flat-to-nested-config";
export { renameHiddenToEarlyAccessMigration } from "./03-rename-hidden-to-early-access";
export { enableAliasesForLegacyUsersMigration } from "./04-enable-aliases-for-legacy-users";

import { disableLegacyModelIdsByDefaultMigration } from "./01-disable-legacy-model-ids-by-default";
import { flatToNestedConfigMigration } from "./02-flat-to-nested-config";
import { renameHiddenToEarlyAccessMigration } from "./03-rename-hidden-to-early-access";
import { enableAliasesForLegacyUsersMigration } from "./04-enable-aliases-for-legacy-users";

export const migrations: Migration<NeuralwattConfig>[] = [
  disableLegacyModelIdsByDefaultMigration,
  flatToNestedConfigMigration,
  renameHiddenToEarlyAccessMigration,
  enableAliasesForLegacyUsersMigration,
];
