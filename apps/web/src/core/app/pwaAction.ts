import { safeReadStringLS, safeRemoveLS } from "@shared/lib/storage";

export const PWA_ACTION_KEY = "pwa_pending_action";

export function consumePwaAction(): string | null {
  const a = safeReadStringLS(PWA_ACTION_KEY);
  if (a) safeRemoveLS(PWA_ACTION_KEY);
  return a || null;
}
