// Manual-only flag helpers for Finyk.
//
// Historically this file also hosted the FTUX demo-seeding path; that
// has been removed (empty-state first-run). What remains is the flag
// that lets FinykApp skip the Monobank login gate — used by the
// onboarding presets and by the "Далі без банку" escape hatch on the
// Finyk login screen itself.
//
// The key name itself lives in `@sergeant/finyk-domain/storage-keys`
// so the mobile twin can enable the same flag on its MMKV adapter.
//
// Kept at this path (rather than renamed) so the many call sites that
// already import `FINYK_MANUAL_ONLY_KEY` / `enableFinykManualOnly` from
// here don't need to be touched.

import { FINYK_MANUAL_ONLY_KEY } from "@sergeant/finyk-domain/storage-keys";
import { writeRaw } from "./finykStorage";

// Re-export under its existing name so `apps/web` call sites that
// import `FINYK_MANUAL_ONLY_KEY` from `./lib/demoData` keep working.
// New code (and mobile) should import directly from
// `@sergeant/finyk-domain/storage-keys`.
export { FINYK_MANUAL_ONLY_KEY };

/**
 * Mark the account as "manual only" — Finyk will skip the Monobank
 * login screen. Used by the onboarding "Додати першу витрату" path
 * and by the "Далі без банку" button on the login screen itself.
 */
export function enableFinykManualOnly(): void {
  try {
    writeRaw(FINYK_MANUAL_ONLY_KEY, "1");
  } catch {
    /* noop */
  }
}
