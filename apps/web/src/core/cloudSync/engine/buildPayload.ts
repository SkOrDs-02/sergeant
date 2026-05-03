import { isModuleSyncExcluded } from "../config";
import { collectModuleData } from "../state/moduleData";
import type { ModulePayload } from "../types";

/**
 * Build the `{ module → payload }` map pushed to the server. For each
 * requested module, reads its localStorage slice via `collectModuleData`
 * and stamps `clientUpdatedAt` from the dirty-tracking `modifiedTimes`
 * snapshot (falling back to "now" for modules without a tracked modify).
 *
 * Modules with no local data are omitted so we never send empty objects.
 * Modules excluded via {@link isModuleSyncExcluded} (PR #025 — SQLite
 * read-path active) are skipped so the client stops pushing the LS blob.
 *
 * Extracted from the inline blocks that previously lived in `push.ts`,
 * `upload.ts`, and `initialSync.ts` (merge branch).
 */
export function buildModulesPayload(
  modNames: Iterable<string>,
  modifiedTimes: Record<string, string>,
): Record<string, ModulePayload> {
  const modules: Record<string, ModulePayload> = {};
  for (const mod of modNames) {
    if (isModuleSyncExcluded(mod)) continue;
    const data = collectModuleData(mod);
    if (data && Object.keys(data).length > 0) {
      modules[mod] = {
        data,
        clientUpdatedAt: modifiedTimes[mod] || new Date().toISOString(),
      };
    }
  }
  return modules;
}
