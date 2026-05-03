/**
 * Єдиний екземпляр shared `createModuleStorage` для модуля Харчування.
 *
 * Імпортується з різних файлів (nutritionStorage, waterStorage,
 * shoppingListStorage, …) щоб усі вони використовували спільні буфери
 * pending/last-written і єдиний механізм flush-on-hide.
 */

import { createModuleStorage } from "@shared/lib/storage/createModuleStorage";

export const nutritionStorage = createModuleStorage({ name: "nutrition" });
