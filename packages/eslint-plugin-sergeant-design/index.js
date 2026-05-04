/**
 * sergeant-design — local ESLint plugin for Sergeant design-system guardrails.
 *
 * Rules:
 *   - no-eyebrow-drift: forbid the combination of `uppercase`, `tracking-*`,
 *     and `text-*` in a single className string. Use <SectionHeading> (or
 *     <Label normalCase={false}>) instead. Add
 *       // eslint-disable-next-line sergeant-design/no-eyebrow-drift
 *     for intentional stylistic exceptions (e.g. narrative overlay stories).
 *
 *   - no-ellipsis-dots: forbid three consecutive ASCII dots (`...`) inside
 *     string literals and JSX text nodes — the typographic ellipsis `…`
 *     (U+2026) is a single glyph, renders with correct kerning, and is
 *     what Web Interface Guidelines recommend for truncation cues
 *     ("Loading…", "Пошук…", etc.). Auto-fixable.
 *
 *   - no-hex-in-classname: forbid arbitrary-value hex colors in
 *     className (`bg-[#10b981]`, `text-[#fff]/50`, …). Every color must
 *     come from the design-system token layer so dark-mode, palette
 *     migration, and WCAG tiers apply uniformly.
 *
 *   - no-foreign-module-accent: inside `apps/[app]/src/modules/[X]/`
 *     subtrees, only `[X]`'s accent utilities (`bg-[X]-surface`,
 *     `text-[X]-strong`, `ring-[X]`, …) are allowed. Cross-module
 *     shells (`core/`, `shared/`, `stories/`) remain free to reference
 *     all four module accents.
 *
 * Motion / reduced-motion (convention — not auto-enforced yet):
 *   - Prefer `motion-safe:` on `animate-*` and decorative transitions so
 *     `prefers-reduced-motion: reduce` users get calmer UI; pair with
 *     `motion-reduce:transition-none` where you use `transition-all` on
 *     controls.
 *   - Global `index.css` already shortens animation/transition duration under
 *     `prefers-reduced-motion`; explicit `motion-safe:` keeps intent obvious
 *     in code review and avoids relying only on the global reset.
 */

const EYEBROW_MESSAGE =
  "Avoid the `uppercase` + `tracking-*` + `text-*` eyebrow combo in raw classNames — use <SectionHeading> (or <Label>) instead. Add // eslint-disable-next-line sergeant-design/no-eyebrow-drift only for intentional narrative / overlay typography.";

// A className triggers the rule iff it contains all three markers.
const RX_UPPERCASE = /(?:^|\s)uppercase(?:\s|$)/;
const RX_TRACKING = /(?:^|\s)tracking-[\w-]+/;
// Match any `text-*` utility (size OR color) — the drift is specifically the
// colocation with `uppercase` + `tracking-`, regardless of which `text-*`.
const RX_TEXT = /(?:^|\s)text-[\w-]+(?:\/\d+)?(?:\s|$)/;

function classNameHasEyebrowDrift(value) {
  if (typeof value !== "string") return false;
  return (
    RX_UPPERCASE.test(value) && RX_TRACKING.test(value) && RX_TEXT.test(value)
  );
}

const noEyebrowDrift = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid the uppercase+tracking+text eyebrow combo outside the <SectionHeading> / <Label> design-system primitives.",
    },
    schema: [],
    messages: { drift: EYEBROW_MESSAGE },
  },
  create(context) {
    function report(node, value) {
      if (classNameHasEyebrowDrift(value)) {
        context.report({ node, messageId: "drift" });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") report(node, node.value);
      },
      TemplateElement(node) {
        if (node.value && typeof node.value.cooked === "string") {
          report(node, node.value.cooked);
        } else if (node.value && typeof node.value.raw === "string") {
          report(node, node.value.raw);
        }
      },
    };
  },
};

const ELLIPSIS_MESSAGE =
  "Use `…` (U+2026, a single ellipsis glyph) instead of three ASCII dots `...` in user-facing strings. The typographic ellipsis renders with correct kerning and is what Web Interface Guidelines recommend for truncation cues (e.g. 'Loading…').";

const RX_THREE_DOTS = /\.{3}/;

function replaceEllipsisDots(text) {
  return text.replace(/\.{3}/g, "…");
}

const noEllipsisDots = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Forbid three ASCII dots (`...`) inside string literals — use the typographic ellipsis `…` (U+2026).",
    },
    fixable: "code",
    schema: [],
    messages: { ellipsis: ELLIPSIS_MESSAGE },
  },
  create(context) {
    function reportLiteral(node, raw) {
      if (!RX_THREE_DOTS.test(raw)) return;
      context.report({
        node,
        messageId: "ellipsis",
        fix(fixer) {
          const sourceCode = context.sourceCode ?? context.getSourceCode();
          const text = sourceCode.getText(node);
          return fixer.replaceText(node, replaceEllipsisDots(text));
        },
      });
    }
    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        reportLiteral(node, node.value);
      },
      TemplateElement(node) {
        const raw = node.value && node.value.cooked;
        if (typeof raw !== "string") return;
        reportLiteral(node, raw);
      },
      JSXText(node) {
        if (typeof node.value !== "string") return;
        if (!RX_THREE_DOTS.test(node.value)) return;
        context.report({
          node,
          messageId: "ellipsis",
          fix(fixer) {
            return fixer.replaceText(node, replaceEllipsisDots(node.value));
          },
        });
      },
    };
  },
};

// ─── no-raw-tracked-storage ─────────────────────────────────────────────
//
// Background
// ----------
// On mobile, MMKV writes bypass JS, so a hook that calls raw
// `useLocalStorage` with a key registered in
// `packages/shared/src/sync/modules.ts → SYNC_MODULES` will silently
// break cloud sync — the exact regression that bit Finyk and Fizruk
// before `useSyncedStorage` was introduced. The warning in
// `apps/mobile/src/lib/storage.ts` is documentary; this rule makes
// the safety mechanical.
//
// The rule fires when:
//   - the callee is `useLocalStorage` (identifier, regardless of import
//     source — the mobile app re-exports it from `@/lib/storage`), and
//   - the first argument is either a string literal whose value is one
//     of the tracked MMKV key strings, OR a `STORAGE_KEYS.<NAME>`
//     member expression where `<NAME>` is one of the tracked names
//     listed in `SYNC_MODULES`.
//
// Tracked names + values are mirrored verbatim from
// `packages/shared/src/sync/modules.ts` (the cross-platform registry,
// PR #007) and `packages/shared/src/lib/storageKeys.ts`. The companion
// test `__tests__/no-raw-tracked-storage.parity.test.mjs` reads both
// source files and fails CI if the rule's set drifts from them, so a
// new tracked key cannot be added to `SYNC_MODULES` without updating
// the rule (or vice versa).

const TRACKED_STORAGE_KEY_NAMES = new Set([
  // finyk
  "FINYK_HIDDEN",
  "FINYK_BUDGETS",
  "FINYK_SUBS",
  "FINYK_ASSETS",
  "FINYK_DEBTS",
  "FINYK_RECV",
  "FINYK_HIDDEN_TXS",
  "FINYK_MONTHLY_PLAN",
  "FINYK_TX_CATS",
  "FINYK_MONO_DEBT_LINKED",
  "FINYK_NETWORTH_HISTORY",
  "FINYK_TX_SPLITS",
  "FINYK_CUSTOM_CATS",
  "FINYK_TX_CACHE",
  "FINYK_INFO_CACHE",
  "FINYK_TX_CACHE_LAST_GOOD",
  "FINYK_SHOW_BALANCE",
  // FINYK_TOKEN intentionally NOT tracked: the Monobank PAT is server-only
  // (`mono_connection.token_ciphertext`) and writing it client-side is
  // banned by the dedicated `no-finyk-token-in-storage` rule.
  "FINYK_MANUAL_EXPENSES",
  "FINYK_TX_FILTERS",
  // fizruk — removed from SYNC_MODULES in PR #030 (storage-roadmap
  // Stage 4). The eleven `fizruk_*_v1` LS/MMKV keys are no longer
  // cloud-synced through `module_data.fizruk`; the per-table
  // `fizruk_*` SQLite mirror plus the op-log carry workouts /
  // measurements / templates / wellbeing / daily-log instead. The
  // dedicated `no-restricted-syntax` guard in `eslint.config.js`
  // prevents new direct reads of `STORAGE_KEYS.FIZRUK_<key>`.
  // routine — removed from SYNC_MODULES in PR #026 (storage-roadmap
  // Stage 4). Completions now live in SQLite; the LS blob is no longer
  // cloud-synced. The dedicated ESLint guard in eslint.config.js
  // prevents new direct reads of STORAGE_KEYS.ROUTINE.
  // nutrition — removed from SYNC_MODULES in PR #034 (storage-roadmap
  // Stage 4). The five `nutrition_*_v1` LS/MMKV keys are no longer
  // cloud-synced through `module_data.nutrition`; the per-table
  // `nutrition_*` SQLite mirror plus the op-log carry meals /
  // pantries / prefs / saved-recipes instead. The dedicated
  // `no-restricted-syntax` guard in `eslint.config.js` prevents new
  // direct reads of `STORAGE_KEYS.NUTRITION_<key>`.
  // profile (web-only payload — `USER_PROFILE` does not exist in MMKV,
  // but listing it here keeps the cross-platform registry symmetric so
  // mobile sync no longer null-overwrites the server blob).
  "USER_PROFILE",
]);

const TRACKED_STORAGE_KEY_VALUES = new Set([
  // finyk
  "finyk_hidden",
  "finyk_budgets",
  "finyk_subs",
  "finyk_assets",
  "finyk_debts",
  "finyk_recv",
  "finyk_hidden_txs",
  "finyk_monthly_plan",
  "finyk_tx_cats",
  "finyk_mono_debt_linked",
  "finyk_networth_history",
  "finyk_tx_splits",
  "finyk_custom_cats_v1",
  "finyk_tx_cache",
  "finyk_info_cache",
  "finyk_tx_cache_last_good",
  "finyk_show_balance_v1",
  // "finyk_token" intentionally NOT tracked: server-only PAT, see
  // `no-finyk-token-in-storage` rule.
  "finyk_manual_expenses_v1",
  "finyk_tx_filters_v1",
  // fizruk — see TRACKED_STORAGE_KEY_NAMES comment above (retired in
  // PR #030).
  // routine — see TRACKED_STORAGE_KEY_NAMES comment above (retired in
  // PR #026).
  // nutrition — see TRACKED_STORAGE_KEY_NAMES comment above (retired
  // in PR #034).
  // profile (see USER_PROFILE comment above).
  "hub_user_profile_v1",
]);

const RAW_TRACKED_STORAGE_MESSAGE =
  "`useLocalStorage` was called with a key tracked in `packages/shared/src/sync/modules.ts → SYNC_MODULES`. Raw MMKV writes bypass cloud-sync wiring; use `useSyncedStorage` from `@/sync/useSyncedStorage` instead so the change is enqueued automatically.";

function isTrackedKeyArgument(arg) {
  if (!arg) return false;
  // Plain string literal: useLocalStorage("finyk_budgets", …)
  if (arg.type === "Literal" && typeof arg.value === "string") {
    return TRACKED_STORAGE_KEY_VALUES.has(arg.value);
  }
  // Template literal with no expressions: useLocalStorage(`finyk_budgets`, …)
  if (
    arg.type === "TemplateLiteral" &&
    arg.expressions.length === 0 &&
    arg.quasis.length === 1
  ) {
    const cooked = arg.quasis[0].value && arg.quasis[0].value.cooked;
    if (typeof cooked === "string") {
      return TRACKED_STORAGE_KEY_VALUES.has(cooked);
    }
  }
  // Member access: useLocalStorage(STORAGE_KEYS.FINYK_BUDGETS, …)
  if (
    arg.type === "MemberExpression" &&
    !arg.computed &&
    arg.object.type === "Identifier" &&
    arg.object.name === "STORAGE_KEYS" &&
    arg.property.type === "Identifier"
  ) {
    return TRACKED_STORAGE_KEY_NAMES.has(arg.property.name);
  }
  // Bracket access with a literal key: STORAGE_KEYS["FINYK_BUDGETS"]
  if (
    arg.type === "MemberExpression" &&
    arg.computed &&
    arg.object.type === "Identifier" &&
    arg.object.name === "STORAGE_KEYS" &&
    arg.property.type === "Literal" &&
    typeof arg.property.value === "string"
  ) {
    return TRACKED_STORAGE_KEY_NAMES.has(arg.property.value);
  }
  return false;
}

