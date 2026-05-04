// Zod schemas (HTTP request/response + domain)
export * from "./schemas";

// Shared, DOM-free utilities (macros, date, pluralization, speech parsers)
export * from "./utils";

// Pure types (currently empty barrel for future expansion)
export * from "./types";

// Shared, DOM-free constants (storage keys, etc.)
export * from "./lib/storageKeys";

// Sensitive query-key policy for the React Query persisters
// (web → IDB, mobile → MMKV). See PR #004 in
// `docs/planning/storage-roadmap.md`.
export * from "./lib/sensitiveQueryKeys";

// Hub dashboard module ordering (pure helpers; storage I/O is per-platform).
export * from "./lib/dashboard";

// Assistant capability catalogue — single source of truth for chat
// quick actions, the catalogue UI, and (PR 2) the system-prompt tool list.
export * from "./lib/assistantCatalogue";

// Platform-agnostic key/value store contract + factories. See
// `docs/planning/storage-roadmap.md` → PR #006.
//   - `createMemoryKVStore()` for vitest/jest suites.
//   - `createWebKVStore(localStorage, window)` on web.
//   - `createMmkvKVStore(() => activeMmkv)` on mobile.
export * from "./storage/kv";

// Cross-platform cloud-sync module registry. Single source of truth
// for which `STORAGE_KEYS.*` belong to which sync module on web
// (localStorage) and mobile (MMKV). See PR #007 in
// `docs/planning/storage-roadmap.md`.
export * from "./sync/modules";

// Cross-platform "wrap a KVStore so writes to tracked keys auto-fire
// `enqueueChange`" factory — explicit replacement for the web
// `localStorage.setItem` monkey-patch. See PR #008 in
// `docs/planning/storage-roadmap.md`.
export * from "./sync/syncedKV";

// Onboarding "vibe picks" state + FTUX time-to-value helpers.
export * from "./lib/vibePicks";

// Active-modules helpers (derived from vibe picks) + hide-inactive toggle.
export * from "./lib/activeModules";

// Defaults shared by web/mobile undo-toast helpers.
export * from "./lib/undoToast";
export * from "./lib/undoTombstone";

// Onboarding gate helpers (first-launch detection, done flag, splash taxonomy).
export * from "./lib/onboarding";

// Onboarding goal-setting (multi-step v2).
export * from "./lib/onboardingGoals";

// Reset helpers for Settings ("Restart onboarding").
export * from "./lib/onboardingReset";

// Module onboarding checklists (Phase 2 — activation).
export * from "./lib/moduleChecklist";

// First-real-entry detection shared between web and mobile.
export * from "./lib/firstRealEntry";

// Gain-first / fear A/B copy for the post-FTUX SoftAuth prompt.
export * from "./lib/softAuthCopy";

// Dashboard recommendation types + helpers.
export * from "./lib/recommendations";

// `useDashboardFocus` pure core — dismissal map, visible filter, focus+rest.
export * from "./lib/dashboardFocus";

// Hub dashboard quick-stats preview selector (pure; callers own storage I/O).
export * from "./lib/quickStats";

// Centralized hryvnia / currency formatter — single source of truth for ₴
// amounts across the web app and shared package. See `formatMoney.ts`
// for conventions; `fmtAmt` (in `@sergeant/finyk-domain`) remains the
// transaction-row formatter and is intentionally separate.
export * from "./lib/formatMoney";

// Hub weekly-digest helpers — week key / storage key / digest freshness.
export * from "./lib/weeklyDigest";

// Shared hint/tip system (taxonomy + caps). Rendering is per-platform.
export * from "./lib/hints";

// Daily nudges & re-engagement (Phase 3 — retention).
export * from "./lib/nudges";

// A/B testing infrastructure (deterministic variant assignment).
export * from "./lib/abTest";

// Canonical analytics event names shared across platforms.
export * from "./lib/analyticsEvents";

// DOM-free haptic contract (platform adapters register at app bootstrap).
export * from "./lib/haptic";

// Shared animation presets — timing, easing, spring configs, stagger helpers.
export * from "./lib/animations";

// Platform feature-detect (Capacitor WebView vs browser). DOM-free; reads
// the `Capacitor` global injected by the native runtime, so `@sergeant/web`
// can import it without pulling `@capacitor/*` into the browser bundle.
export * from "./lib/platform";

// DOM-free file-download contract (platform adapters register at app bootstrap).
export * from "./lib/fileDownload";

// DOM-free file-import contract (platform adapters register at app bootstrap).
export * from "./lib/fileImport";

// DOM-free visual-keyboard-inset hook contract (platform adapters register at
// app bootstrap).
export * from "./hooks/useVisualKeyboardInset";

// Contract fixtures — canonical wire-shape samples shared between
// `apps/server` (producer) and `packages/api-client` (consumer). See
// `./contract-fixtures/README.md` and the diagnostic in
// `docs/diagnostics/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md` §7.4.
export * from "./contract-fixtures";
