import { useEffect } from "react";
import { registerDirtyState } from "../lib/ui/dirtyState";

/**
 * Поки `dirty === true`, вкладка вважається такою, що тримає незбережений
 * ввід: тихий idle-reload сервіс-воркера (`core/app/autoUpdate.ts`) у цей
 * час не спрацьовує. Знімається на `false` і на unmount.
 */
export function useRegisterDirtyState(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    return registerDirtyState();
  }, [dirty]);
}