const noRawTrackedStorage = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid `useLocalStorage` calls on mobile when the key is registered in SYNC_MODULES — use `useSyncedStorage` so the write is mirrored to the cloud-sync queue.",
    },
    schema: [],
    messages: { rawTracked: RAW_TRACKED_STORAGE_MESSAGE },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        const isUseLocalStorage =
          (callee.type === "Identifier" && callee.name === "useLocalStorage") ||
          (callee.type === "MemberExpression" &&
            !callee.computed &&
            callee.property.type === "Identifier" &&
            callee.property.name === "useLocalStorage");
        if (!isUseLocalStorage) return;
        if (!node.arguments || node.arguments.length === 0) return;
        if (isTrackedKeyArgument(node.arguments[0])) {
          context.report({ node, messageId: "rawTracked" });
        }
      },
    };
  },
};

// ─── ai-marker-syntax ───────────────────────────────────────────────────
//
// Validates AI code-marker comments follow the canonical syntax defined in
// docs/planning/ai-coding-improvements.md §3.1. Exactly four markers are allowed:
//
//   // AI-NOTE: <text>
//   // AI-DANGER: <text>
//   // AI-GENERATED: <generator>
//   // AI-LEGACY: expires YYYY-MM-DD
//
// The rule scans all comments (line and block) looking for strings that
// *almost* match one of these markers — e.g. `AI-NOTES`, `AINOTE`,
// `AI_NOTE`, or a valid prefix missing the colon — and reports them as
// malformed. Well-formed markers are silently accepted.

