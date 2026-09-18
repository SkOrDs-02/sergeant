/**
 * Auth helpers for Detox E2E suites.
 *
 * The new "full" suites (`routine-full.e2e.ts`, `fizruk-full.e2e.ts`,
 * `finyk-full.e2e.ts`, `nutrition-full.e2e.ts`) drive the real sign-in
 * → module-action → sign-out flow. They depend on the mock-auth fetch
 * interceptor in `apps/mobile/src/auth/e2eAuthMock.ts`, activated by
 * `EXPO_PUBLIC_E2E_REAL_AUTH=1`.
 *
 * Smoke suites kept the `EXPO_PUBLIC_E2E=1` auth-bypass behaviour. When
 * both flags are set, `(tabs)/_layout.tsx` disables the bypass and the
 * shared `signInIfNeeded()` helper (called from `setup.ts`) auto-signs
 * in so old suites do not have to grow new boilerplate — they keep
 * landing on the tabs as before, just through a real Better Auth round
 * trip against the fetch mock.
 *
 * Test-account secrets ship with safe defaults so the local Detox loop
 * works out of the box; CI overrides them via repo secrets.
 */
import { by, element, expect as detoxExpect, waitFor } from "detox";

import { DEFAULT_WAIT_MS, byId, waitForVisibleById } from "../helpers";

/** Default test account — must match `e2eAuthMock` defaults. */
export const E2E_USER_EMAIL =
  process.env.EXPO_PUBLIC_E2E_USER_EMAIL?.trim() || "e2e-detox@sergeant.test";
export const E2E_USER_PASSWORD =
  process.env.EXPO_PUBLIC_E2E_USER_PASSWORD?.trim() || "detox-pass-2026";

/**
 * Used by `setup.ts` to opt new "full" suites out of the auto sign-in.
 * Module-level state is fine because Detox runs suites sequentially
 * (`maxWorkers: 1`); a `beforeAll`/`afterAll` pair toggles it.
 */
let autoSignInDisabled = false;

export function disableAutoSignIn(): void {
  autoSignInDisabled = true;
}

export function enableAutoSignIn(): void {
  autoSignInDisabled = false;
}

export function isAutoSignInDisabled(): boolean {
  return autoSignInDisabled;
}

/**
 * Wait briefly for the sign-in screen to appear. Returns `true` if it
 * did, `false` otherwise (e.g. the auth-bypass flag is on and the
 * tabs rendered immediately).
 */
async function isOnSignInScreen(timeoutMs = 2_000): Promise<boolean> {
  try {
    await waitFor(element(by.id("auth-sign-in-email")))
      .toBeVisible()
      .withTimeout(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

/** Wait for the Хаб tab to be visible — i.e. user is on the tab bar. */
export async function waitForTabsVisible(
  timeoutMs: number = DEFAULT_WAIT_MS,
): Promise<void> {
  await waitFor(element(by.id("tab-hub")))
    .toBeVisible()
    .withTimeout(timeoutMs);
}

/**
 * Drive the sign-in form once it is on screen. Idempotent — if the
 * tabs are already up, this is a no-op.
 */
export async function signIn(
  email: string = E2E_USER_EMAIL,
  password: string = E2E_USER_PASSWORD,
): Promise<void> {
  if (!(await isOnSignInScreen(1_000))) {
    return;
  }
  await byId("auth-sign-in-email").replaceText(email);
  await byId("auth-sign-in-password").replaceText(password);
  await byId("auth-sign-in-submit").tap();
  await waitForTabsVisible();
}

/**
 * Wait for the sign-in screen. Use after a sign-out call to assert
 * the redirect actually landed on `/(auth)/sign-in`.
 */
export async function waitForSignInScreen(
  timeoutMs: number = DEFAULT_WAIT_MS,
): Promise<void> {
  await waitForVisibleById("auth-sign-in-email", timeoutMs);
  await detoxExpect(element(by.id("auth-sign-in-submit"))).toBeVisible();
}

/**
 * Drive the sign-out flow from any tab. Navigates Hub → Налаштування
 * (modal) → Акаунт group → "Вийти", then waits for the sign-in screen
 * to appear (the layout guard redirects there once `useUser` flips to
 * `data.user === null`).
 *
 * Settings are reached through the `account-open` dev-only entry on
 * the Hub dashboard if it exists; otherwise we deep-link via
 * `device.openURL`. The helper falls back gracefully so individual
 * suites do not have to know how the modal is launched.
 */
export async function openSettings(): Promise<void> {
  // Tabs route the modal via `app/settings.tsx`; the Hub dashboard
  // exposes a gear button with testID `dashboard-settings-button` (see
  // `apps/mobile/src/core/dashboard/HubDashboard.tsx`).
  try {
    await waitFor(element(by.id("tab-hub")))
      .toBeVisible()
      .withTimeout(2_000);
    await element(by.id("tab-hub")).tap();
  } catch {
    /* hub already focused */
  }
  await tapByIdSoft("dashboard-settings-button", 4_000);
  // `settings-group-account` is the sticky-tab pill on the Settings
  // modal; tapping it scrolls down to the Акаунт section so the
  // (collapsed-by-default) `account-section` SettingsGroup lands in
  // view. The pill is rendered unconditionally so this works even
  // when content has not loaded yet.
  await waitForVisibleById("settings-group-account");
  await tapByIdSoft("settings-group-account", 4_000);
}

/** Tap a testID if it appears within `timeoutMs`; swallow if it doesn't. */
async function tapByIdSoft(
  testID: string,
  timeoutMs: number,
): Promise<boolean> {
  try {
    await waitFor(element(by.id(testID)))
      .toBeVisible()
      .withTimeout(timeoutMs);
    await element(by.id(testID)).tap();
    return true;
  } catch {
    return false;
  }
}

/**
 * Sign out from the current authenticated session. Walks the settings
 * modal and taps "Вийти", then waits for the redirect to sign-in.
 */
export async function signOut(): Promise<void> {
  await openSettings();
  // `account-section` is the collapsible SettingsGroup card; tapping
  // its header expands it so `account-sign-out` mounts into the DOM.
  await waitForVisibleById("account-section");
  await element(by.id("account-section")).tap();
  await waitForVisibleById("account-sign-out");
  await element(by.id("account-sign-out")).tap();
  await waitForSignInScreen();
}

/**
 * Auto sign-in shim used by `setup.ts`. If the sign-in screen is up
 * (real-auth mode without an existing session) and auto sign-in is
 * not disabled by the current suite, fill the credentials and wait
 * for the tabs.
 */
export async function signInIfNeeded(): Promise<void> {
  if (autoSignInDisabled) return;
  if (!(await isOnSignInScreen(1_500))) return;
  await byId("auth-sign-in-email").replaceText(E2E_USER_EMAIL);
  await byId("auth-sign-in-password").replaceText(E2E_USER_PASSWORD);
  await byId("auth-sign-in-submit").tap();
  await waitForTabsVisible();
}
