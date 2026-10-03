import { useEffect, useState } from "react";
import { isHubRestoreReady } from "./hubBackupReadiness";

const POLL_MS = 500;

/**
 * `true`, коли dual-write контексти зареєстровані й кеші прогріті
 * (`hubBackupReadiness.ts`). Стан у памʼяті модулів без підписки, тож хук
 * опитує, доки не отримає `true`, і далі перестає.
 */
export function useHubRestoreReady(): boolean {
  const [ready, setReady] = useState(() => isHubRestoreReady());
  useEffect(() => {
    if (ready) return;
    const id = globalThis.setInterval(() => {
      if (isHubRestoreReady()) {
        setReady(true);
        globalThis.clearInterval(id);
      }
    }, POLL_MS);
    return () => globalThis.clearInterval(id);
  }, [ready]);
  return ready;
}