// A line within a comment is a valid AI marker if it starts (after
// optional whitespace / block-comment stars) with one of the four
// canonical prefixes followed by a colon and a space.
const VALID_LINE_RE = /^[\s/*]*AI-(NOTE|DANGER|GENERATED|LEGACY):\s/;

// A line within a comment looks like a *malformed* AI marker attempt if
// it starts (after optional whitespace / stars) with something close to
// a canonical marker but not quite right — typos like `AI-NOTES`,
// `AINOTE`, `AI_NOTE`, or a valid prefix missing the colon.
// Only anchored-to-start matches count; "AI-generated" in the middle of
// prose (e.g. "the AI-generated digest") is intentionally ignored.
const MALFORMED_LINE_RE =
  /^[\s/*]*AI[-_\s]?(NOTES?|DANGERS?|GENERATED|LEGACY)\b/i;

const AI_MARKER_MESSAGE =
  'Malformed AI marker: "{{text}}". Valid markers are: // AI-NOTE: …, // AI-DANGER: …, // AI-GENERATED: …, // AI-LEGACY: …';

const aiMarkerSyntax = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Validate AI code-marker comments follow the canonical syntax (AI-NOTE:, AI-DANGER:, AI-GENERATED:, AI-LEGACY:). Catches typos like AI-NOTES, AINOTE, AI_NOTE, or missing colons.",
    },
    schema: [],
    messages: { malformed: AI_MARKER_MESSAGE },
  },
  create(context) {
    return {
      Program() {
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const comments = sourceCode.getAllComments();
        for (const comment of comments) {
          const lines = comment.value.split("\n");
          for (const line of lines) {
            if (!MALFORMED_LINE_RE.test(line)) continue;
            if (VALID_LINE_RE.test(line)) continue;
            const match = line.match(MALFORMED_LINE_RE);
            context.report({
              loc: comment.loc,
              messageId: "malformed",
              data: { text: match[0].trim() },
            });
          }
        }
      },
    };
  },
};

// ─── no-raw-local-storage ───────────────────────────────────────────────
//
// On the web app, every direct `localStorage.*` access is a hazard:
// JSON.parse of corrupted contents throws, `setItem` throws on
// QuotaExceededError, and the whole API throws in private-browsing
// Safari. The shared helpers (`safeReadLS` / `safeWriteLS` from
// `@shared/lib/storage`, `useLocalStorageState` from
// `@shared/hooks/useLocalStorageState`, and `createModuleStorage` from
// `@shared/lib/createModuleStorage`) wrap these calls with try/catch and
// quota fallbacks, and they're the integration boundary tests already
// mock.
//
// This rule blocks raw `localStorage.foo` and `window.localStorage.foo`
// member access. Files that legitimately implement the wrappers above —
// or that haven't been migrated yet — opt out via the eslint.config
// override list, NOT via inline disables, so the migration list stays
// greppable in one place.

const RAW_LOCAL_STORAGE_MESSAGE =
  "Direct `localStorage` access throws on quota / private-browsing / corrupt JSON. Use `safeReadLS` / `safeWriteLS` from `@shared/lib/storage`, the `useLocalStorageState` hook, or `createModuleStorage` so failures are handled and tests can mock the boundary.";

function isLocalStorageMember(node) {
  if (!node || node.type !== "MemberExpression") return false;
  // Direct: `localStorage.foo` / `localStorage["foo"]`
  if (
    node.object.type === "Identifier" &&
    node.object.name === "localStorage"
  ) {
    return true;
  }
  // `window.localStorage.foo` / `globalThis.localStorage.foo` (the chain
  // shows up as a MemberExpression whose `object` is itself a
  // MemberExpression resolving to `localStorage`).
  if (
    node.object.type === "MemberExpression" &&
    !node.object.computed &&
    node.object.property.type === "Identifier" &&
    node.object.property.name === "localStorage" &&
    node.object.object.type === "Identifier" &&
    (node.object.object.name === "window" ||
      node.object.object.name === "globalThis" ||
      node.object.object.name === "self")
  ) {
    return true;
  }
  return false;
}

const noRawLocalStorage = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid direct `localStorage.*` (and `window.localStorage.*`) access in apps/web. Use safeReadLS / useLocalStorageState / createModuleStorage instead.",
    },
    schema: [],
    messages: { raw: RAW_LOCAL_STORAGE_MESSAGE },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (isLocalStorageMember(node)) {
          context.report({ node, messageId: "raw" });
        }
      },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// `valid-tailwind-opacity` — flag color/opacity modifiers that won't render
// ─────────────────────────────────────────────────────────────────────────
//
// Tailwind v3 only generates a `<color>/<N>` utility when `N` exists in
// `theme.opacity`. The default scale steps in 5-pt increments
// (0, 5, 10, 15, 20… 100); the Sergeant preset extends that with `8`
// (canonical "barely there" 8 % wash on panel surfaces — see
// `packages/design-tokens/tailwind-preset.js`). Every other value
// (`bg-finyk/7`, `text-danger/12`, `border-line/18`) silently produces
// **no class** and the surrounding `dark:` / `hover:` override falls
// through to the light-mode background — exactly the dark-mode "светлые
// плитки" regression #814 fixed.
//
// This rule scans className strings (and template literals / JSX
// attributes) for the pattern `<utility>-<color>/<N>` and reports any
// `N` that is not in the allowed set. Arbitrary values (`bg-[#fff]/[.5]`)
// are left alone — Tailwind handles them via the JIT path.
//
// Keep `ALLOWED_TAILWIND_OPACITY_STEPS` in sync with the `opacity`
// extension in `packages/design-tokens/tailwind-preset.js`.

const ALLOWED_TAILWIND_OPACITY_STEPS = new Set([
  0, 5, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90,
  95, 100,
]);

const TAILWIND_OPACITY_UTILITIES = [
  "bg",
  "text",
  "border",
  "ring",
  "fill",
  "stroke",
  "from",
  "to",
  "via",
  "shadow",
  "outline",
  "divide",
  "placeholder",
  "caret",
  "decoration",
  "accent",
];

// Match `<utility>-<color-token>/<digits>` where:
//   • `<utility>` is one of the color-aware utilities above,
//   • `<color-token>` is a non-arbitrary identifier (letters, digits,
//     hyphens) — the JIT path `bg-[#fff]/[.5]` is intentionally skipped,
//   • `<digits>` is 1–3 decimal digits.
// The leading `\b` lets variant prefixes (`dark:`, `hover:`, `lg:`) sit
// in front of the utility.
const RX_TAILWIND_OPACITY = new RegExp(
  String.raw`\b(` +
    TAILWIND_OPACITY_UTILITIES.join("|") +
    String.raw`)-([a-zA-Z][a-zA-Z0-9-]*)\/(\d{1,3})\b`,
  "g",
);

const TAILWIND_OPACITY_MESSAGE =
  "Tailwind opacity step `/{{step}}` is not registered — `{{utility}}` will silently render no class. Use one of: 0, 5, 8, 10, 15, 20, 25 … 100, or extend `theme.opacity` in `packages/design-tokens/tailwind-preset.js`.";

function findInvalidOpacitySteps(value) {
  if (typeof value !== "string" || value.length === 0) return [];
  // Skip strings that obviously aren't className soup — cheap escape so
  // we don't tokenize unrelated literals (URLs, regexes, etc.).
  if (!value.includes("/")) return [];
  const hits = [];
  let match;
  RX_TAILWIND_OPACITY.lastIndex = 0;
  while ((match = RX_TAILWIND_OPACITY.exec(value)) !== null) {
    const [full, utilityPrefix, , stepRaw] = match;
    const step = Number(stepRaw);
    if (!Number.isFinite(step)) continue;
    if (ALLOWED_TAILWIND_OPACITY_STEPS.has(step)) continue;
    hits.push({ utility: full, prefix: utilityPrefix, step });
  }
  return hits;
}

const validTailwindOpacity = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid Tailwind `<color>/<N>` opacity modifiers whose step is not registered in `theme.opacity` — the class is silently dropped, breaking dark-mode and hover overrides.",
    },
    schema: [],
    messages: { unregistered: TAILWIND_OPACITY_MESSAGE },
  },
  create(context) {
    function report(node, value) {
      const hits = findInvalidOpacitySteps(value);
      for (const hit of hits) {
        context.report({
          node,
          messageId: "unregistered",
          data: { utility: hit.utility, step: String(hit.step) },
        });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") report(node, node.value);
      },
      TemplateElement(node) {
        const cooked = node.value && node.value.cooked;
        if (typeof cooked === "string") report(node, cooked);
      },
    };
  },
};

// ─── no-low-contrast-text-on-fill ──────────────────────────────────────
//
// Forbid the saturated brand-fill + `text-white` combination on light
// surfaces. The full rationale, decision matrix, and contrast measurements
// live in `docs/design/brandbook.md` → "WCAG-AA `-strong` Tier" and
// `docs/design/brand-palette-wcag-aa-proposal.md`.
//
// Quick recap: every saturated brand colour ships with a `-strong`
// companion that clears WCAG AA 4.5 : 1 against `text-white`. Reaching
// for the saturated `bg-{family}` (or its `-{50…600}` scale steps) when
// the foreground is `text-white` regresses to ~2.4–2.8 : 1, which is
// what tripped /design's axe gate before PRs #854 / #855.
//
// What this rule flags (in a single className string):
//   - `bg-{family}` or `bg-{family}-{50|100|200|300|400|500|600}`,
//     un-prefixed by any variant (`dark:` / `hover:` / `lg:` etc.),
//   - co-located with `text-white` (also un-prefixed).
//
// What this rule deliberately does NOT flag:
//   - `bg-{family}-strong text-white` — the correct pairing.
//   - `bg-{family}-{700|800|900}` — explicit dark steps.
//   - `bg-{family}/<N>` — opacity-tinted soft washes (different concern;
//     the soft-tier text token is `text-{family}-strong`, not white).
//   - `bg-[#hex] text-white` — arbitrary values; opt-out for one-offs.
//   - `dark:bg-{family} text-white` — on dark surfaces emerald-500
//     vs. white passes (~5.4 : 1); the strong tier would actually
//     regress contrast there.
//   - `bg-{family} text-text` / no `text-white` — colour tile without
//     white-on-fill text is a different design problem.

const STRONG_BG_FAMILIES = [
  "brand",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
];

// Match `bg-{family}` or `bg-{family}-{step}` with **no** variant prefix
// (variant prefixes contain a `:`; we exclude them via the leading
// boundary). The (?<!\S) lookbehind ensures we only match at a
// whitespace boundary so `dark:bg-finyk` does NOT match `bg-finyk`.
//
// The trailing lookahead deliberately rejects `/` so that
// `bg-brand/50` (an opacity-tinted soft wash, explicitly out-of-scope
// per the rule docs) does NOT half-match `bg-brand` with
// `stepRaw=undefined`. Only whitespace / end-of-string close the
// match; the optional `-(\d{1,3})` group already swallows the
// numeric step, so `bg-brand-500/40` similarly fails the lookahead
// and is left for the (separate) opacity-tier rules.
const RX_SATURATED_BG = new RegExp(
  String.raw`(?<!\S)bg-(${STRONG_BG_FAMILIES.join("|")})(?:-(\d{1,3}))?(?=\s|$)`,
  "g",
);

// `text-white` similarly must be base-state; variant-prefixed
// `dark:text-white` shouldn't fire the rule.
const RX_TEXT_WHITE = /(?<!\S)text-white(?=\s|$)/;

const LOW_CONTRAST_MESSAGE =
  "`{{utility}}` + `text-white` fails WCAG AA (~2.4–2.8 : 1). Use `bg-{{family}}-strong` instead — see docs/design/brandbook.md → 'WCAG-AA `-strong` Tier'.";

function findLowContrastFills(value) {
  if (typeof value !== "string" || value.length === 0) return [];
  if (!RX_TEXT_WHITE.test(value)) return [];
  const hits = [];
  let match;
  RX_SATURATED_BG.lastIndex = 0;
  while ((match = RX_SATURATED_BG.exec(value)) !== null) {
    const [full, family, stepRaw] = match;
    if (stepRaw !== undefined) {
      const step = Number(stepRaw);
      // Steps 700/800/900 are dark enough to clear AA against white;
      // we only flag the lighter scale steps. (Nutrition's lime-700
      // technically clears 4.5 : 1 by a 0.17 margin only — the
      // `-strong` companion bumps it to lime-800; treat lime-700 as
      // acceptable here so we don't false-flag explicit dark-step
      // overrides like `bg-nutrition-700`.)
      if (!Number.isFinite(step) || step >= 700) continue;
    }
    hits.push({ utility: full, family });
  }
  return hits;
}

const noLowContrastTextOnFill = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid saturated brand `bg-*` utilities behind `text-white` — use the `-strong` companion (= 700/800 step) so the pairing clears WCAG AA 4.5 : 1.",
    },
    schema: [],
    messages: { lowContrast: LOW_CONTRAST_MESSAGE },
  },
  create(context) {
    function report(node, value) {
      const hits = findLowContrastFills(value);
      for (const hit of hits) {
        context.report({
          node,
          messageId: "lowContrast",
          data: { utility: hit.utility, family: hit.family },
        });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") report(node, node.value);
      },
      TemplateElement(node) {
        const cooked = node.value && node.value.cooked;
        if (typeof cooked === "string") report(node, cooked);
      },
    };
  },
};

// ─── no-bigint-string ───────────────────────────────────────────────────
//
// The `pg` driver returns `int8` / `bigint` columns as JavaScript strings
// (see AGENTS.md hard rule #1 and issue #708). Every server serializer
// that maps `.rows` from a query result must wrap numeric-looking
// columns in `Number(...)` so the JSON contract sends actual numbers
// to API consumers.
//
// This rule uses a **name-based heuristic**: when it finds a
// `.rows.map(…)` call whose callback returns an object literal, it
// checks each property whose key matches the configurable
// `numericColumns` list. If the property value is a plain member
// expression (`r.id`, `row.amount`) without a `Number(…)` wrapper,
// it reports a warning.
//
// The heuristic intentionally prefers false-negatives over
// false-positives — it only fires on the canonical
// `rows.map(r => ({ id: r.id }))` shape.

const DEFAULT_NUMERIC_COLUMNS = [
  "id",
  "user_id",
  "account_id",
  "transaction_id",
  "workout_id",
  "habit_id",
  "recipe_id",
  "meal_id",
  "subscription_id",
  "budget_id",
  "debt_id",
  "asset_id",
  "amount",
  "balance",
  "credit_limit",
  "count",
  "version",
  "created_at",
  "updated_at",
  "deleted_at",
];

const NO_BIGINT_STRING_MESSAGE =
  "Property `{{prop}}` looks like a pg numeric column mapped from `.rows` without `Number(…)` coercion. The `pg` driver returns `bigint` as a string — wrap it: `{{prop}}: Number({{expr}})`. See AGENTS.md rule #1.";

function isNumberCall(node) {
  if (!node || node.type !== "CallExpression") return false;
  const callee = node.callee;
  return callee.type === "Identifier" && callee.name === "Number";
}

function isToNumberOrNullCall(node) {
  if (!node || node.type !== "CallExpression") return false;
  const callee = node.callee;
  return callee.type === "Identifier" && /^toNumber/.test(callee.name);
}

function isNumericCoercion(node) {
  if (!node) return false;
  if (isNumberCall(node)) return true;
  if (isToNumberOrNullCall(node)) return true;
  // parseInt / parseFloat
  if (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    (node.callee.name === "parseInt" || node.callee.name === "parseFloat")
  ) {
    return true;
  }
  // Unary `+expr`
  if (node.type === "UnaryExpression" && node.operator === "+") return true;
  // Ternary where both branches are coerced (e.g. `r.x ? Number(r.x) : 0`)
  if (node.type === "ConditionalExpression") {
    return (
      isNumericCoercion(node.consequent) && isNumericCoercion(node.alternate)
    );
  }
  // Literal number (default fallback like `0` or `null`)
  if (
    node.type === "Literal" &&
    (typeof node.value === "number" || node.value === null)
  ) {
    return true;
  }
  return false;
}

function isRowsMemberAccess(node) {
  // Match `<expr>.rows` (e.g. `result.rows`, `res.rows`)
  if (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier" &&
    node.property.name === "rows"
  ) {
    return true;
  }
  return false;
}

function matchesNumericColumn(key, numericColumnsSet) {
  if (typeof key !== "string") return false;
  // Exact match
  if (numericColumnsSet.has(key)) return true;
  // Suffix match for `*_id`, `*_at` patterns
  if (key.endsWith("_id") || key.endsWith("_at")) return true;
  return false;
}

function getSourceText(node) {
  if (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier"
  ) {
    if (node.object.type === "Identifier") {
      return `${node.object.name}.${node.property.name}`;
    }
  }
  if (node.type === "Identifier") return node.name;
  return "…";
}

const noBigintString = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid mapping pg `.rows` into an object literal without `Number(…)` on columns that are likely `bigint`/`int8`. The `pg` driver returns these as strings — see AGENTS.md rule #1.",
    },
    schema: [
      {
        type: "object",
        properties: {
          numericColumns: {
            type: "array",
            items: { type: "string" },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: { noCoercion: NO_BIGINT_STRING_MESSAGE },
  },
  create(context) {
    const options = context.options[0] || {};
    const numericColumnsSet = new Set(
      options.numericColumns || DEFAULT_NUMERIC_COLUMNS,
    );

    return {
      CallExpression(node) {
        // Look for `<something>.rows.map(<callback>)`
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        if (callee.computed) return;
        if (
          !callee.property ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "map"
        ) {
          return;
        }
        // callee.object should be `<expr>.rows`
        if (!isRowsMemberAccess(callee.object)) return;

        // Get the callback (first argument to .map())
        const callback = node.arguments && node.arguments[0];
        if (!callback) return;
        if (
          callback.type !== "ArrowFunctionExpression" &&
          callback.type !== "FunctionExpression"
        ) {
          return;
        }

        // Find the returned object expression
        let returnedObject = null;

        if (callback.body.type === "ObjectExpression") {
          // Arrow with concise body: `rows.map(r => ({ ... }))`
          returnedObject = callback.body;
        } else if (callback.body.type === "BlockStatement") {
          // Block body — look for `return { ... }`
          for (const stmt of callback.body.body) {
            if (
              stmt.type === "ReturnStatement" &&
              stmt.argument &&
              stmt.argument.type === "ObjectExpression"
            ) {
              returnedObject = stmt.argument;
              break;
            }
          }
        }

        if (!returnedObject) return;

        // Get the callback parameter name (for heuristic: `r.id` where r is the param)
        const params = callback.params;
        if (!params || params.length === 0) return;
        const paramNode = params[0];
        // Support simple identifier and destructuring (skip destructuring — it's a different pattern)
        let paramName = null;
        if (paramNode.type === "Identifier") {
          paramName = paramNode.name;
        } else {
          // Destructured param — skip this callback (the destructured names
          // are the column names themselves, not `r.id` style)
          return;
        }

        // Check each property in the returned object
        for (const prop of returnedObject.properties) {
          if (prop.type === "SpreadElement") continue;
          if (prop.type !== "Property") continue;

          // Get the property key name
          let keyName = null;
          if (prop.key.type === "Identifier") {
            keyName = prop.key.name;
          } else if (
            prop.key.type === "Literal" &&
            typeof prop.key.value === "string"
          ) {
            keyName = prop.key.value;
          }
          if (!keyName) continue;

          // Check if this key matches numeric columns
          if (!matchesNumericColumn(keyName, numericColumnsSet)) continue;

          // Check if the value is already wrapped in Number() or equivalent
          const value = prop.value;
          if (isNumericCoercion(value)) continue;

          // Check if the value is a member expression on the param (r.id, r.amount, etc.)
          if (
            value.type === "MemberExpression" &&
            !value.computed &&
            value.object.type === "Identifier" &&
            value.object.name === paramName
          ) {
            context.report({
              node: prop.value,
              messageId: "noCoercion",
              data: {
                prop: keyName,
                expr: getSourceText(value),
              },
            });
          }
        }
      },
    };
  },
};

// ─── rq-keys-only-from-factory ──────────────────────────────────────────
//
// AGENTS.md hard rule #2 — all React Query keys must come from the
// centralized factory in `apps/web/src/shared/lib/api/queryKeys.ts`.
// Inline array literals (`queryKey: ['something', id]`) drift from the
// factory, break bulk invalidation, and let typos compile silently.
//
// The rule flags `queryKey` or `mutationKey` properties whose value is
// an ArrayExpression in:
//   - `useQuery({ queryKey: [...] })`
//   - `useMutation({ mutationKey: [...] })`
//   - `useInfiniteQuery({ queryKey: [...] })`
//   - `queryClient.invalidateQueries({ queryKey: [...] })`
//   - `queryClient.getQueryData([...])`
//   - `queryClient.setQueryData([...], ...)`
//   - `queryClient.cancelQueries({ queryKey: [...] })`
//   - `queryClient.removeQueries({ queryKey: [...] })`
//   - `queryClient.fetchQuery({ queryKey: [...] })`
//   - `queryClient.prefetchQuery({ queryKey: [...] })`
//   - `queryClient.refetchQueries({ queryKey: [...] })`
//
// The factory file itself is exempt (it legitimately defines the arrays).

const RQ_HOOKS = new Set([
  "useQuery",
  "useMutation",
  "useInfiniteQuery",
  "useSuspenseQuery",
  "useSuspenseInfiniteQuery",
]);

const QC_OPTION_METHODS = new Set([
  "invalidateQueries",
  "cancelQueries",
  "removeQueries",
  "fetchQuery",
  "prefetchQuery",
  "refetchQueries",
  "resetQueries",
  "isFetching",
]);

const QC_DIRECT_KEY_METHODS = new Set([
  "getQueryData",
  "getQueriesData",
  "setQueryData",
  "getQueryState",
  "ensureQueryData",
]);

const DEFAULT_FACTORY_PATH = "apps/web/src/shared/lib/api/queryKeys.ts";

const RQ_KEYS_MESSAGE =
  "Inline array literal for `{{prop}}` — use a factory from `queryKeys.ts` instead (AGENTS.md rule #2). Inline keys drift from the factory, break bulk invalidation, and let typos compile.";

const rqKeysOnlyFromFactory = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid inline array literals for React Query `queryKey` / `mutationKey`. All keys must come from the centralized factory in `queryKeys.ts` (AGENTS.md rule #2).",
    },
    schema: [
      {
        type: "object",
        properties: {
          factoryModulePath: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
    messages: { inlineKey: RQ_KEYS_MESSAGE },
  },
  create(context) {
    const options = context.options[0] || {};
    const factoryPath = options.factoryModulePath || DEFAULT_FACTORY_PATH;

    const filename = context.filename || context.getFilename();
    const normalizedFilename = filename.replace(/\\/g, "/");
    const factoryBase = factoryPath.replace(/\\/g, "/").replace(/\.\w+$/, "");
    const filenameBase = normalizedFilename.replace(/\.\w+$/, "");

    if (filenameBase.endsWith(factoryBase)) {
      return {};
    }

    function reportInlineArrayKey(node, propName) {
      context.report({
        node,
        messageId: "inlineKey",
        data: { prop: propName },
      });
    }

    function checkOptionsObjectForInlineKey(arg) {
      if (!arg || arg.type !== "ObjectExpression") return;
      for (const prop of arg.properties) {
        if (prop.type !== "Property") continue;
        const keyName =
          prop.key.type === "Identifier"
            ? prop.key.name
            : prop.key.type === "Literal"
              ? prop.key.value
              : null;
        if (
          (keyName === "queryKey" || keyName === "mutationKey") &&
          prop.value.type === "ArrayExpression"
        ) {
          reportInlineArrayKey(prop.value, keyName);
        }
      }
    }

    return {
      CallExpression(node) {
        const callee = node.callee;

        // useQuery / useMutation / useInfiniteQuery / etc.
        if (callee.type === "Identifier" && RQ_HOOKS.has(callee.name)) {
          checkOptionsObjectForInlineKey(node.arguments[0]);
          return;
        }

        // queryClient.invalidateQueries({ queryKey: [...] }) etc.
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier"
        ) {
          const methodName = callee.property.name;

          if (QC_OPTION_METHODS.has(methodName)) {
            checkOptionsObjectForInlineKey(node.arguments[0]);
            return;
          }

          // queryClient.getQueryData([...]) — first arg is the key directly
          if (QC_DIRECT_KEY_METHODS.has(methodName)) {
            const firstArg = node.arguments[0];
            if (firstArg && firstArg.type === "ArrayExpression") {
              reportInlineArrayKey(firstArg, "queryKey");
            }
            return;
          }
        }
      },
    };
  },
};

// ─── no-anthropic-key-in-logs ────────────────────────────────────────────
//
// Prevents accidental logging of Anthropic API keys (or any secret) via
// `console.*` or common logger methods (`logger.*`, `pino.*`, `log.*`).
//
// Detects:
//   - `process.env.ANTHROPIC_API_KEY` passed as a log argument.
//   - Identifiers matching secret-like names (`apiKey`, `anthropicKey`,
//     `secret`, etc.) when the file imports `@anthropic-ai/sdk`.
//   - Template literals that interpolate any of the above.
//
// Configurable via `additionalSecretIdentifiers: string[]` — extra
// regex patterns to match against identifier names.

const CONSOLE_METHODS = new Set(["log", "warn", "error", "info", "debug"]);
const LOGGER_METHODS = new Set([
  "log",
  "warn",
  "error",
  "info",
  "debug",
  "trace",
  "fatal",
]);
const LOGGER_OBJECTS = new Set(["logger", "pino", "log"]);

const DEFAULT_SECRET_PATTERNS = [
  /\bapi[_-]?key\b/i,
  /\banthropicKey\b/,
  /\bsecret\b/i,
  /\bANTHROPIC_API_KEY\b/,
];

const NO_ANTHROPIC_KEY_MESSAGE =
  "Do not log Anthropic API keys (or any secret). See AGENTS.md security rules.";

function isConsoleLogCall(callee) {
  if (callee.type !== "MemberExpression" || callee.computed) return false;
  if (
    callee.property.type !== "Identifier" ||
    !CONSOLE_METHODS.has(callee.property.name)
  ) {
    return false;
  }
  return (
    callee.object.type === "Identifier" && callee.object.name === "console"
  );
}

function isLoggerCall(callee) {
  if (callee.type !== "MemberExpression" || callee.computed) return false;
  if (callee.property.type !== "Identifier") return false;
  if (!LOGGER_METHODS.has(callee.property.name)) return false;
  return (
    callee.object.type === "Identifier" &&
    LOGGER_OBJECTS.has(callee.object.name)
  );
}

function isProcessEnvAnthropicKey(node) {
  // process.env.ANTHROPIC_API_KEY
  if (node.type !== "MemberExpression" || node.computed) return false;
  if (
    node.property.type !== "Identifier" ||
    node.property.name !== "ANTHROPIC_API_KEY"
  ) {
    return false;
  }
  const obj = node.object;
  if (obj.type !== "MemberExpression" || obj.computed) return false;
  if (obj.property.type !== "Identifier" || obj.property.name !== "env") {
    return false;
  }
  return obj.object.type === "Identifier" && obj.object.name === "process";
}

function matchesSecretPattern(name, patterns) {
  for (const pat of patterns) {
    if (pat.test(name)) return true;
  }
  return false;
}

function argumentContainsSecret(node, patterns, fileHasAnthropicImport) {
  if (!node) return false;

  // process.env.ANTHROPIC_API_KEY — always flag
  if (isProcessEnvAnthropicKey(node)) return true;

  // Identifier with a secret-like name
  if (node.type === "Identifier") {
    if (node.name === "ANTHROPIC_API_KEY") return true;
    if (fileHasAnthropicImport && matchesSecretPattern(node.name, patterns)) {
      return true;
    }
  }

  // MemberExpression — check the property name
  if (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier"
  ) {
    if (isProcessEnvAnthropicKey(node)) return true;
    if (
      fileHasAnthropicImport &&
      matchesSecretPattern(node.property.name, patterns)
    ) {
      return true;
    }
  }

  // Template literal — check expressions
  if (node.type === "TemplateLiteral") {
    for (const expr of node.expressions) {
      if (argumentContainsSecret(expr, patterns, fileHasAnthropicImport)) {
        return true;
      }
    }
  }

  // String concatenation (BinaryExpression with +)
  if (node.type === "BinaryExpression" && node.operator === "+") {
    return (
      argumentContainsSecret(node.left, patterns, fileHasAnthropicImport) ||
      argumentContainsSecret(node.right, patterns, fileHasAnthropicImport)
    );
  }

  return false;
}

const noAnthropicKeyInLogs = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid logging Anthropic API keys or secrets via console.* / logger.* / pino.* / log.*. See AGENTS.md security rules.",
    },
    schema: [
      {
        type: "object",
        properties: {
          additionalSecretIdentifiers: {
            type: "array",
            items: { type: "string" },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: { noLogSecret: NO_ANTHROPIC_KEY_MESSAGE },
  },
  create(context) {
    const options = context.options[0] || {};
    const extraPatterns = (options.additionalSecretIdentifiers || []).map(
      (s) => new RegExp(s),
    );
    const allPatterns = [...DEFAULT_SECRET_PATTERNS, ...extraPatterns];

    let fileHasAnthropicImport = false;

    return {
      ImportDeclaration(node) {
        if (
          node.source &&
          node.source.value &&
          typeof node.source.value === "string" &&
          node.source.value.includes("@anthropic-ai/sdk")
        ) {
          fileHasAnthropicImport = true;
        }
      },
      // Also detect require("@anthropic-ai/sdk")
      CallExpression(node) {
        // Check for require("@anthropic-ai/sdk")
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments.length > 0 &&
          node.arguments[0].type === "Literal" &&
          typeof node.arguments[0].value === "string" &&
          node.arguments[0].value.includes("@anthropic-ai/sdk")
        ) {
          fileHasAnthropicImport = true;
        }

        // Check log calls
        const callee = node.callee;
        if (!isConsoleLogCall(callee) && !isLoggerCall(callee)) return;

        for (const arg of node.arguments) {
          if (
            argumentContainsSecret(arg, allPatterns, fileHasAnthropicImport)
          ) {
            context.report({ node, messageId: "noLogSecret" });
            return;
          }
        }
      },
    };
  },
};

// ─── no-strict-bypass ───────────────────────────────────────────────────
//
// PR-6.E — forbid new type-safety bypasses in production code:
//   1. `// @ts-expect-error` comments
//   2. `// @ts-ignore` comments
//   3. `as any` casts (TSAsExpression → TSAnyKeyword)
//   4. `as unknown as X` double-casts (TSAsExpression wrapping another
//      TSAsExpression whose typeAnnotation is TSUnknownKeyword)
//
// Test files are exempt via eslint.config.js `ignores`.
// Existing violations are allowlisted (see docs/tech-debt/frontend.md).

const NO_STRICT_BYPASS_MESSAGES = {
  tsExpectError:
    "`@ts-expect-error` bypasses type checking — fix the type error or add a proper type assertion instead.",
  tsIgnore:
    "`@ts-ignore` silently suppresses type errors — fix the type error or use a narrower workaround.",
  asAny:
    "`as any` erases type safety — use a specific type or a type guard instead.",
  asUnknownAs:
    "`as unknown as X` double-cast bypasses the type system — refactor to avoid the unsafe cast.",
};

const DEFAULT_FORBID_PATTERNS = {
  tsExpectError: true,
  tsIgnore: true,
  asAny: true,
  asUnknownAs: true,
};

const noStrictBypass = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid `@ts-expect-error`, `@ts-ignore`, `as any`, and `as unknown as X` in production code (PR-6.E).",
    },
    schema: [
      {
        type: "object",
        properties: {
          forbidPatterns: {
            type: "object",
            properties: {
              tsExpectError: { type: "boolean" },
              tsIgnore: { type: "boolean" },
              asAny: { type: "boolean" },
              asUnknownAs: { type: "boolean" },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: NO_STRICT_BYPASS_MESSAGES,
  },
  create(context) {
    const options = context.options[0] || {};
    const forbid = { ...DEFAULT_FORBID_PATTERNS, ...options.forbidPatterns };

    const listeners = {};

    // ── Comment-based patterns ──────────────────────────────────────
    if (forbid.tsExpectError || forbid.tsIgnore) {
      listeners["Program:exit"] = function () {
        const sourceCode = context.sourceCode || context.getSourceCode();
        for (const comment of sourceCode.getAllComments()) {
          const text = comment.value.trim();
          if (forbid.tsExpectError && /^@ts-expect-error\b/.test(text)) {
            context.report({ node: comment, messageId: "tsExpectError" });
          }
          if (forbid.tsIgnore && /^@ts-ignore\b/.test(text)) {
            context.report({ node: comment, messageId: "tsIgnore" });
          }
        }
      };
    }

    // ── AST-based patterns (TS parser required) ─────────────────────
    if (forbid.asAny || forbid.asUnknownAs) {
      listeners["TSAsExpression"] = function (node) {
        // `as any`
        if (
          forbid.asAny &&
          node.typeAnnotation &&
          node.typeAnnotation.type === "TSAnyKeyword"
        ) {
          context.report({ node, messageId: "asAny" });
          return;
        }

        // `as unknown as X` — outer TSAsExpression whose inner expression
        // is another TSAsExpression with TSUnknownKeyword.
        if (
          forbid.asUnknownAs &&
          node.expression &&
          node.expression.type === "TSAsExpression" &&
          node.expression.typeAnnotation &&
          node.expression.typeAnnotation.type === "TSUnknownKeyword"
        ) {
          context.report({ node, messageId: "asUnknownAs" });
        }
      };
    }

    return listeners;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// `no-hex-in-classname` — forbid arbitrary hex colors in Tailwind className
// ─────────────────────────────────────────────────────────────────────────
//
// Tailwind's arbitrary-value syntax (`bg-[#10b981]`, `text-[#fff]/50`,
// `border-[#123]`) bypasses the design-system tokens entirely. A raw hex
// in a className means: (a) dark-mode won't adapt, (b) the value doesn't
// re-theme when the palette evolves, (c) it can't be grep'd from a single
// place when we need to migrate. The Sergeant rule is simple: every color
// in a className comes from the token scale (`bg-surface`, `text-muted`,
// `border-border`, `bg-finyk-surface`, `text-brand-strong`, `bg-success-soft`,
// …). If a colour is truly one-off (chart series, illustration fill), put
// it in the token layer (CSS var + preset alias) — not inline.
//
// The rule only flags hex inside the arbitrary-value brackets of
// Tailwind's color-aware utilities (`bg-`, `text-`, `border-`, `ring-`,
// `fill-`, `stroke-`, `from-`, `to-`, `via-`, `shadow-`, `outline-`,
// `divide-`, `placeholder-`, `caret-`, `decoration-`, `accent-`). Plain
// hex literals outside className context (e.g. chart config passing a
// hex to recharts) are NOT this rule's concern — those are a code review
// issue for `shared/charts/chartPalette.ts`.

const HEX_IN_CLASSNAME_MESSAGE =
  "Raw hex `{{utility}}-[#{{hex}}]` bypasses the design-system tokens — use a semantic utility (e.g. `bg-surface`, `text-fg`, `bg-finyk-surface`, `text-brand-strong`, `bg-success-soft`) or extend the palette in `packages/design-tokens/tailwind-preset.js` if a new token is genuinely needed.";

// Match `[variants:]<utility>-[#HEX]` with optional `/OPACITY` suffix.
//   • utility ∈ TAILWIND_OPACITY_UTILITIES (the color-aware set reused from
//     valid-tailwind-opacity so we keep one list).
//   • `<HEX>` is 3, 4, 6, or 8 hex digits.
//   • `\b` anchor lets variant prefixes (`dark:`, `hover:`, `lg:`) sit in
//     front of the utility without tripping the regex.
const RX_HEX_IN_CLASSNAME = new RegExp(
  String.raw`\b(` +
    TAILWIND_OPACITY_UTILITIES.join("|") +
    String.raw`)-\[#([0-9a-fA-F]{3,8})\]`,
  "g",
);

function findHexInClassName(value) {
  if (typeof value !== "string" || value.length === 0) return [];
  if (!value.includes("[#")) return [];
  const hits = [];
  let match;
  RX_HEX_IN_CLASSNAME.lastIndex = 0;
  while ((match = RX_HEX_IN_CLASSNAME.exec(value)) !== null) {
    const [, utility, hex] = match;
    // Validate hex length so `bg-[#12]` or `bg-[#1234567]` don't trigger.
    if (![3, 4, 6, 8].includes(hex.length)) continue;
    hits.push({ utility, hex });
  }
  return hits;
}

const noHexInClassname = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid arbitrary `<utility>-[#hex]` colors in className — every color must come from the design-system token layer.",
    },
    schema: [],
    messages: { hex: HEX_IN_CLASSNAME_MESSAGE },
  },
  create(context) {
    function report(node, value) {
      const hits = findHexInClassName(value);
      for (const hit of hits) {
        context.report({
          node,
          messageId: "hex",
          data: { utility: hit.utility, hex: hit.hex },
        });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") report(node, node.value);
      },
      TemplateElement(node) {
        const cooked = node.value && node.value.cooked;
        if (typeof cooked === "string") report(node, cooked);
      },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// `no-foreign-module-accent` — keep module colors within their module
// ─────────────────────────────────────────────────────────────────────────
//
// Sergeant has 4 module brand colors: `finyk` (emerald), `fizruk` (teal),
// `routine` (coral), `nutrition` (lime). They're tuned close in saturation,
// so accidental cross-module use reads as a design bug — a fizruk button
// rendering coral `ring-routine` says "Рутина" to the user. The rule:
//
//   Files under `apps/web/src/modules/<X>/**` may only use `<X>`'s accent
//   utilities. Cross-module shells (`core/**`, `shared/**`, `stories/**`)
//   are free to use all four, because that's their job.
//
// Accent utilities matched: `(bg|text|border|ring|from|to|via|fill|stroke|
// shadow|outline|divide|placeholder|caret|decoration|accent)-<module>`
// with optional `-<shade>` suffix (e.g. `-strong`, `-soft`, `-500`,
// `-surface`) and optional `/<opacity>` suffix. Variant prefixes
// (`dark:`, `hover:`, `lg:`) are allowed in front.

const MODULE_ACCENTS = ["finyk", "fizruk", "routine", "nutrition"];

const FOREIGN_MODULE_ACCENT_MESSAGE =
  "`{{match}}` is a `{{foreign}}` accent inside a `{{home}}` module — modules must only use their own accent. Use `{{home}}` equivalents or move this to a cross-module surface (`core/**`, `shared/**`).";

// Match `[variants:]<utility>-<module>[-<shade>][/<opacity>]`.
const RX_MODULE_ACCENT = new RegExp(
  String.raw`\b(` +
    TAILWIND_OPACITY_UTILITIES.join("|") +
    String.raw`)-(` +
    MODULE_ACCENTS.join("|") +
    String.raw`)(-[a-z0-9]+(?:-[a-z0-9]+)?)?(\/\d{1,3})?\b`,
  "g",
);

// Derive the "home" module from an absolute or repo-relative file path.
// Accepts web and mobile source trees; returns null for non-module paths
// and for `modules/shared/` (a cross-module utility folder that hosts
// primitives rendering any of the four accents — e.g.
// `apps/mobile/src/modules/shared/ModuleErrorBoundary.tsx`).
function homeModuleFromFilename(filename) {
  if (typeof filename !== "string") return null;
  // Normalize path separators for Windows; tests feed a unix-style mock.
  const norm = filename.replace(/\\/g, "/");
  const m = norm.match(
    /\/(?:apps\/(?:web|mobile)\/src|apps\/mobile\/app)\/modules\/([a-z]+)\//,
  );
  if (!m) return null;
  const home = m[1];
  // Only the four canonical modules own their accent palette — any
  // other folder under `modules/` is a cross-module utility and must
  // stay free to render every accent.
  return MODULE_ACCENTS.includes(home) ? home : null;
}

function findForeignModuleAccents(value, home) {
  if (typeof value !== "string" || value.length === 0) return [];
  if (!home) return [];
  // Cheap prefilter so we don't regex every unrelated literal.
  let maybe = false;
  for (const m of MODULE_ACCENTS) {
    if (m !== home && value.includes(`-${m}`)) {
      maybe = true;
      break;
    }
  }
  if (!maybe) return [];
  const hits = [];
  let match;
  RX_MODULE_ACCENT.lastIndex = 0;
  while ((match = RX_MODULE_ACCENT.exec(value)) !== null) {
    const [full, , mod] = match;
    if (mod !== home) hits.push({ match: full, foreign: mod });
  }
  return hits;
}

const noForeignModuleAccent = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid cross-module accent utilities inside `apps/*/src/modules/<X>/**` — a fizruk component must not render `ring-routine` etc.",
    },
    schema: [],
    messages: { foreign: FOREIGN_MODULE_ACCENT_MESSAGE },
  },
  create(context) {
    const filename =
      (context.filename != null ? context.filename : context.getFilename()) ||
      "";
    const home = homeModuleFromFilename(filename);
    if (!home) return {};
    // Cross-module accent rule doesn't apply to the module-accent system
    // itself (the map literals that declare every accent) or to module-
    // scoped tests (they naturally reference all four for coverage).
    if (/\.(test|spec)\.[jt]sx?$/.test(filename)) return {};

    function report(node, value) {
      const hits = findForeignModuleAccents(value, home);
      for (const hit of hits) {
        context.report({
          node,
          messageId: "foreign",
          data: { match: hit.match, foreign: hit.foreign, home },
        });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") report(node, node.value);
      },
      TemplateElement(node) {
        const cooked = node.value && node.value.cooked;
        if (typeof cooked === "string") report(node, cooked);
      },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// `no-raw-dark-palette` — forbid the raw-palette light/dark anti-pattern
// ─────────────────────────────────────────────────────────────────────────
//
// The dark-mode audit (`docs/design/dark-mode-audit.md`) catalogues a
// recurring shape: a className that encodes both themes by hand by
// pairing a raw Tailwind palette utility on the light side with a
// `dark:` raw-palette override —
//
//   bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300
//   bg-coral-100 dark:bg-coral-900/30
//   border-teal-200/50 ... dark:border-teal-800/30
//
// Both halves of the pair encode palette knowledge at the call-site, so
// the next palette migration (or the next `theme.opacity` step renaming
// — bug #814) silently drops one half and the surrounding override
// falls through to the wrong colour. The fix is always the same: lift
// the (light, dark) pair into the design-system token layer
// (`bg-success-soft`, `bg-finyk-surface`, `border-routine-soft-border`,
// …) so the preset owns the swap and the call-site has zero `dark:`
// overrides.
//
// The rule fires on a className **only** when *both* halves of the
// pair are present:
//
//   • a bare `<utility>-<PALETTE>-<SHADE>` (or `…/<opacity>`), AND
//   • a `dark:<utility>-<PALETTE>-<SHADE>` (or `…/<opacity>`),
//
// where `<utility>` ∈ { bg, text, border } and `<PALETTE>` is one of
// the 24 raw Tailwind palette names (24 = 22 default Tailwind families
// + Sergeant's `brand` and `coral` aliases — both are theme-inert raw
// palettes despite the brand-y names; the per-theme aware utilities
// are `bg-brand-soft`, `bg-routine-surface`, etc.). `<SHADE>` is a
// numeric step (`50`, `100`, …, `950`), so semantic suffixes
// (`brand-soft`, `brand-strong`, `coral-soft-border`) do NOT match.
//
// Patterns that intentionally STAY (do NOT fire):
//
//   • `dark:bg-white/10`, `dark:border-white/15`, `dark:bg-black/40` —
//     bare colour washes (no palette name), per
//     `docs/design/design-system.md` § 2.1.
//   • `dark:bg-surface`, `dark:text-fg`, `dark:border-border` —
//     semantic tokens that simply happen to carry a `dark:` prefix
//     because a stacked surface needs an explicit override.
//   • Dark-side-only "patches" where the *light* half is already a
//     semantic token (e.g. `Banner.tsx` line 22:
//     `bg-success-soft text-success-strong dark:text-emerald-100` —
//     light is the semantic `text-success-strong`, dark patches a
//     lighter shade because the `-strong` companion does not adapt
//     well on dark panels). These are documented gaps in the
//     `-strong` companion scale, not raw-palette pairs.
//
// Promotion path: this rule ships at `error` level once the audit's
// inventory hits zero (Wave 2c of `docs/design/dark-mode-audit.md`).
// Any future violation must be intentional — either extend the token
// layer in `packages/design-tokens/tailwind-preset.js` or, in the rare
// case where an inline raw-palette override is justified (e.g. a
// chart-series fallback), add an `// eslint-disable-next-line
// sergeant-design/no-raw-dark-palette` with a comment explaining why
// the token layer cannot own the pair.

const RAW_DARK_PALETTE_FAMILIES = [
  "gray",
  "slate",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  // Sergeant aliases that map to raw Tailwind palettes (not theme-aware).
  "brand",
  "coral",
];

const RAW_DARK_PALETTE_UTILITIES = ["bg", "text", "border"];

const RAW_DARK_PALETTE_MESSAGE =
  "Raw-palette light/dark pair (`{{light}}` + `{{dark}}`) — the call-site encodes both themes by hand. Use a single semantic utility (e.g. `bg-{family}-soft`, `bg-{module}-surface`, `border-{module}-soft-border`, `text-{status}-strong`) so the preset owns the light/dark swap. See `docs/design/dark-mode-audit.md` for the migration recipe.";

// Match `<utility>-<palette>-<step>[/<opacity>]` where step is numeric
// (so `brand-soft`, `brand-strong`, `coral-soft-border` do NOT match).
const RX_LIGHT_RAW_PALETTE = new RegExp(
  String.raw`(?<![\w:-])(` +
    RAW_DARK_PALETTE_UTILITIES.join("|") +
    String.raw`)-(` +
    RAW_DARK_PALETTE_FAMILIES.join("|") +
    String.raw`)-(\d{2,3})(\/\d{1,3})?\b`,
  "g",
);

// Match `dark:<utility>-<palette>-<step>[/<opacity>]`. The negative
// lookbehind `(?<![\w:-])` excludes any token where `dark:` itself is
// preceded by another variant (`lg:dark:bg-amber-500/15`,
// `hover:dark:text-coral-300`, …) — those tokens carry an extra
// breakpoint / state condition that the rule's pair-only contract does
// not model, and treating them as bare `dark:` matches produced
// false-positive pair reports against unrelated bare light utilities
// elsewhere in the same className. The light-side regex already uses
// the same lookbehind, so the pair logic stays symmetric: only
// genuinely bare `<utility>-<palette>-<step>` and bare
// `dark:<utility>-<palette>-<step>` tokens contribute to a match.
const RX_DARK_RAW_PALETTE = new RegExp(
  String.raw`(?<![\w:-])dark:(` +
    RAW_DARK_PALETTE_UTILITIES.join("|") +
    String.raw`)-(` +
    RAW_DARK_PALETTE_FAMILIES.join("|") +
    String.raw`)-(\d{2,3})(\/\d{1,3})?\b`,
  "g",
);

function findRawDarkPalettePairs(value) {
  if (typeof value !== "string" || value.length === 0) return [];
  // Cheap prefilter: must contain both `dark:` and a palette family
  // name. Without this every literal in the codebase pays a regex tax.
  if (!value.includes("dark:")) return [];
  let hasFamily = false;
  for (const f of RAW_DARK_PALETTE_FAMILIES) {
    if (value.includes(`-${f}-`)) {
      hasFamily = true;
      break;
    }
  }
  if (!hasFamily) return [];

  const lightHits = [];
  let m;
  RX_LIGHT_RAW_PALETTE.lastIndex = 0;
  while ((m = RX_LIGHT_RAW_PALETTE.exec(value)) !== null) {
    // Skip `dark:`-prefixed matches — the lookbehind catches `:`,
    // but a regex engine without lookbehind support would still need
    // this guard. Confirm the char before the match isn't `:`.
    const start = m.index;
    if (start > 0 && value[start - 1] === ":") continue;
    lightHits.push(m[0]);
  }
  if (lightHits.length === 0) return [];

  const darkHits = [];
  RX_DARK_RAW_PALETTE.lastIndex = 0;
  while ((m = RX_DARK_RAW_PALETTE.exec(value)) !== null) {
    darkHits.push(m[0]);
  }
  if (darkHits.length === 0) return [];

  // One report per className value — pair the first light hit with
  // the first dark hit so the message stays focused. Reporting every
  // (light, dark) pair would spam call-sites that already migrate as
  // a single edit.
  return [{ light: lightHits[0], dark: darkHits[0] }];
}

const noRawDarkPalette = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid raw-palette light/dark pairs in className — both halves of the (light, dark) swap must come from the design-system token layer.",
    },
    schema: [],
    messages: { pair: RAW_DARK_PALETTE_MESSAGE },
  },
  create(context) {
    function report(node, value) {
      const hits = findRawDarkPalettePairs(value);
      for (const hit of hits) {
        context.report({
          node,
          messageId: "pair",
          data: { light: hit.light, dark: hit.dark },
        });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") report(node, node.value);
      },
      TemplateElement(node) {
        const cooked = node.value && node.value.cooked;
        if (typeof cooked === "string") report(node, cooked);
      },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// `prefer-focus-visible` — ban `focus:` color utilities, require
//                          `focus-visible:` for visible focus rings
// ─────────────────────────────────────────────────────────────────────────
//
// Sergeant's design-system contract (see `docs/design/design-system.md`):
//
//   | Стан             | Поведінка                                                    |
//   | :focus-visible   | ring-2 ring-brand-500/45 ring-offset-2 ring-offset-surface   |
//
//   "Focus — focus-visible:ring-brand-500/30, а не focus:, аби pointer-клік
//    не блимав кільцем."
//
// `focus:` fires for any focus state, including pointer click — which
// produces a flashing ring on every mouse interaction. `focus-visible:`
// only fires when the user is navigating with the keyboard (or assistive
// tech) and is the correct primitive for a visible focus indicator.
//
// The single legitimate `focus:` utility is `focus:outline-none`: it
// resets the user-agent outline so the design-system ring (rendered via
// `focus-visible:ring-*`) takes over. The rule therefore allows
// `focus:outline-none` and bans every `focus:` color/border/ring/shadow
// utility — those must be `focus-visible:` instead.
//
// Scope: `apps/web/**/*.{ts,tsx,js,jsx}`. Mobile (NativeWind) doesn't
// have a `:focus-visible` pseudo-class equivalent; React Native uses
// `onFocus` handlers and the ring concept is web-only. Registering the
// rule on mobile would force authors to use a primitive that doesn't
// exist in their target runtime.

const FOCUS_COLOR_UTILITIES = [
  "bg",
  "text",
  "border",
  "ring",
  "ring-offset",
  "shadow",
  "fill",
  "stroke",
  "divide",
  "placeholder",
  "caret",
  "decoration",
  "accent",
  "outline-offset",
];

const PREFER_FOCUS_VISIBLE_MESSAGE =
  "`{{match}}` uses the `focus:` variant — pointer clicks blink the colour. Replace with `focus-visible:{{tail}}` so only keyboard/assistive-tech focus shows the indicator. The single legitimate `focus:` utility is `focus:outline-none` (resets the user-agent outline so the design-system ring takes over).";

// Match a bare `focus:<utility>-...` token. We intentionally exclude
// `focus:outline-none` (the canonical reset that pairs with
// `focus-visible:ring-*`) and any token where `focus:` itself is
// preceded by another variant — `lg:focus:bg-…`, `hover:focus:…`,
// `dark:focus:…`, `group-focus:…`, `peer-focus:…`. The lookbehind
// `(?<![\w:-])` keeps the contract tight.
//
// `<utility>-<rest>` covers the colour/visual utilities listed in
// `FOCUS_COLOR_UTILITIES`. `<rest>` is `[\w/.\-[\]#%]+` so we capture
// arbitrary values (`bg-[#fff]`), opacity suffixes (`/45`), and dotted
// shades (`text-brand-strong`). `outline-` itself isn't in the list
// because the only legit `focus:outline-*` is `focus:outline-none`,
// which is excluded by the explicit guard below; everything else
// (`focus:outline-2`, `focus:outline-brand-500`, …) falls through to
// the regex via `outline-offset` (intentionally) plus a separate
// `outline-` arm below.
const RX_PREFER_FOCUS_VISIBLE = new RegExp(
  String.raw`(?<![\w:-])focus:(` +
    FOCUS_COLOR_UTILITIES.join("|") +
    String.raw`)-([\w/.\-#%[\]]+)`,
  "g",
);

// Separate arm for `focus:outline-*` so we can exempt
// `focus:outline-none` (and the inert `focus:outline-hidden`,
// `focus:outline-transparent`) without uglifying the colour-utility
// regex above.
const RX_PREFER_FOCUS_VISIBLE_OUTLINE = new RegExp(
  String.raw`(?<![\w:-])focus:outline-([\w/.\-#%[\]]+)`,
  "g",
);

const FOCUS_OUTLINE_ALLOWED_TAILS = new Set(["none", "hidden", "transparent"]);

// `text-` is overloaded in Tailwind: `text-{color}` is a colour
// (`text-brand-strong`, `text-danger`), but `text-{size|alignment|
// transform|opacity}` are unrelated dimensions (`text-sm`, `text-base`,
// `text-center`, `text-left`, `text-uppercase`, …). The rule's intent
// is to ban *colour* blinks on pointer focus, so we explicitly exempt
// the non-colour `text-` tails that Sergeant uses (size scale + the
// `text-mini` / `text-dialog` tokens added in Wave 2d, plus alignment
// + transform). A `focus:text-sm` on a skip-link that grows on focus
// is intentional UX, not a regression.
const FOCUS_TEXT_NON_COLOR_TAILS = new Set([
  // Tailwind default size scale
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "8xl",
  "9xl",
  // Sergeant custom size tokens (Wave 2d)
  "mini",
  "dialog",
  // Alignment / wrap / overflow / transform
  "left",
  "right",
  "center",
  "justify",
  "start",
  "end",
  "wrap",
  "nowrap",
  "balance",
  "pretty",
  "ellipsis",
  "clip",
  "uppercase",
  "lowercase",
  "capitalize",
  "normal-case",
]);

function findPreferFocusVisibleHits(value) {
  if (typeof value !== "string" || value.length === 0) return [];
  if (!value.includes("focus:")) return [];
  const hits = [];
  let m;
  RX_PREFER_FOCUS_VISIBLE.lastIndex = 0;
  while ((m = RX_PREFER_FOCUS_VISIBLE.exec(value)) !== null) {
    const [full, util, rest] = m;
    if (util === "text" && FOCUS_TEXT_NON_COLOR_TAILS.has(rest)) continue;
    hits.push({ match: full, tail: `${util}-${rest}` });
  }
  RX_PREFER_FOCUS_VISIBLE_OUTLINE.lastIndex = 0;
  while ((m = RX_PREFER_FOCUS_VISIBLE_OUTLINE.exec(value)) !== null) {
    const [full, tail] = m;
    if (FOCUS_OUTLINE_ALLOWED_TAILS.has(tail)) continue;
    // The colour-utility arm above already covers `focus:outline-offset-N`
    // (because `outline-offset` is in `FOCUS_COLOR_UTILITIES`); the outline
    // arm's broader regex also matches the same token. Dedup by `match`
    // so each token produces a single report.
    if (hits.some((h) => h.match === full)) continue;
    hits.push({ match: full, tail: `outline-${tail}` });
  }
  return hits;
}

const preferFocusVisible = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid `focus:` color/ring/shadow utilities — visible focus indicators must use `focus-visible:` so pointer clicks don't blink the ring.",
    },
    schema: [],
    messages: { focus: PREFER_FOCUS_VISIBLE_MESSAGE },
  },
  create(context) {
    function report(node, value) {
      const hits = findPreferFocusVisibleHits(value);
      for (const hit of hits) {
        context.report({
          node,
          messageId: "focus",
          data: { match: hit.match, tail: hit.tail },
        });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") report(node, node.value);
      },
      TemplateElement(node) {
        const cooked = node.value && node.value.cooked;
        if (typeof cooked === "string") report(node, cooked);
      },
    };
  },
};

