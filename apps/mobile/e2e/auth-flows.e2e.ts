/**
 * Auth — sign-up, invalid-credential error, forgot-password request.
 *
 * Covers the authentication surfaces that no other suite touches:
 *
 *   1. Sign-up form — happy path: fill name + email + password (≥10 chars)
 *      → submit → land on tabs.  The mock-auth interceptor
 *      (`e2eAuthMock.ts`) responds to `POST /api/auth/sign-up/email` with
 *      a success payload; after rehydration `useUser` returns a user
 *      object and the `(tabs)` layout gate opens.
 *
 *   2. Sign-in error — wrong password → `auth-sign-in-error` node appears.
 *      The mock returns a 401 for any password that is NOT the default
 *      `detox-pass-2026`, so we can reliably trigger the error path.
 *
 *   3. Forgot-password request — tap "Забув пароль?" link on sign-in →
 *      fill email → submit → success state (check-email card) renders.
 *      This exercises `forgetPassword` from `authClient` through the
 *      mock interceptor.
 *
 * All three `it()` blocks call `disableAutoSignIn()` at the module level
 * so `setup.ts` leaves the app on `/(auth)/sign-in`.
 *
 * Follow-up testIDs to wire in app source:
 *   - `auth-sign-up-name`    — name Input in `sign-up.tsx` (currently no testID)
 *   - `auth-sign-up-email`   — email Input in `sign-up.tsx` (currently no testID)
 *   - `auth-sign-up-password`— password Input in `sign-up.tsx` (currently no testID)
 *   - `auth-sign-up-submit`  — submit Button in `sign-up.tsx` (currently no testID)
 *   - `auth-forgot-email`    — email Input in `forgot-password.tsx` (currently no testID)
 *   - `auth-forgot-submit`   — submit Button in `forgot-password.tsx` (currently no testID)
 *   - `auth-forgot-success`  — success card root in `forgot-password.tsx` (currently no testID)
 */
import { by, element, waitFor } from "detox";

import {
  DEFAULT_WAIT_MS,
  byId,
  tapWhenVisible,
  waitForVisibleById,
} from "./helpers";
import {
  disableAutoSignIn,
  E2E_USER_EMAIL,
  waitForSignInScreen,
  waitForTabsVisible,
} from "./_helpers/auth";

disableAutoSignIn();

// A fresh unique email for the sign-up test. Using a timestamp keeps it
// deterministic enough for the mock interceptor (which accepts any email).
const SIGN_UP_EMAIL = `detox-signup-${Date.now()}@sergeant.test`;
// Static non-secret fixture for the mock auth interceptor (accepts any value).
const SIGN_UP_PASSWORD = "detox-signup-pass-2026"; // gitleaks:allow
const SIGN_UP_NAME = "Detox User";

describe("Аутентифікація — sign-up / error / forgot-password", () => {
  it("navigates to sign-up, creates an account and lands on tabs", async () => {
    // Sign-in screen is shown on cold start (auto-sign-in disabled).
    await waitForSignInScreen();

    // Tap the "Створити" link to navigate to sign-up.
    // The Link renders with accessible text; tap by label since there
    // is no testID on the link itself.
    await waitFor(element(by.text("Створити")))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await element(by.text("Створити")).tap();

    // Wait for the sign-up form. The inputs need testIDs wired — this
    // spec is written against the documented/expected IDs listed in the
    // file header.
    await waitForVisibleById("auth-sign-up-name");

    await byId("auth-sign-up-name").replaceText(SIGN_UP_NAME);
    await byId("auth-sign-up-email").replaceText(SIGN_UP_EMAIL);
    await byId("auth-sign-up-password").replaceText(SIGN_UP_PASSWORD);

    // Submit the form.
    await tapWhenVisible("auth-sign-up-submit");

    // After a successful sign-up the router replaces to "/" which
    // renders `(tabs)`. Wait for the hub tab to confirm the session.
    await waitForTabsVisible();
  });

  it("shows an error node when sign-in credentials are wrong", async () => {
    await waitForSignInScreen();

    // Use the correct email but an incorrect password so the mock
    // interceptor responds with an auth error.
    await byId("auth-sign-in-email").replaceText(E2E_USER_EMAIL);
    await byId("auth-sign-in-password").replaceText("wrong-password-xyz");
    await tapWhenVisible("auth-sign-in-submit");

    // The error Text node (`auth-sign-in-error`) is only mounted when
    // `res.error` is truthy. We do NOT wait for tabs — after an error
    // the router stays on `/(auth)/sign-in`.
    await waitForVisibleById("auth-sign-in-error");

    // The submit button remains on screen (user can retry).
    await waitForVisibleById("auth-sign-in-submit");
  });

  it("submits forgot-password request and shows the success card", async () => {
    await waitForSignInScreen();

    // Tap the "Забув пароль?" link — it navigates to
    // `/(auth)/forgot-password` via Expo Router `<Link>`.
    await waitFor(element(by.text("Забув пароль?")))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await element(by.text("Забув пароль?")).tap();

    // Fill the email and submit. These testIDs need wiring — see header.
    await waitForVisibleById("auth-forgot-email");
    await byId("auth-forgot-email").replaceText(E2E_USER_EMAIL);
    await tapWhenVisible("auth-forgot-submit");

    // After a successful `forgetPassword` call the component switches to
    // the success state which renders `auth-forgot-success`.
    await waitForVisibleById("auth-forgot-success");
  });
});
