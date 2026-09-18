// URL path constants for the App shell.
//
// This module owns only the string constants (SIGN_IN_PATH, CHAT_PATH, etc.)
// and path-based-module helpers. `KNOWN_PATHS` — the 404-guard allowlist —
// is derived automatically in `routes.ts` from `STANDALONE_ROUTE_PATHS` so
// that adding a new route to `StandaloneRoutes.tsx` automatically updates the
// allowlist without a parallel edit here.

import { HUB_MODULE_IDS } from "@shared/lib/modules/hubNav";

// Canonical document title. Mirrors `apps/web/index.html` <title> and the
// PWA manifest `name` (vite.config.js). Some sub-routes were observed losing
// the static title (browser falling back to the URL), so `RootLayout` keeps
// it pinned to this value on every navigation.
export const APP_TITLE = "Sergeant · Твій персональний хаб життя";

// Per-route document titles. `RootLayout` resolves the active pathname against
// this map on every navigation and falls back to `APP_TITLE` for anything not
// listed. Standalone surfaces (`/status`, `/chat`) get a specific title so the
// browser tab / history entry reads meaningfully instead of the generic hub
// name. Format mirrors `APP_TITLE`: `Sergeant · <surface>`.
export const ROUTE_TITLES: Readonly<Record<string, string>> = {
  "/status": "Sergeant · Статус системи",
  "/chat": "Sergeant · Асистент",
  "/assistant": "Sergeant · Що вміє Сержант",
  "/capabilities": "Sergeant · Що вміє додаток",
  "/pricing": "Sergeant · Тарифи",
  "/sign-in": "Sergeant · Вхід",
  "/reset-password": "Sergeant · Скидання пароля",
  "/verify-email": "Sergeant · Підтвердження email",
  "/welcome": "Sergeant · Ласкаво просимо",
  // Немає запису для "/settings" (L-1, 2026-08-08): цей pathname більше
  // ніколи не є ОСІЛОЮ локацією — `core/settings/route.tsx` редиректить
  // з нього синхронно в ефекті одразу після монтування, тож
  // `location.pathname === "/settings"` не переживає навіть один
  // помітний кадр title-бару. Кінцева ціль — вкладка хаба (`/?tab=
  // settings`), а хаб-вкладки (dashboard/reports/profile/settings усі
  // разом) свого власного title ніколи не мали — цей запис лише
  // вирізняв Налаштування з-поміж них, хоча решта трьох вкладок завжди
  // ділили загальний `APP_TITLE`. Прибрано, а не залишено: мертвий
  // запис для недосяжної локації — саме той клас коментаря/даних-привида,
  // що вже плутав людей в інших місцях цього аудиту (§6 аудиту).
  // Немає запису для "/insights" (2026-08-10) — з тієї ж причини, що й
  // для "/settings" вище: `core/insights/route.tsx` тепер редиректить у
  // вкладку хаба (`/?tab=reports`), тож цей pathname більше ніколи не є
  // ОСІЛОЮ локацією. Хаб-вкладки власного title не мають — усі чотири
  // ділять `APP_TITLE`.
  "/legal/privacy": "Sergeant · Політика приватності",
  "/legal/terms": "Sergeant · Умови використання",
  "/legal/cookies": "Sergeant · Політика cookies",
  "/legal/offer": "Sergeant · Публічна оферта",
  "/offline": "Sergeant · Немає зʼєднання",
  "/500": "Sergeant · Помилка сервера",
};

// Path-based module surfaces (`/finyk/...`, `/fizruk/...`) resolve their
// tab title by first URL segment so every nested page (`/finyk/budgets`,
// `/nutrition/log`) reads as its module instead of the generic app name.
const MODULE_TITLES: Readonly<Record<string, string>> = {
  finyk: "Фінік",
  fizruk: "Фізрук",
  nutrition: "Їжа",
  routine: "Рутина",
};

/**
 * Resolves the document title for a pathname. Order: an exact
 * `ROUTE_TITLES` entry wins; otherwise a path-based module's first
 * segment (`/finyk/budgets` → «Фінік»); otherwise the canonical
 * `APP_TITLE`. Keeps title resolution in one place so the `RootLayout`
 * effect and any future caller stay in sync.
 */
export function titleForPath(pathname: string): string {
  const exact = ROUTE_TITLES[pathname];
  if (exact) return exact;
  const firstSegment = pathname.startsWith("/")
    ? (pathname.slice(1).split("/", 1)[0] ?? "")
    : "";
  const moduleTitle = MODULE_TITLES[firstSegment];
  if (moduleTitle) return `Sergeant · ${moduleTitle}`;
  return APP_TITLE;
}