// ─── no-finyk-token-in-storage ─────────────────────────────────────────
//
// Monobank PAT must live exclusively in the server-side
// `mono_connection.token_ciphertext` (AES-GCM, see
// `apps/server/src/modules/mono/`). Persisting it on the client —
// `localStorage`, `sessionStorage`, MMKV, IDB, cloud-sync `module_data`,
// etc. — is a security regression: cleartext PAT can be exfiltrated by
// any XSS, leaks into devtools, and survives logout.
//
// The migration hook `useMonoTokenMigration` reads the legacy
// `finyk_token` / `finyk_token_remembered` keys once on cold-boot, POSTs
// the value to `/api/mono/connect`, and removes the local copy. After
// this rule lands, no new code path is allowed to write the token back
// — only reads (for one-shot migration) and removals are permitted.
//
// Detected forms:
//   - `localStorage.setItem("finyk_token", …)`
//   - `localStorage.setItem(STORAGE_KEYS.FINYK_TOKEN, …)`
//   - `sessionStorage.setItem(...)` with the same keys
//   - `safeWriteLS(...)` / `safeWriteJSONLS(...)` / generic `setItem(...)`
//     calls with the same keys
//   - `useLocalStorage(...)` / `useSyncedStorage(...)` /
//     `createModuleStorage(...)` initialised with the same key
//
// Test files (`*.test.ts(x)`, `*.spec.ts(x)`, paths under `__tests__/`)
// are exempt — fixtures often need to seed `localStorage` with a legacy
// token to verify the migration path.

