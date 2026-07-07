import type { Migration } from "@aliou/pi-utils-settings";
import type { NeuralwattRawConfig } from "../types";

export { disableLegacyModelIdsByDefaultMigration } from "./01-disable-legacy-model-ids-by-default";
export {
  backupConfig,
  flatToNestedConfigMigration,
} from "./02-flat-to-nested-config";

import { disableLegacyModelIdsByDefaultMigration } from "./01-disable-legacy-model-ids-by-default";
import { flatToNestedConfigMigration } from "./02-flat-to-nested-config";

export const migrations: Migration<NeuralwattRawConfig>[] = [
  disableLegacyModelIdsByDefaultMigration,
  flatToNestedConfigMigration,
];