// Auth lives at `/sign-in` rather than as an in-page overlay. This keeps
// the FTUX splash (`/`) as the true cold-start surface — the old
// `showAuth` boolean meant that a first-time visitor who tapped
// "Вже маю акаунт" bounced into the auth form with no URL change, so
// the back button, deep links, and shared URLs all misbehaved. Having
// a named route also lets us link straight to sign-in from emails,
// push-notification landing pages, etc.
export const SIGN_IN_PATH = "/sign-in";

// Common external spellings of the auth entry (`/login`, `/signin`,
// `/auth`). Live-deploy audit 2026-06-11 showed these landing on the
// 404 page; `StandaloneRoutes.tsx` redirects each to `SIGN_IN_PATH`
// so muscle-memory URLs and stale external links keep working.
export const SIGN_IN_ALIAS_PATHS: ReadonlyArray<string> = [
  "/login",
  "/signin",
  "/auth",
];

// Assistant capability catalogue (`/help`, Settings link, `?` button in
// chat input all converge here). URL-addressable so it survives reload
// and can be deep-linked from notifications / docs.
export const ASSISTANT_PATH = "/assistant";

/**
 * Каталог можливостей САМОГО ДОДАТКА. Окремо від ASSISTANT_PATH, який
 * перелічує інструменти чату: це два різні питання, і зведення їх на один
 * екран топило б новачка у десятках сценаріїв.
 */
export const CAPABILITIES_PATH = "/capabilities";

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

// Лендинг, куди Better Auth редиректить після `GET /api/auth/verify-email`.
// Значення дзеркалить `VERIFY_EMAIL_CALLBACK_PATH` у
// `apps/server/src/auth/verificationMail.ts` — саме сервер вшиває цей шлях
// у `callbackURL` листа, тож пара має лишатись синхронною (розʼїзд = біла
// сторінка після кліку в пошті).
export const VERIFY_EMAIL_PATH = "/verify-email";
export const PROFILE_PATH = "/profile";
export const DESIGN_PATH = "/design";
export const PRICING_PATH = "/pricing";
export const LEGAL_PRIVACY_PATH = "/legal/privacy";
export const LEGAL_TERMS_PATH = "/legal/terms";
export const LEGAL_COOKIES_PATH = "/legal/cookies";
export const LEGAL_OFFER_PATH = "/legal/offer";

// Anonymous public status page (`/status`). Renders the per-component
// view from `/api/status`. No auth — same intent as `/pricing` (public
// trust surface, must be reachable without a session).
export const STATUS_PATH = "/status";

// Canonical offline surface (`OfflinePage`). Directly navigable so it can be
// deep-linked / bookmarked; the SW's offline navigation-fallback
// (`sw/cache.ts`'s `setCatchHandler`, page-audit-10 F1) already serves the
// precached SPA shell for ANY uncached navigation while offline, so once
// this path is a real client route the existing fallback covers it for free
// — no separate SW change needed.
export const OFFLINE_PATH = "/offline";

// Canonical unrecoverable-render-error surface (`ServerErrorPage`). Mounted
// as the top-level `<ErrorBoundary>` fallback (`main.tsx`) and, for parity
// with `/offline`, also directly navigable.
export const SERVER_ERROR_PATH = "/500";

/**
 * Modules that have graduated from `/?module=<id>` to a top-level
 * `/<id>/...` path-based URL contract (initiative 0006 §Phase 2).
 *
 * Single source of truth: both `useHubNavigation` (router-side
 * pathname → activeModule mapping + URL emission) and
 * `renderStandaloneRoute` (404 fallback exemption) read from this
 * set. When a new module migrates, add it here once; both consumers
 * pick it up automatically.
 *
 * Order: nutrition (PR #2104), finyk (PR #2108), fizruk (PR #2541),
 * routine (Phase 2.d). All four Phase 2 modules now path-based.
 */
export const PATH_BASED_MODULE_IDS: ReadonlySet<string> = new Set(
  HUB_MODULE_IDS,
);

/**
 * Returns true when `pathname` is owned by a path-based module
 * (`/<id>` or `/<id>/...`). Used by `renderStandaloneRoute` to skip
 * the unknown-paths 404 for module-owned URLs — without this, the
 * App shell renders `<NotFoundPage />` for `/finyk` / `/nutrition`
 * before `useHubNavigation` gets a chance to set `activeModule`.
 *
 * Boundary: `/finykfoo` is **not** a finyk path (would otherwise
 * alias `/finykprofile` → finyk). The check splits on `/` to require
 * an exact first-segment match, mirroring `parsePathnameModule()` in
 * `useHubNavigation.ts`.
 */
export function isPathBasedModulePath(pathname: string): boolean {
  if (typeof pathname !== "string" || pathname.length < 2) return false;
  if (!pathname.startsWith("/")) return false;
  const firstSegment = pathname.slice(1).split("/", 1)[0] ?? "";
  if (!firstSegment) return false;
  return PATH_BASED_MODULE_IDS.has(firstSegment);
}