const FINYK_TOKEN_KEY_VALUES = new Set([
  "finyk_token",
  "finyk_token_remembered",
]);
const FINYK_TOKEN_KEY_NAMES = new Set(["FINYK_TOKEN"]);

const FINYK_TOKEN_WRITE_FUNCTIONS = new Set([
  "setItem",
  "safeWriteLS",
  "safeWriteJSONLS",
  "useLocalStorage",
  "useSyncedStorage",
  "useLocalStorageState",
  "useSyncedStorageState",
  "createModuleStorage",
  "lsSet",
  "writeLS",
]);

const FINYK_TOKEN_MESSAGE =
  "Monobank PAT (`finyk_token`) must not be persisted client-side. The token lives in `mono_connection.token_ciphertext` server-side; legacy LS/sessionStorage values are migrated by `useMonoTokenMigration` and then removed. Only reads (for migration) and removals are allowed.";

function isFinykTokenKeyArgument(arg) {
  if (!arg) return false;
  if (arg.type === "Literal" && typeof arg.value === "string") {
    return FINYK_TOKEN_KEY_VALUES.has(arg.value);
  }
  if (
    arg.type === "TemplateLiteral" &&
    arg.expressions.length === 0 &&
    arg.quasis.length === 1
  ) {
    const cooked = arg.quasis[0].value && arg.quasis[0].value.cooked;
    if (typeof cooked === "string") {
      return FINYK_TOKEN_KEY_VALUES.has(cooked);
    }
  }
  if (
    arg.type === "MemberExpression" &&
    !arg.computed &&
    arg.object.type === "Identifier" &&
    arg.object.name === "STORAGE_KEYS" &&
    arg.property.type === "Identifier"
  ) {
    return FINYK_TOKEN_KEY_NAMES.has(arg.property.name);
  }
  if (
    arg.type === "MemberExpression" &&
    arg.computed &&
    arg.object.type === "Identifier" &&
    arg.object.name === "STORAGE_KEYS" &&
    arg.property.type === "Literal" &&
    typeof arg.property.value === "string"
  ) {
    return FINYK_TOKEN_KEY_NAMES.has(arg.property.value);
  }
  return false;
}

