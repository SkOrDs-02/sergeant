// Centralised list of URL-addressable surfaces handled by the App
// shell. Anything outside `KNOWN_PATHS` falls through to a 404 instead
// of silently rendering the dashboard. Kept as a tiny standalone
// module so route guards in `App.tsx` and `StandaloneRoutes.tsx` reuse
// the exact same set without circular imports.

// Auth lives at `/sign-in` rather than as an in-page overlay. This keeps
// the FTUX splash (`/`) as the true cold-start surface — the old
// `showAuth` boolean meant that a first-time visitor who tapped
// "Вже маю акаунт" bounced into the auth form with no URL change, so
// the back button, deep links, and shared URLs all misbehaved. Having
// a named route also lets us link straight to sign-in from emails,
// push-notification landing pages, etc.
export const SIGN_IN_PATH = "/sign-in";

// Assistant capability catalogue (`/help`, Settings link, `?` button in
// chat input all converge here). URL-addressable so it survives reload
// and can be deep-linked from notifications / docs.
export const ASSISTANT_PATH = "/assistant";

// Dedicated AI chat route. Replaces the fullscreen modal that used to
// slam over the dashboard. Reads `?q=` and `?autoSend=1` so launcher
// hand-offs (`InlineAiRail`'s "Open in chat" escalation, `ai-handoff`
// fallback, capability `Try in chat` CTA) and external deep links
// share one URL shape.
export const CHAT_PATH = "/chat";

// URL-addressable cold-start splash. Having a real route (not just a
// modal overlay on `/`) means the splash can be deep-linked, shows the
// right title in history/back navigation, and — crucially — renders the
// populated-hub peek behind itself instead of hovering over an empty
// dashboard.
export const WELCOME_PATH = "/welcome";

export const RESET_PASSWORD_PATH = "/reset-password";
export const PROFILE_PATH = "/profile";
export const DESIGN_PATH = "/design";
export const PRICING_PATH = "/pricing";

// All URL paths the app handles. Anything outside this set gets a 404
// instead of silently falling through to the dashboard.
export const KNOWN_PATHS: ReadonlySet<string> = new Set([
  "/",
  SIGN_IN_PATH,
  RESET_PASSWORD_PATH,
  PROFILE_PATH,
  DESIGN_PATH,
  PRICING_PATH,
  ASSISTANT_PATH,
  CHAT_PATH,
  WELCOME_PATH,
]);
