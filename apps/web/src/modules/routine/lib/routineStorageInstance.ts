/**
 * Єдиний екземпляр shared `createModuleStorage` для модуля Рутина.
 *
 * Імпортується з різних файлів (`residualImport`, тощо) щоб усі вони
 * використовували спільні буфери pending/last-written і єдиний
 * механізм flush-on-hide.
 *
 * Винесено в окремий файл (Stage 8 PR #057r-tombstone) щоб
 * `residualImport.ts` міг ділитися інстансом без циклу імпортів і
 * без зайвого копіпасту LS-readers. Mirror of
 * `apps/web/src/modules/fizruk/lib/fizrukStorageInstance.ts`.
 */

import { createModuleStorage } from "@shared/lib/storage/createModuleStorage";

export const routineStorage = createModuleStorage({ name: "routine" });