function getCalleeName(callee) {
  if (!callee) return null;
  if (callee.type === "Identifier") return callee.name;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return null;
}

const noFinykTokenInStorage = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid persisting the Monobank PAT (`finyk_token`) on the client. The token must live only in `mono_connection.token_ciphertext` server-side.",
    },
    schema: [],
    messages: { write: FINYK_TOKEN_MESSAGE },
  },
  create(context) {
    return {
      CallExpression(node) {
        const calleeName = getCalleeName(node.callee);
        if (!calleeName) return;
        if (!FINYK_TOKEN_WRITE_FUNCTIONS.has(calleeName)) return;
        if (!node.arguments || node.arguments.length === 0) return;
        if (isFinykTokenKeyArgument(node.arguments[0])) {
          context.report({ node, messageId: "write" });
        }
      },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// `no-rounded-lg` — prevent border-radius drift back to the 8 px tier
// ─────────────────────────────────────────────────────────────────────────
//
// Sergeant uses a size-driven radius scale (docs/design/radius-rhythm.md):
//   Swatch   rounded-sm  (2 px)   — heatmap cells, chart legend dots
//   Marker   rounded-md  (6 px)   — chips, badges, checkboxes ≤6 px
//   Control  rounded-xl  (12 px)  — buttons xs/sm, icon-buttons ≤40 px
//   Card     rounded-2xl (16 px)  — cards, buttons md/lg, icon-buttons ≥44 px
//   Hero     rounded-3xl (24 px)  — hero cards, modals, bottom sheets
//   Pill     rounded-full (∞)     — FABs, avatars, status dots
//
// `rounded-lg` (8 px) sits between Marker and Control without a clear
// semantic role. It was present in 53 locations before the audit; those
// were cleaned up. This rule prevents re-introduction.
//
// Exempt paths:
//   - `packages/design-tokens/**` (token definitions use raw px values)
//   - `apps/web/src/index.css` (legacy progress-bar utilities, tracked)
//   - `*.test.{ts,tsx,mjs}` (test fixtures may reference legacy class names)

const NO_ROUNDED_LG_MESSAGE =
  "Avoid `rounded-lg` (8 px) — it sits between Marker and Control without a semantic role. " +
  "Use `rounded-md` (6 px, Marker tier) for chips / badges / inline pills, or " +
  "`rounded-xl` (12 px, Control tier) for buttons ≤40 px and icon-buttons. " +
  "See docs/design/radius-rhythm.md for the full scale.";

const RX_ROUNDED_LG = /(?:^|\s)(?:[\w-]+:)*rounded-lg(?:\s|$)/;

function classNameHasRoundedLg(value) {
  if (typeof value !== "string") return false;
  return RX_ROUNDED_LG.test(value);
}

const noRoundedLg = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Forbid `rounded-lg` (8 px) in className strings — use `rounded-md` (Marker) or `rounded-xl` (Control sm) from the semantic radius scale.",
    },
    schema: [],
    messages: { rounded: NO_ROUNDED_LG_MESSAGE },
  },
  create(context) {
    const filename =
      (context.filename != null ? context.filename : context.getFilename()) ||
      "";
    // Exempt token definitions, legacy CSS, and test files.
    if (
      /packages[\\/]design-tokens[\\/]/.test(filename) ||
      /src[\\/]index\.css$/.test(filename) ||
      /\.(test|spec)\.[jt]sx?$/.test(filename) ||
      /__tests__[\\/]/.test(filename)
    ) {
      return {};
    }

    function report(node, value) {
      if (classNameHasRoundedLg(value)) {
        context.report({ node, messageId: "rounded" });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") report(node, node.value);
      },
      TemplateElement(node) {
        const cooked = node.value && node.value.cooked;
        if (typeof cooked === "string") report(node, cooked);
      },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// `no-bare-empty-text` — enforce empty-state tier discipline
// ─────────────────────────────────────────────────────────────────────────
//
// docs/design/empty-states.md defines three tiers:
//   Tier 1 — Full-screen: <ModuleEmptyState> or <EmptyState> (no compact)
//   Tier 2 — Compact card: <EmptyState compact>
//   Tier 3 — Inline text: one muted line (text-xs text-muted)
//
// The anti-pattern this rule targets: bare JSX text or <p>/<span> tags
// with Ukrainian "Поки" / "поки" / "немає" / "ще немає" patterns that
// signal an empty-state message but are rendered outside any EmptyState
// component. These ad-hoc messages bypass the tier system and produce
// visually inconsistent empty views.
//
// The rule fires on JSXText or string literals inside JSX that contain
// the signal phrases AND whose parent is NOT an EmptyState/ModuleEmptyState
// element (checked via JSX ancestor scanning).

const NO_BARE_EMPTY_TEXT_MESSAGE =
  "Use the <EmptyState> component (or <ModuleEmptyState>) instead of bare text for empty states. " +
  "Choose the right tier: full-screen → no `compact`, card-internal → `compact`, " +
  "mini stat (< 120 px tall) → `text-xs text-muted` is OK. " +
  "See docs/design/empty-states.md for tier guidance.";

// Phrases that signal an empty-state message in Ukrainian product copy.
const RX_EMPTY_SIGNAL =
  /(?:Поки|поки)\s+(?:що\s+)?(?:немає|порожньо|нічого|пусто)|ще\s+немає|не\s+має\s+даних/;

function isInsideEmptyStateComponent(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === "JSXElement" &&
      current.openingElement &&
      current.openingElement.name
    ) {
      const name =
        current.openingElement.name.name ||
        (current.openingElement.name.property &&
          current.openingElement.name.property.name) ||
        "";
      if (name === "EmptyState" || name === "ModuleEmptyState") return true;
    }
    current = current.parent;
  }
  return false;
}

