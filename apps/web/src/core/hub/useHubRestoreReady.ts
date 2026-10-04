import { useEffect, useState } from "react";
import { getHubRestoreBlock, type HubRestoreBlock } from "./hubBackupReadiness";

const POLL_MS = 500;

/**
 * Чому імпорт ще заблокований (`loading` / `sync`) або `null`, коли можна.
 * Стан у памʼяті модулів і в мітці pull без підписки, тож хук опитує, доки не
 * отримає `null`, і далі перестає (`hubBackupReadiness.ts`).
 */
export function useHubRestoreBlock(): HubRestoreBlock {
  const [block, setBlock] = useState<HubRestoreBlock>(() =>
    getHubRestoreBlock(),
  );
  useEffect(() => {
    if (block === null) return;
    const id = globalThis.setInterval(() => {
      const next = getHubRestoreBlock();
      setBlock(next);
      if (next === null) globalThis.clearInterval(id);
    }, POLL_MS);
    return () => globalThis.clearInterval(id);
  }, [block]);
  return block;
}

/** `true`, коли контексти, кеші й (для акаунта) перший pull готові. */
export function useHubRestoreReady(): boolean {
  return useHubRestoreBlock() === null;
}
