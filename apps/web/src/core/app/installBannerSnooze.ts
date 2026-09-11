import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";

/**
 * Shared "snooze" bookkeeping for the PWA / iOS install banners
 * (founder-ux-review round 2, O2).
 *
 * Before this file existed, both banners' plain "×" close persisted a
 * permanent `"1"` flag: one accidental tap and the install invite never
 * came back, short of a manual localStorage wipe (`useIosInstallBanner.ts`,
 * `usePwaInstall.ts` — `ios_install_banner_dismissed` / `pwa_install_dismissed`).
 * That flag stays as the EXPLICIT "не нагадувати" / "already installed"
 * opt-out — it is a deliberate choice and should stay permanent. This
 * module backs the OTHER affordance (the plain "×"): it defers the invite
 * instead of killing it, and caps the number of times it can be re-shown
 * so a returning-but-still-not-interested user isn't nagged forever either.
 *
 * Timestamps are plain epoch ms (`Date.now()`), not a `YYYY-MM-DD` day key:
 * this measures an elapsed DURATION ("30 days from the moment of dismiss"),
 * not a calendar day boundary, so ADR-0078's device-vs-Kyiv doctrine does
 * not apply here — there is no personal "day" involved, only a countdown
 * against the device's own clock (which `Date.now()` already reflects,
 * regardless of the device's timezone).
 */

/** How long a plain "×" close defers the banner for. */
export const INSTALL_BANNER_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/** After this many snoozes, the banner stops coming back at all. */
export const INSTALL_BANNER_MAX_SNOOZES = 3;

export interface InstallBannerSnoozeState {
  /** Epoch ms — the banner stays hidden until this instant. */
  until: number;
  /** Total number of times the banner has been snoozed via this key. */
  count: number;
}

function isSnoozeState(value: unknown): value is InstallBannerSnoozeState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<InstallBannerSnoozeState>;
  return (
    typeof candidate.until === "number" && typeof candidate.count === "number"
  );
}

/** Read the persisted snooze record for `key`, or `null` if absent/corrupt. */
export function readInstallBannerSnooze(
  key: string,
): InstallBannerSnoozeState | null {
  const parsed = safeReadLS<unknown>(key);
  return isSnoozeState(parsed) ? parsed : null;
}

/**
 * `true` when the banner must stay hidden: either the snooze window from
 * the last "×" is still running, or the show-count cap has been hit.
 */
export function isInstallBannerSnoozed(
  state: InstallBannerSnoozeState | null,
  now: number = Date.now(),
): boolean {
  if (!state) return false;
  if (state.count >= INSTALL_BANNER_MAX_SNOOZES) return true;
  return now < state.until;
}

/**
 * Record a new snooze (the plain "×" close — NOT the explicit "не
 * нагадувати"/"вже встановлено" opt-out, which stays a permanent flag).
 * Extends the hidden window and bumps the show-count.
 */
export function snoozeInstallBanner(
  key: string,
  previous: InstallBannerSnoozeState | null,
  now: number = Date.now(),
): InstallBannerSnoozeState {
  const next: InstallBannerSnoozeState = {
    until: now + INSTALL_BANNER_SNOOZE_MS,
    count: (previous?.count ?? 0) + 1,
  };
  safeWriteLS(key, next);
  return next;
}