const noBareEmptyText = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Forbid bare JSX text / <p> / <span> empty-state messages outside <EmptyState> or <ModuleEmptyState>.",
    },
    schema: [],
    messages: { bare: NO_BARE_EMPTY_TEXT_MESSAGE },
  },
  create(context) {
    return {
      JSXText(node) {
        const text = typeof node.value === "string" ? node.value.trim() : "";
        if (!text || !RX_EMPTY_SIGNAL.test(text)) return;
        if (isInsideEmptyStateComponent(node)) return;
        context.report({ node, messageId: "bare" });
      },
      Literal(node) {
        // Catch string literals passed as children in JSX expressions like
        // {condition && "Поки що порожньо"}
        if (typeof node.value !== "string") return;
        if (!RX_EMPTY_SIGNAL.test(node.value)) return;
        // Only fire when the literal is used as JSX child content.
        if (!node.parent || node.parent.type !== "JSXExpressionContainer")
          return;
        if (isInsideEmptyStateComponent(node)) return;
        context.report({ node, messageId: "bare" });
      },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// `prefer-text-style` — semantic typography over hand-rolled combos
// ─────────────────────────────────────────────────────────────────────────
//
// Sergeant has `.text-style-*` semantic utilities defined in index.css
// (hero, title, body, label, caption, overline). These encode the full
// pairing (size + weight + tracking) so a future design-system change
// only touches the CSS, not hundreds of call-sites.
//
// The rule flags className strings that contain a (text-{size}, font-{weight})
// pair matching a known text-style slot, AND do NOT already contain a
// `text-style-` utility. It suggests the semantic alternative.
//
// Exempt: design-system primitives that intentionally define the raw scale
// (SectionHeading, Button, Label, Badge, etc.) — these are excluded by
// allowing `// eslint-disable-next-line sergeant-design/prefer-text-style`.

const PREFER_TEXT_STYLE_MESSAGE =
  "Hand-rolled `{{combo}}` can be replaced with the semantic `text-style-{{slot}}` utility. " +
  "The semantic utility owns size + weight + tracking as a unit so design-token changes " +
  "propagate automatically. See docs/design/design-system.md § Typography.";

// Ordered from most-specific to least-specific so the first match wins.
const TEXT_STYLE_MAPPINGS = [
  // hero: large display heading
  {
    slot: "hero",
    sizes: new Set(["text-2xl", "text-3xl"]),
    weights: new Set(["font-bold", "font-extrabold"]),
  },
  // title: section/card heading
  {
    slot: "title",
    sizes: new Set(["text-xl", "text-lg"]),
    weights: new Set(["font-semibold", "font-bold"]),
  },
  // label: data labels, small headings
  {
    slot: "label",
    sizes: new Set(["text-sm"]),
    weights: new Set(["font-medium", "font-semibold"]),
  },
  // caption: supporting text
  {
    slot: "caption",
    sizes: new Set(["text-xs"]),
    weights: new Set(["font-normal", "font-medium"]),
  },
];

const RX_TEXT_SIZE =
  /(?:^|\s)(text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl))(?:\s|$)/;
const RX_FONT_WEIGHT =
  /(?:^|\s)(font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black))(?:\s|$)/;
const RX_TEXT_STYLE = /(?:^|\s)text-style-[\w-]+/;

function findTextStyleSlot(value) {
  if (typeof value !== "string") return null;
  if (RX_TEXT_STYLE.test(value)) return null; // already using semantic utility

  const sizeMatch = RX_TEXT_SIZE.exec(value);
  const weightMatch = RX_FONT_WEIGHT.exec(value);
  if (!sizeMatch || !weightMatch) return null;

  const size = sizeMatch[1];
  const weight = weightMatch[1];

  for (const mapping of TEXT_STYLE_MAPPINGS) {
    if (mapping.sizes.has(size) && mapping.weights.has(weight)) {
      return { slot: mapping.slot, combo: `${size} ${weight}` };
    }
  }
  return null;
}

const preferTextStyle = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer `text-style-*` semantic utilities over hand-rolled size+weight combinations.",
    },
    schema: [],
    messages: { prefer: PREFER_TEXT_STYLE_MESSAGE },
  },
  create(context) {
    const filename =
      (context.filename != null ? context.filename : context.getFilename()) ||
      "";
    // Exempt design-system primitive source files and test files.
    if (
      /shared[\\/]components[\\/]ui[\\/](?:Button|SectionHeading|Label|Badge|Stat|Card|Input|Tabs|Segmented)\.tsx?$/.test(
        filename,
      ) ||
      /\.(test|spec)\.[jt]sx?$/.test(filename) ||
      /__tests__[\\/]/.test(filename)
    ) {
      return {};
    }

    function report(node, value) {
      const hit = findTextStyleSlot(value);
      if (hit) {
        context.report({
          node,
          messageId: "prefer",
          data: { combo: hit.combo, slot: hit.slot },
        });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") report(node, node.value);
      },
      TemplateElement(node) {
        const cooked = node.value && node.value.cooked;
        if (typeof cooked === "string") report(node, cooked);
      },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// `no-arbitrary-text-size` — ban Tailwind arbitrary `text-[Npx]` / `text-[Nrem]`
// ─────────────────────────────────────────────────────────────────────────
//
// The Sergeant typography scale is defined in `apps/web/src/index.css`
// (`.text-display`, `.text-h1..h3`, `.text-body`, `.text-body-sm`,
// `.text-caption`, `.text-eyebrow`, `.text-meta`, `.text-micro`,
// `.text-display-stat`, `.text-display-hero`, `.text-style-{hero,title,
// body,label,caption,overline}`, `.text-celebration`, `.text-xp`).
//
// Hand-rolled `text-[12px]` / `text-[14px]` strings bypass the scale —
// they create vertical-rhythm drift, often land below WCAG-comfort
// (8 px in PushupsWidget, 10 px in stats badges), and don't move with
// design-token updates. Forbid them and route every author to a named
// utility instead. Stage-one rollout is `warn`, then `error` once
// migrations land.

const NO_ARBITRARY_TEXT_SIZE_MESSAGE =
  "Arbitrary `{{cls}}` bypasses the Sergeant typography scale. " +
  "Use a named utility from index.css (`text-display`, `text-h1..h3`, " +
  "`text-body`, `text-body-sm`, `text-caption`, `text-eyebrow`, " +
  "`text-meta`, `text-micro`, `text-display-stat`, `text-display-hero`, " +
  "`text-style-*`) or a Tailwind preset size (`text-xs..text-5xl`). " +
  "See docs/design/design-system.md § Typography.";

const RX_ARBITRARY_TEXT_SIZE = /text-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g;

// Files that legitimately encode raw size literals: the tokens / scale
// are defined here, so they must spell out the px values. Everything
// else routes through the named utilities.
const NO_ARBITRARY_TEXT_SIZE_EXEMPT_RX = [
  /shared[\\/]components[\\/]ui[\\/](?:Button|SectionHeading|Label|Badge|Stat|Input|Tabs|Segmented|Toast|Skeleton)\.tsx?$/,
  /\.(test|spec)\.[jt]sx?$/,
  /__tests__[\\/]/,
];

const noArbitraryTextSize = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Tailwind arbitrary `text-[Npx]` / `text-[Nrem]` text-size values; use a named typography utility from index.css.",
    },
    schema: [],
    messages: { ban: NO_ARBITRARY_TEXT_SIZE_MESSAGE },
  },
  create(context) {
    const filename =
      (context.filename != null ? context.filename : context.getFilename()) ||
      "";
    if (NO_ARBITRARY_TEXT_SIZE_EXEMPT_RX.some((rx) => rx.test(filename))) {
      return {};
    }

    function report(node, value) {
      if (typeof value !== "string") return;
      const matches = value.match(RX_ARBITRARY_TEXT_SIZE);
      if (!matches) return;
      // Report once per literal even if multiple hits — the message
      // already shows the offending class.
      const seen = new Set();
      for (const cls of matches) {
        if (seen.has(cls)) continue;
        seen.add(cls);
        context.report({
          node,
          messageId: "ban",
          data: { cls },
        });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") report(node, node.value);
      },
      TemplateElement(node) {
        const cooked = node.value && node.value.cooked;
        if (typeof cooked === "string") report(node, cooked);
      },
    };
  },
};

