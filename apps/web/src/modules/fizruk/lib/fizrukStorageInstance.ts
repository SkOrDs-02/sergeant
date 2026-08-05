/**
 * Єдиний екземпляр shared `createModuleStorage` для модуля Фізрук.
 *
 * Імпортується з різних файлів (`fizrukStorage.ts`, …) щоб усі вони
 * використовували спільні буфери pending/last-written і єдиний
 * механізм flush-on-hide.
 *
 * Винесено в окремий файл (Stage 8 PR #057f-tombstone) — початково щоб
 * `residualImport.ts` (видалений 2026-08, одноразовий pre-beta LS→SQLite
 * дренаж; див. git history) міг ділитися інстансом з `fizrukStorage.ts`
 * без циклу імпортів і без зайвого копіпасту LS-readers.
 */

import { createModuleStorage } from "@shared/lib/storage/createModuleStorage";

export const fizrukStorage = createModuleStorage({ name: "fizruk" });
