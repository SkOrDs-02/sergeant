/// <reference types="vite/client" />

/**
 * Vite client env declarations.
 *
 * Standard `vite/client` types declare `ImportMetaEnv` with `string |
 * undefined` for all `VITE_*` keys (open-set). We narrow our
 * project-specific keys here so that callers can rely on actual types
 * (e.g. `string` for keys that `vite.config.js#define` injects
 * unconditionally).
 *
 * Keep in sync with `apps/web/vite.config.js#define` block.
 */
interface ImportMetaEnv {
  /**
   * Build-id (git short SHA / Date.now() fallback) injected at build
   * time via `vite.config.js#define["import.meta.env.VITE_BUILD_ID"]`.
   * Used by:
   *   - `apps/web/src/sw/version.ts` (cache-name suffix).
   *   - `apps/web/src/shared/lib/api/queryClientPersister.ts` (RQ
   *     persist `buster` — invalidates IDB snapshot on new deploy,
   *     Hard Rule #3 protection).
   *
   * In Vitest unit tests (no Vite-pipeline) this is `undefined`;
   * call sites coalesce to `"dev"`. Migrated from ambient
   * `__SW_BUILD_ID__` / `__APP_BUILD_ID__` globals in PR-28
   * (stack-pulse 2026-05 / L1).
   */
  readonly VITE_BUILD_ID?: string;

  /**
   * Build target — `"web"` (Vercel deploy) or `"capacitor"`
   * (`apps/mobile-shell` build). Drives DCE branches in `main.tsx`
   * (skip SW registration in Capacitor) and webpush hooks. Set via
   * `VITE_TARGET=capacitor` env var; injected unconditionally as a
   * literal by `vite.config.js#define`.
   */
  readonly VITE_TARGET?: "web" | "capacitor";

  /**
   * Вимикає кнопки соцвходу (Google / Apple) на `AuthPage`. Єдине
   * значення, що вимикає, — рядок `"false"`; будь-що інше, включно з
   * незаданою змінною, лишає кнопки на місці.
   *
   * Потрібна деплоям на власному домені (бета-проєкт на окремому
   * Vercel): OAuth `redirect_uri` будується з єдиного `BETTER_AUTH_URL`,
   * тож Google повертає користувача не туди, звідки він пішов.
   */
  readonly VITE_SOCIAL_LOGIN_ENABLED?: string;

  /**
   * Показує комерційні поверхні: сторінку тарифів `/pricing`, секцію
   * «Підписка та план» у Налаштуваннях, купівельні CTA пейволу, trial-банер
   * і всі внутрішні посилання на `/pricing`. Вмикає рівно рядок `"1"`.
   *
   * **Полярність протилежна до `VITE_SOCIAL_LOGIN_ENABLED` вище — і це
   * навмисно.** Там незадана змінна лишає кнопки на місці; тут незадана
   * ховає поверхню. Для закритої бети безпечний напрямок саме такий:
   * забути про конфіг у новому середовищі має означати «сховано», а не
   * «показали недороблений checkout».
   */
  readonly VITE_ENABLE_COMMERCE?: string;

  /**
   * Показує юридичні документи (`/legal/privacy`, `/legal/terms`,
   * `/legal/cookies`, `/legal/offer`) і блок посилань на них. Вмикає рівно
   * рядок `"1"`; незадана змінна ховає — та сама полярність, що й
   * `VITE_ENABLE_COMMERCE`.
   *
   * Окремий тумблер від комерції не випадково: URL політики приватності
   * обовʼязковий для сабміту Capacitor-шелу в App Store і саме його
   * запитує GDPR-звернення, тож юрдоки цілком імовірно доведеться
   * повернути раніше за тарифи.
   */
  readonly VITE_ENABLE_LEGAL?: string;

  /**
   * Показує кнопку голосового вводу (`VoiceMicButton` — 5 call-сайтів у
   * Finyk / Fizruk / Nutrition / Routine). Вмикає рівно рядок `"1"`;
   * незадана змінна ховає — та сама полярність, що й у двох прапорців
   * вище.
   *
   * Знято з продукту 2026-08-10 на прохання власника. Дві причини —
   * повністю розписані у
   * `shared/components/ui/voice/resolveVoiceProvider.ts#isVoiceInputEnabled`:
   * непередбачувана поведінка на iOS standalone-PWA (гейт WebKit-бага
   * стоїть лише на Web-Speech-шляху, не на Groq) і вартість
   * `/api/transcribe` — $1.00/добу/юзер без plan-gate.
   */
  readonly VITE_ENABLE_VOICE_INPUT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