// ── no-flat-shared-lib ──────────────────────────────────────────────────
//
// Prevent regressing `apps/web/src/shared/lib/` back to a flat layout. After
// the 2026-05-03 reorg (PR #1479), every utility lives in one of five
// thematic subdirs (`api/`, `storage/`, `modules/`, `adapters/`, `ui/`).
// Any import that resolves to a *top-level* file inside `shared/lib/`
// (other than the barrel `index`) is forbidden — the dev should either
// place the new file inside the right subdir or import it via
// `@shared/lib` (the canonical barrel).
//
// Resolution covers both `@shared/lib/<x>` (alias) and relative imports
// (`./lib/<x>`, `../lib/<x>`, `../../lib/<x>`, …) anchored from the file
// being linted, so the rule survives any future refactor of import
// styles.
//
// Exempt: the rule itself only fires on files inside `apps/web/src/`;
// other apps and packages have their own `lib/` directories with
// independent layouts.

const NO_FLAT_SHARED_LIB_ALLOWED_TOP = new Set([
  "index",
  "api",
  "storage",
  "modules",
  "adapters",
  "ui",
]);

const NO_FLAT_SHARED_LIB_MESSAGE =
  "Import resolves to a flat file at `apps/web/src/shared/lib/{{name}}` — that namespace is now organized into subdirs (`api/`, `storage/`, `modules/`, `adapters/`, `ui/`). Move the new file into the right subdir, or import it via the `@shared/lib` barrel.";

// Resolve relative `..` segments without bringing in `node:path` (ESM
// constraint inside this plugin). Operates on forward-slashed strings.
function joinResolvePosix(base, rel) {
  const segments = (base + "/" + rel).split("/").filter(Boolean);
  const out = [];
  for (const seg of segments) {
    if (seg === ".") continue;
    if (seg === "..") {
      out.pop();
    } else {
      out.push(seg);
    }
  }
  // Preserve leading slash if base was absolute.
  return (base.startsWith("/") ? "/" : "") + out.join("/");
}

function resolveImportTarget(filename, importValue) {
  if (typeof importValue !== "string" || !importValue) return null;
  // Normalise to forward slashes throughout — Windows-friendly.
  const fwd = filename.replace(/\\/g, "/");
  if (importValue.startsWith("@shared/")) {
    const rest = importValue.slice("@shared/".length);
    const idx = fwd.indexOf("/apps/web/src/");
    if (idx === -1) return null;
    const root = fwd.slice(0, idx) + "/apps/web/src/shared";
    return joinResolvePosix(root, rest);
  }
  if (importValue.startsWith(".")) {
    const lastSlash = fwd.lastIndexOf("/");
    const dir = lastSlash >= 0 ? fwd.slice(0, lastSlash) : ".";
    return joinResolvePosix(dir, importValue);
  }
  return null;
}

function flatSharedLibName(absPath) {
  if (!absPath) return null;
  // Normalise to forward slashes so the regex is OS-agnostic in tests.
  const norm = absPath.replace(/\\/g, "/");
  const m = norm.match(/\/apps\/web\/src\/shared\/lib\/([^/]+)$/);
  if (!m) return null;
  const last = m[1];
  const stem = last.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");
  if (NO_FLAT_SHARED_LIB_ALLOWED_TOP.has(stem)) return null;
  return stem;
}

const noFlatSharedLib = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid imports that resolve to top-level flat files in `apps/web/src/shared/lib/`. After the 2026-05-03 reorg, every util lives in one of five subdirs (api/, storage/, modules/, adapters/, ui/) — new top-level files would re-flatten the namespace.",
    },
    schema: [],
    messages: { flat: NO_FLAT_SHARED_LIB_MESSAGE },
  },
  create(context) {
    const filename =
      (context.filename != null ? context.filename : context.getFilename()) ||
      "";
    // Only enforce inside apps/web/src — other apps have their own libs.
    const fwd = filename.replace(/\\/g, "/");
    if (!/\/apps\/web\/src\//.test(fwd)) return {};

    function check(node) {
      if (!node || !node.source || typeof node.source.value !== "string") {
        return;
      }
      const target = resolveImportTarget(filename, node.source.value);
      const stem = flatSharedLibName(target);
      if (!stem) return;
      context.report({
        node: node.source,
        messageId: "flat",
        data: { name: stem },
      });
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration(node) {
        // Only re-exports have a source.
        if (node.source) check(node);
      },
      ExportAllDeclaration: check,
    };
  },
};

// ─── forbid-shell-only-feature ──────────────────────────────────────────
//
// Sergeant runs *two* mobile clients at once (see ADR-0010 and
// `docs/initiatives/0002-mobile-platform-decision.md`):
//   1. `apps/mobile-shell` — Capacitor WebView wrapper around `apps/web`,
//      kept around as the fast-time-to-store surface.
//   2. `apps/mobile` — the Expo/React Native client we're investing in
//      long-term.
// `apps/mobile-shell` is on a sunset schedule (T₀ / T₁ / T₂ defined in
// ADR-0010). To keep the deprecation real, we forbid net-new files from
// landing in `apps/mobile-shell/src/**` — any new feature should grow
// inside `apps/mobile/src/**` (RN) or `apps/web/src/**` (web), not
// inside the shell, which is supposed to be a thin glue layer.
//
// Mechanism: explicit allowlist of the existing shell-glue files
// (snapshot at the start of the initiative). When a file is linted
// whose path matches `apps/mobile-shell/src/**` AND whose
// repo-relative path is NOT in the allowlist, the rule reports an
// error pointing at the initiative.
//
// Adding a *legitimate* new shell-glue file (e.g. another Capacitor
// plugin shim) requires explicit governance: open a PR that updates
// both the allowlist below AND ADR-0010 / the initiative outcome.
// That review pressure is the entire point of this rule.

const SHELL_FORBID_MESSAGE =
  "`apps/mobile-shell/src` is on a sunset schedule (ADR-0010 + initiative 0002-mobile-platform-decision). Net-new files in this tree are blocked: build new features in `apps/mobile/src/**` (RN) or `apps/web/src/**` (web). To allow a legitimate new shell-glue file, add it to the SHELL_GLUE_ALLOWLIST in packages/eslint-plugin-sergeant-design/index.js *and* update ADR-0010.";

// Repo-relative paths (POSIX separators) of files that may live in
// `apps/mobile-shell/src/**`. Snapshot of 2026-05-03. Tests
// (`*.test.ts`, `__tests__/**`) are exempt at the matcher level — not
// listed here.
const SHELL_GLUE_ALLOWLIST = new Set([
  "apps/mobile-shell/src/index.ts",
  "apps/mobile-shell/src/platform.ts",
  "apps/mobile-shell/src/auth-storage.ts",
  "apps/mobile-shell/src/barcodeNative.ts",
  "apps/mobile-shell/src/pushNative.ts",
]);

const SHELL_PATH_RE = /(?:^|\/)apps\/mobile-shell\/src\//;
const SHELL_TEST_RE =
  /(?:^|\/)apps\/mobile-shell\/src\/(?:.*\/)?__tests__\/|\.test\.tsx?$|\.spec\.tsx?$/;

function toRepoRelativePosixPath(filename) {
  if (!filename) return "";
  const norm = filename.replace(/\\/g, "/");
  const idx = norm.indexOf("/apps/mobile-shell/src/");
  if (idx === -1) return norm.replace(/^\/+/, "");
  return norm.slice(idx + 1);
}

const forbidShellOnlyFeature = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid net-new feature files inside `apps/mobile-shell/src/**`. The Capacitor shell is on a sunset schedule (ADR-0010, initiative 0002); new features belong to `apps/mobile/**` (RN) or `apps/web/**` (web).",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowlist: {
            type: "array",
            items: { type: "string" },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: { forbid: SHELL_FORBID_MESSAGE },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const norm = filename.replace(/\\/g, "/");
    if (!SHELL_PATH_RE.test(norm)) return {};
    if (SHELL_TEST_RE.test(norm)) return {};
    const rel = toRepoRelativePosixPath(filename);
    const opts = context.options[0] ?? {};
    const allowlist = new Set([
      ...SHELL_GLUE_ALLOWLIST,
      ...(Array.isArray(opts.allowlist) ? opts.allowlist : []),
    ]);
    if (allowlist.has(rel)) return {};
    return {
      Program(node) {
        context.report({ node, messageId: "forbid" });
      },
    };
  },
};

const plugin = {
  rules: {
    "no-eyebrow-drift": noEyebrowDrift,
    "no-ellipsis-dots": noEllipsisDots,
    "no-raw-tracked-storage": noRawTrackedStorage,
    "no-raw-local-storage": noRawLocalStorage,
    "no-finyk-token-in-storage": noFinykTokenInStorage,
    "ai-marker-syntax": aiMarkerSyntax,
    "valid-tailwind-opacity": validTailwindOpacity,
    "no-hex-in-classname": noHexInClassname,
    "no-foreign-module-accent": noForeignModuleAccent,
    "no-low-contrast-text-on-fill": noLowContrastTextOnFill,
    "no-bigint-string": noBigintString,
    "rq-keys-only-from-factory": rqKeysOnlyFromFactory,
    "no-anthropic-key-in-logs": noAnthropicKeyInLogs,
    "no-strict-bypass": noStrictBypass,
    "no-raw-dark-palette": noRawDarkPalette,
    "prefer-focus-visible": preferFocusVisible,
    "no-rounded-lg": noRoundedLg,
    "no-bare-empty-text": noBareEmptyText,
    "prefer-text-style": preferTextStyle,
    "no-arbitrary-text-size": noArbitraryTextSize,
    "no-flat-shared-lib": noFlatSharedLib,
    "forbid-shell-only-feature": forbidShellOnlyFeature,
  },
};

export {
  TRACKED_STORAGE_KEY_NAMES,
  TRACKED_STORAGE_KEY_VALUES,
  RAW_TRACKED_STORAGE_MESSAGE,
  RAW_LOCAL_STORAGE_MESSAGE,
  ALLOWED_TAILWIND_OPACITY_STEPS,
  TAILWIND_OPACITY_UTILITIES,
  STRONG_BG_FAMILIES,
  DEFAULT_NUMERIC_COLUMNS,
  RQ_KEYS_MESSAGE,
  DEFAULT_FACTORY_PATH,
  NO_ANTHROPIC_KEY_MESSAGE,
  NO_STRICT_BYPASS_MESSAGES,
  DEFAULT_FORBID_PATTERNS,
  RAW_DARK_PALETTE_FAMILIES,
  RAW_DARK_PALETTE_UTILITIES,
  RAW_DARK_PALETTE_MESSAGE,
  FOCUS_COLOR_UTILITIES,
  FOCUS_OUTLINE_ALLOWED_TAILS,
  PREFER_FOCUS_VISIBLE_MESSAGE,
  NO_ROUNDED_LG_MESSAGE,
  NO_BARE_EMPTY_TEXT_MESSAGE,
  PREFER_TEXT_STYLE_MESSAGE,
  TEXT_STYLE_MAPPINGS,
  NO_ARBITRARY_TEXT_SIZE_MESSAGE,
  NO_FLAT_SHARED_LIB_MESSAGE,
  NO_FLAT_SHARED_LIB_ALLOWED_TOP,
};

export default plugin;
