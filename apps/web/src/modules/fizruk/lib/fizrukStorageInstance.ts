/**
 * Єдиний екземпляр shared `createModuleStorage` для модуля Фізрук.
 *
 * Імпортується з різних файлів (fizrukStorage, residualImport, …) щоб
 * усі вони використовували спільні буфери pending/last-written і
 * єдиний механізм flush-on-hide.
 *
 * Винесено в окремий файл (Stage 8 PR #057f-tombstone) щоб
 * `residualImport.ts` міг ділитися інстансом з `fizrukStorage.ts`
 * без циклу імпортів і без зайвого копіпасту LS-readers.
 */

import { createModuleStorage } from "@shared/lib/storage/createModuleStorage";

export const fizrukStorage = createModuleStorage({ name: "fizruk" });
