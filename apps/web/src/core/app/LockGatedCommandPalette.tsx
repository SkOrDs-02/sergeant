/**
 * @status Active
 * @owner @Skords-01
 */
import { useEffect } from "react";
import {
  CommandPalette,
  useCommandPaletteControls,
} from "@shared/components/ui/CommandPalette";
import { useAppLockContext } from "../security/AppLockContext";
import { isPrivateContentHidden } from "../security/useAppLock";

/**
 * Глобальна палітра команд не монтується під замком (sec-13, priv-15):
 * її рядки (модулі, дії, недавні) не мають лежати в DOM за екраном PIN.
 * Відкриту палітру закриваємо при замиканні, щоб вона не з'явилась знову
 * після розблокування.
 */
export function LockGatedCommandPalette() {
  const { state } = useAppLockContext();
  const hidden = isPrivateContentHidden(state);
  const { close } = useCommandPaletteControls();
  useEffect(() => {
    if (hidden) close();
  }, [hidden, close]);
  if (hidden) return null;
  return <CommandPalette />;
}
