/**
 * Sergeant's local ESLint rules for runtime, privacy, storage, API-contract,
 * repository-boundary, and domain invariants. Visual taste stays in design
 * tokens and review guidance instead of custom AST rules.
 */

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
  // Only the `profile` sync module is still LS/MMKV-tracked: finyk /
  // fizruk / routine / nutrition left SYNC_MODULES during storage-roadmap
  // Stage 4 (SQLite mirror + op-log; `no-restricted-syntax` guards in
  // `eslint.config.js` block new direct STORAGE_KEYS reads for them).
  "USER_PROFILE",
  "HUB_BIOMETRICS",
]);

const TRACKED_STORAGE_KEY_VALUES = new Set([
  "hub_user_profile_v1",
  "hub_biometrics_v1",
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

// ─── no-strict-bypass ───������──────────────────────────────────────────────
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
  // PrivatBank merchant credentials. Added after the beta-readiness audit
  // (`docs/90-work/planning/specs/beta-security-readiness.md`, F1) found the
  // merchant token sitting in cleartext `localStorage`: the Monobank fix had
  // been locked down by this very rule, but the rule was written narrowly
  // around Monobank's key names, so PrivatBank walked straight past it.
  // The merchant id is guarded alongside the token because the pair is the
  // credential — and because writing the id back is exactly the signal that
  // the old client-side flow has returned.
  "finyk_privat_token",
  "finyk_privat_id",
]);
const FINYK_TOKEN_KEY_NAMES = new Set([
  "FINYK_TOKEN",
  "FINYK_PRIVAT_TOKEN",
  "FINYK_PRIVAT_ID",
]);

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
  // `finykStorage.writeRaw` — the wrapper the PrivatBank flow used to persist
  // its merchant token. Non-credential keys pass through untouched; the rule
  // only fires when the key argument itself is a guarded one.
  "writeRaw",
]);

const FINYK_TOKEN_MESSAGE =
  "Bank credentials (`finyk_token`, `finyk_privat_token`, `finyk_privat_id`) must not be persisted client-side. They live encrypted server-side (`mono_connection` / `privat_connection` `token_ciphertext`); legacy LS/sessionStorage values are migrated once on cold-boot and then removed. Only reads (for migration) and removals are allowed.";

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
// `no-cyrillic-jsx-literal` — flag inline cyrillic JSX text/attrs
// ─────────────────────────────────────────────────────────────────────────
//
// docs/i18n/readiness.md describes a "lightweight foundation": every UA
// string the user sees should live in `apps/web/src/shared/i18n/uk.ts`
// as `messages.<group>.<key>`. The day-to-day code references that key
// instead of inlining a literal. When/if the project adds runtime-i18n
// (item #18 Phase 4 — "deferred until product-required"), the swap to
// `t('group.key')` is a one-line codemod.
//
// This rule is the burndown gate: it catches NEW inline-cyrillic JSX
// literals so they cannot land outside the catalog. Existing files are
// listed in `allowlist` (file-relative paths) — they continue to fire
// as warnings (highlight-in-editor) but do not break CI. Reduce the
// allowlist as you migrate strings → catalog. Same burndown pattern as
// `no-raw-local-storage` for item #6.
//
// What it flags:
//   1. JSXText nodes with cyrillic (e.g. `<p>Текст</p>`).
//   2. JSX attribute string-literal values with cyrillic (e.g.
//      `<Button title="Закрити">`). Boolean attrs / expression children
//      / template-literals are NOT flagged here — those go through
//      `JSXExpressionContainer → Literal`, not `JSXAttribute → Literal`.
//
// What it does NOT flag:
//   - Comments (handled by ESLint's normal comment exclusion).
//   - Strings inside `messages.<group>.<key>` references — those are
//     `MemberExpression`s, not `Literal`s.
//   - Non-JSX string literals (e.g. zod-error messages, console.log,
//     analytics props). For those, prefer the same catalog by hand —
//     no automated rule yet, since data files (food seeds, AI prompts)
//     legitimately contain cyrillic and would be too noisy to flag.
//   - Files matching `allowlist` (rule option), `**/*.test.{ts,tsx}`,
//     `**/__tests__/**`, `**/*.stories.tsx`. Tests pin assertions to
//     literal copy on purpose; stories showcase live strings.
//
// Configure as `warn` first; tighten allowlist by removing entries as
// each file migrates. Once allowlist is empty, switch to `error`.

const NO_CYRILLIC_JSX_LITERAL_MESSAGE =
  "JSX-літерал з кирилицею має посилатися на messages-каталог. " +
  "Винеси рядок у `apps/web/src/shared/i18n/uk.ts` (group `messages.<group>.<key>`) " +
  "і використовуй `messages.<group>.<key>` тут. Див. `docs/i18n/readiness.md`.";

const RX_CYRILLIC = /[\u0400-\u04FF]/;

function isInsideJsxAttribute(node) {
  let p = node.parent;
  while (p) {
    if (p.type === "JSXAttribute") return true;
    if (p.type === "JSXElement" || p.type === "JSXFragment") return false;
    p = p.parent;
  }
  return false;
}

const noCyrillicJsxLiteral = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Forbid inline cyrillic JSX text and JSX attribute string literals — extract to messages-каталог.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowlist: {
            type: "array",
            items: { type: "string" },
            description:
              "Project-relative file paths (forward-slash) that are exempt. " +
              "Burndown: shrink this list as you migrate files.",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: { catalog: NO_CYRILLIC_JSX_LITERAL_MESSAGE },
  },
  create(context) {
    const options = context.options[0] || {};
    const allowlist = options.allowlist || [];
    const filename = context.filename || context.getFilename();
    // Normalize to posix-style absolute path. The allowlist works on
    // suffix-match so callers can use any of "apps/web/src/foo.tsx",
    // "src/foo.tsx" or absolute "/repo/apps/web/src/foo.tsx" — all
    // resolve to the same intent regardless of `eslint .` cwd.
    const fwd = filename.replace(/\\/g, "/");
    for (const entry of allowlist) {
      const norm = entry.replace(/\\/g, "/").replace(/^\.\//, "");
      if (fwd === norm || fwd.endsWith("/" + norm)) return {};
    }
    // Test files & stories — opt out by convention.
    if (
      /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/.test(fwd) ||
      /(^|\/)__tests__\//.test(fwd) ||
      /\.stories\.(ts|tsx|js|jsx|mjs|cjs)$/.test(fwd)
    ) {
      return {};
    }
    // Catalog itself (the strings live there by definition).
    if (/(?:^|\/)apps\/web\/src\/shared\/i18n\//.test(fwd)) return {};

    return {
      JSXText(node) {
        const txt = typeof node.value === "string" ? node.value : "";
        if (!RX_CYRILLIC.test(txt)) return;
        context.report({ node, messageId: "catalog" });
      },
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (!RX_CYRILLIC.test(node.value)) return;
        if (!isInsideJsxAttribute(node)) return;
        context.report({ node, messageId: "catalog" });
      },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
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

// ── no-hash-router-in-modules ───────────────────────────────────────────────
//
// Initiative 0006 (frontend routing & code-split) мігрує `apps/web` з
// самописного hash-router (`useHashRouter`/`useHashRoute` + raw
// `window.location.hash = ...` assignments) на `react-router@7` з
// route-based code-split. Поки міграція in-flight, ця rule — **warn-level**
// canary: не блокує рефакторинг, але висвічує всі нові hash-router
// callsites у Vite/lint-overlay і фіксує baseline для автоматичних
// progress-перевірок.
//
// Scope:
//   - `apps/web/src/modules/**` — модулі мають вже не вводити нові
//     hash-callsites; під час Phase 2 кожен модуль міняє свої callsites
//     на react-router hooks.
//   - Тести (`*.test.{ts,tsx}`) пропускаємо — там часто використовується
//     mock window.location.hash для перевірки legacy-shim-у.
//
// Pattern detection:
//   1. Імпорти з `*useHashRouter*` / `*useHashRoute*` модуль-ів
//      (включно з `apps/web/src/shared/hooks/useHashRoute.ts`,
//      `apps/web/src/modules/finyk/hooks/useHashRouter.ts`).
//   2. Identifier-call `useHashRouter(...)` / `useHashRoute(...)`.
//   3. Assignment `window.location.hash = ...` або `location.hash = ...`.
//
// Звіт через `messageId: "hashRouter"` з посиланням на initiative 0006.

const NO_HASH_ROUTER_MESSAGE =
  "hash-router callsite виявлено: initiative 0006 (frontend routing & code-split) поступово мігрує `apps/web` на `react-router@7`. Уникай нових `useHashRouter` / `useHashRoute` / `window.location.hash = ...` callsite-ів у `apps/web/src/modules/**` — після завершення Phase 2 ця rule переходить у `error`. Деталі: docs/90-work/initiatives/archive/_0006-frontend-routing-and-code-split.md.";

const HASH_ROUTER_HOOK_NAMES = new Set(["useHashRouter", "useHashRoute"]);

const HASH_ROUTER_PATH_RE = /(?:^|\/)apps\/web\/src\/modules\//;
const HASH_ROUTER_TEST_RE =
  /(?:\.test|\.spec)\.(?:t|j)sx?$|(?:^|\/)__tests__\//;

function isHashLocationMember(node) {
  // matches `window.location.hash` or `location.hash` (on the LEFT of an
  // assignment; we filter to AssignmentExpression at call-site).
  if (!node || node.type !== "MemberExpression") return false;
  const prop = node.property;
  if (!prop || prop.type !== "Identifier" || prop.name !== "hash") return false;
  const obj = node.object;
  if (!obj) return false;
  if (obj.type === "Identifier" && obj.name === "location") return true;
  if (
    obj.type === "MemberExpression" &&
    obj.property?.type === "Identifier" &&
    obj.property.name === "location" &&
    obj.object?.type === "Identifier" &&
    obj.object.name === "window"
  ) {
    return true;
  }
  return false;
}

const noHashRouterInModules = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Discourage `useHashRouter` / `useHashRoute` / raw `window.location.hash = ...` callsites inside `apps/web/src/modules/**`. Initiative 0006 migrates the web app to `react-router@7`; this rule is a warn-level canary during the migration and graduates to `error` once Phase 2 completes.",
    },
    schema: [],
    messages: { hashRouter: NO_HASH_ROUTER_MESSAGE },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const norm = filename.replace(/\\/g, "/");
    if (!HASH_ROUTER_PATH_RE.test(norm)) return {};
    if (HASH_ROUTER_TEST_RE.test(norm)) return {};
    return {
      ImportDeclaration(node) {
        const src =
          typeof node.source?.value === "string" ? node.source.value : "";
        if (/useHashRouter|useHashRoute/.test(src)) {
          context.report({ node, messageId: "hashRouter" });
          return;
        }
        for (const spec of node.specifiers ?? []) {
          if (
            spec.type === "ImportSpecifier" &&
            spec.imported?.type === "Identifier" &&
            HASH_ROUTER_HOOK_NAMES.has(spec.imported.name)
          ) {
            context.report({ node: spec, messageId: "hashRouter" });
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee?.type === "Identifier" &&
          HASH_ROUTER_HOOK_NAMES.has(callee.name)
        ) {
          context.report({ node, messageId: "hashRouter" });
        }
      },
      AssignmentExpression(node) {
        if (node.operator !== "=") return;
        if (isHashLocationMember(node.left)) {
          context.report({ node, messageId: "hashRouter" });
        }
      },
    };
  },
};

// ─── no-inline-body-size-limit ──────────────────────────────────────────
//
// Stack-pulse PR-07 (Body-size declarative policy). Усі route-specific
// `express.json({ limit })` / `express.raw({ ..., limit })` mount-и мусять
// жити у `apps/server/src/http/bodySizePolicy.ts` як декларативна
// `BODY_SIZE_POLICY`-таблиця. Inline-mount у `app.ts` чи доменному
// router-і — це регресія: порядок mount-ів стає крихким (specific-shrут
// мусить йти ДО глобального дефолтного), а сам ліміт перестає бути
// auditable з одного місця. Rule ловить використання `.json({ limit })`
// та `.raw({ ..., limit })` поза policy-файлом.
//
// File-scope: rule НЕ срацьовує у самому `bodySizePolicy.ts` і його
// тесті (єдині легітимні місця, де inline-options валідні). Усе інше
// під забороною.

const NO_INLINE_BODY_SIZE_LIMIT_MESSAGE =
  "Inline `express.{{method}}({ limit })` is not allowed outside `apps/server/src/http/bodySizePolicy.ts`. Add a rule to `BODY_SIZE_POLICY` instead — that file is the single source of truth, and `applyBodySizePolicy()` mounts everything in specificity-descending order. ESLint guard from stack-pulse PR-07.";

const BODY_SIZE_POLICY_PATH_RE =
  /(?:^|\/)apps\/server\/src\/http\/bodySizePolicy(?:\.test)?\.ts$/;

// Розмір тіла у body-парсерах express завжди записується або
// рядком формату `"<число><b|kb|mb|gb>"` (canonical), або голим
// числом байтів. Рядкове `result.limit` у Response.json-payload-і
// (відповідь сервера типу `{ limit: 200 }`) НЕ підпадає під цей
// формат — тому такого виду перевірка вузить scope без false-positive.
const BODY_SIZE_LIMIT_LITERAL_RE = /^\d+\s*(?:b|kb|mb|gb)$/i;

function isBodySizeLimitValue(valueNode) {
  if (!valueNode) return false;
  if (
    valueNode.type === "Literal" &&
    typeof valueNode.value === "string" &&
    BODY_SIZE_LIMIT_LITERAL_RE.test(valueNode.value)
  ) {
    return true;
  }
  if (valueNode.type === "Literal" && typeof valueNode.value === "number") {
    // Numeric byte-count form (legacy, але body-парсери приймають number).
    return true;
  }
  if (
    valueNode.type === "TemplateLiteral" &&
    valueNode.quasis.length === 1 &&
    typeof valueNode.quasis[0].value.cooked === "string" &&
    BODY_SIZE_LIMIT_LITERAL_RE.test(valueNode.quasis[0].value.cooked)
  ) {
    return true;
  }
  return false;
}

function isLimitedBodyParserCall(node) {
  // node — CallExpression. Ми очікуємо callee на кшталт
  // `express.json({ limit })` або `express.raw({ ..., limit })`. Без
  // обовʼязкового імені модуля `express`, бо хтось може робити
  // `import { json } from "express"` і потім `json({ limit })`.
  if (node.type !== "CallExpression") return null;
  const args = node.arguments;
  if (!args.length || args[0].type !== "ObjectExpression") return null;
  const limitProp = args[0].properties.find(
    (p) =>
      p.type === "Property" &&
      !p.computed &&
      ((p.key.type === "Identifier" && p.key.name === "limit") ||
        (p.key.type === "Literal" && p.key.value === "limit")),
  );
  if (!limitProp) return null;
  // Звужуємо: значення `limit` мусить виглядати як body-size, інакше
  // це Response.json-payload (`res.status(429).json({ limit: x })`),
  // де `limit` — це поле бізнес-помилки (квота, ліміт суми, etc.),
  // а не body-парсер.
  if (!isBodySizeLimitValue(limitProp.value)) return null;

  // Match `express.json(...)` / `express.raw(...)`.
  const callee = node.callee;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier" &&
    (callee.property.name === "json" || callee.property.name === "raw")
  ) {
    return callee.property.name;
  }

  // Match bare `json({...})` / `raw({...})` after a destructured import.
  if (
    callee.type === "Identifier" &&
    (callee.name === "json" || callee.name === "raw")
  ) {
    return callee.name;
  }

  return null;
}

const noInlineBodySizeLimit = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid inline `express.json({ limit })` / `express.raw({ ..., limit })` outside `apps/server/src/http/bodySizePolicy.ts`. Mount through `applyBodySizePolicy()` instead.",
    },
    schema: [],
    messages: { inline: NO_INLINE_BODY_SIZE_LIMIT_MESSAGE },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const norm = filename.replace(/\\/g, "/");
    if (BODY_SIZE_POLICY_PATH_RE.test(norm)) return {};
    return {
      CallExpression(node) {
        const method = isLimitedBodyParserCall(node);
        if (!method) return;
        context.report({
          node,
          messageId: "inline",
          data: { method },
        });
      },
    };
  },
};

// ─── no-raw-req-in-pino-log ────────────────────────────────────────────
//
// Stack-pulse PR-16 (Pino redaction policy). Pino logger у
// `apps/server/src/obs/logger.ts` має `redact: { paths: [...] }` зі
// списком ~50 полів (Authorization, Cookie, password, email, phone, …),
// але redact-paths працюють тільки на КЛЮЧАХ, які явно перераховані.
// Якщо хтось пише `logger.info(req)` — у JSON-payload потрапляють УСІ
// поля обʼєкта Express Request, включно з тими, що не у redact-list:
// `req.signedCookies`, custom-headers від upstream-проксі, `req.user`
// (Better Auth session), `req.body` для нових endpoint-ів. Pino
// redact-paths не закривають "зрост��юче дерево" — нові sensitive-поля
// зʼявляються без auto-redaction.
//
// Це правило змушує робити **явний destructure** замість raw-обʼєкта:
//
//   ❌ logger.info(req)
//   ❌ logger.error(res.headers, "request failed")
//   ❌ req.log.warn({ req }, "slow request")  (через shorthand)
//   ✅ logger.info({ url: req.url, status: res.statusCode }, "ok")
//   ✅ req.log.error({ err, route: req.route.path }, "failed")
//
// Контракт стає явним: ревьюер бачить, які саме поля логуються, і
// блокує їх у diff, якщо вони містять PII / секрети. Це доповнення
// до Pino redact-paths, не заміна.

const PINO_LOGGER_METHODS = new Set([
  "info",
  "warn",
  "error",
  "debug",
  "trace",
  "fatal",
]);

// Receivers, які ми вважаємо logger-style. Свідомо консервативно — щоб
// не ловити кожен `obj.info(...)` callsite (наприклад, RxJS Subject,
// EventEmitter тощо).
const PINO_LOGGER_RECEIVER_RE =
  /^(?:logger|log|pino|childLogger|httpLogger|appLogger|reqLogger|baseLogger)$/i;

// Identifiers, raw-передача яких у logger-методі ризикує проштовхнути
// Authorization/Cookie/password/email/session-token у JSON-output.
const PINO_RAW_REQ_LIKE_IDENTIFIERS = new Set([
  "req",
  "request",
  "res",
  "response",
  "ctx",
  "context",
  "headers",
  "body",
  "payload",
  "cookies",
]);

// MemberExpression властивості, які зазвичай тримають bag-of-headers /
// bag-of-body. Логування цілої групи протікає всі поля, не тільки відомі
// (custom proxy headers, нові auth-headers, JSON-payload без allowlist).
const PINO_RAW_REQ_LIKE_MEMBER_PROPS = new Set([
  "headers",
  "body",
  "cookies",
  "params",
  "query",
  "user",
  "session",
  "signedCookies",
]);

const NO_RAW_REQ_IN_PINO_LOG_MESSAGE =
  "Не передавай raw `{{name}}` у `{{method}}()` — це ризик протекти Authorization/Cookie/password/email/session-token " +
  "у Pino-output або Sentry breadcrumbs. Зроби явний destructure: `logger.{{method}}({ field: req.url, status: res.statusCode }, 'msg')`. " +
  "Pino redact-paths у `apps/server/src/obs/logger.ts` ловлять відомі поля, але raw-обʼєкт лишає контракт неявним — " +
  "нові sensitive-поля зʼявляються без redaction. Див. `docs/security/logging-redaction-policy.md`.";

function isPinoLoggerReceiver(callee) {
  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.property.type !== "Identifier"
  ) {
    return false;
  }
  // Direct: `logger.info(...)` / `log.warn(...)` / `pino.error(...)`
  if (
    callee.object.type === "Identifier" &&
    PINO_LOGGER_RECEIVER_RE.test(callee.object.name)
  ) {
    return true;
  }
  // Member chain: `req.log.info(...)` / `ctx.logger.warn(...)`
  if (
    callee.object.type === "MemberExpression" &&
    !callee.object.computed &&
    callee.object.property.type === "Identifier" &&
    PINO_LOGGER_RECEIVER_RE.test(callee.object.property.name)
  ) {
    return true;
  }
  return false;
}

function describePinoRawReqArg(arg) {
  if (!arg) return null;
  // Identifier: req, res, headers, body, ...
  if (
    arg.type === "Identifier" &&
    PINO_RAW_REQ_LIKE_IDENTIFIERS.has(arg.name)
  ) {
    return arg.name;
  }
  // MemberExpression: req.headers, res.body, req.cookies
  if (
    arg.type === "MemberExpression" &&
    !arg.computed &&
    arg.property.type === "Identifier" &&
    PINO_RAW_REQ_LIKE_MEMBER_PROPS.has(arg.property.name) &&
    arg.object.type === "Identifier" &&
    PINO_RAW_REQ_LIKE_IDENTIFIERS.has(arg.object.name)
  ) {
    return `${arg.object.name}.${arg.property.name}`;
  }
  // ObjectExpression with shorthand `{ req }` / `{ res }` /
  // `{ headers }`. Catches the common pattern where engineers think
  // they're "binding" the object name and forget that pino expands
  // shorthand to the same raw payload.
  if (arg.type === "ObjectExpression") {
    for (const prop of arg.properties) {
      if (
        prop.type === "Property" &&
        prop.shorthand === true &&
        prop.key.type === "Identifier" &&
        PINO_RAW_REQ_LIKE_IDENTIFIERS.has(prop.key.name)
      ) {
        return prop.key.name;
      }
    }
  }
  return null;
}

const noRawReqInPinoLog = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid passing raw `req` / `res` / `req.headers` / `req.body` (or shorthand `{ req }` / `{ res }`) to Pino logger methods. Pino redact-paths catch known fields but raw-object logging leaks newly added sensitive fields. See `docs/security/logging-redaction-policy.md`.",
    },
    schema: [],
    messages: { rawReq: NO_RAW_REQ_IN_PINO_LOG_MESSAGE },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isPinoLoggerReceiver(node.callee)) return;
        const method = node.callee.property.name;
        if (!PINO_LOGGER_METHODS.has(method)) return;
        for (const arg of node.arguments) {
          const name = describePinoRawReqArg(arg);
          if (name) {
            context.report({
              node: arg,
              messageId: "rawReq",
              data: { name, method },
            });
            // One report per call — стримує noise у multi-arg випадку.
            return;
          }
        }
      },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// ─── no-console-pii ─────────────────────────────────────────────────────
//
// S2 (audit `docs/audits/2026-05-13-security-observability-roast.md`).
//
// Forbid `console.{log,error,warn,info}(...)` when an argument is a
// string literal / template literal whose text matches
// `/email|phone|password|token|secret|auth/i`, OR an object literal
// whose (recursively) keys match the same regex.
//
// Why:
//   - `@sentry/react` enables a `console` integration by default, so
//     anything routed through `console.*` shows up as a Sentry breadcrumb
//     in production.
//   - DevTools console is visible during screen-share / paired support;
//     accidental `console.log({ email })` leaks PII to whoever is
//     watching.
//   - PostHog session-replay extensions and Logpipe browser extensions
//     also tap into `console.*`.
//
// Rule scope (intentionally narrow per audit §S2):
//   - Methods covered: `log`, `error`, `warn`, `info`. `console.debug`,
//     `console.table`, etc. are intentionally out of scope — they are
//     either dev-only (`debug` is filtered by most consoles) or do not
//     carry PII shapes in practice.
//   - Only direct `console.<method>(...)` member calls. Aliased
//     `const log = console.log; log({email})` is not detected — match
//     the AST conservatively to keep false-positive rate low.
//   - String / template-literal arg: match regex on the raw text of the
//     literal AND on each template substitution's identifier or
//     non-computed property name (catches `${user.email}`).
//   - Object literal arg: check every property key (Identifier name or
//     string-literal value) recursively, including nested
//     ObjectExpressions. Spread (`...obj`) and computed keys are
//     conservatively ignored — they would require flow analysis we do
//     not do here.
//
// Test files are exempt via the eslint.config.js scope-block `ignores`.

const NO_CONSOLE_PII_REGEX = /email|phone|password|token|secret|auth/i;
const NO_CONSOLE_PII_METHODS = new Set(["log", "error", "warn", "info"]);
const NO_CONSOLE_PII_MESSAGE =
  "Do not pass PII / secret-shaped values (email, phone, password, token, secret, auth) to console.{log,error,warn,info}. Sentry, DevTools, and browser extensions all tap into console output. See docs/audits/2026-05-13-security-observability-roast.md § S2.";

function isConsolePiiMethodCall(callee) {
  return (
    callee &&
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object &&
    callee.object.type === "Identifier" &&
    callee.object.name === "console" &&
    callee.property &&
    callee.property.type === "Identifier" &&
    NO_CONSOLE_PII_METHODS.has(callee.property.name)
  );
}

function noConsolePiiNodeName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property &&
    node.property.type === "Identifier"
  ) {
    return node.property.name;
  }
  return null;
}

function noConsolePiiObjectHasPiiKey(node, seen) {
  if (!node || node.type !== "ObjectExpression") return false;
  if (seen.has(node)) return false;
  seen.add(node);
  for (const prop of node.properties) {
    if (!prop || prop.type !== "Property") continue;
    if (prop.computed) continue;
    let keyName = null;
    if (prop.key) {
      if (prop.key.type === "Identifier") keyName = prop.key.name;
      else if (
        prop.key.type === "Literal" &&
        typeof prop.key.value === "string"
      ) {
        keyName = prop.key.value;
      }
    }
    if (keyName && NO_CONSOLE_PII_REGEX.test(keyName)) return true;
    if (
      prop.value &&
      prop.value.type === "ObjectExpression" &&
      noConsolePiiObjectHasPiiKey(prop.value, seen)
    ) {
      return true;
    }
  }
  return false;
}

function noConsolePiiArgMatches(arg) {
  if (!arg) return false;
  if (arg.type === "Literal" && typeof arg.value === "string") {
    return NO_CONSOLE_PII_REGEX.test(arg.value);
  }
  if (arg.type === "TemplateLiteral") {
    for (const quasi of arg.quasis) {
      const text = quasi.value && (quasi.value.cooked ?? quasi.value.raw);
      if (typeof text === "string" && NO_CONSOLE_PII_REGEX.test(text)) {
        return true;
      }
    }
    for (const expr of arg.expressions) {
      const name = noConsolePiiNodeName(expr);
      if (name && NO_CONSOLE_PII_REGEX.test(name)) return true;
    }
    return false;
  }
  if (arg.type === "ObjectExpression") {
    return noConsolePiiObjectHasPiiKey(arg, new WeakSet());
  }
  return false;
}

const noConsolePii = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid passing PII / secret-shaped string literals, template literals, or object keys (email, phone, password, token, secret, auth) to console.{log,error,warn,info}.",
    },
    schema: [],
    messages: { noConsolePii: NO_CONSOLE_PII_MESSAGE },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isConsolePiiMethodCall(node.callee)) return;
        for (const arg of node.arguments) {
          if (noConsolePiiArgMatches(arg)) {
            context.report({ node, messageId: "noConsolePii" });
            return;
          }
        }
      },
    };
  },
};

// prefer-kyiv-time — Theme 1 (audit consolidated 2026-05-13 § Theme 1),
// re-scoped 2026-08-04 by ADR-0078.
//
// `Date.prototype.getHours()` / `getMinutes()` / `getDate()` / `getDay()` /
// `getMonth()` / `getFullYear()` / `getSeconds()` return host-local values.
// The rule does NOT mean "Kyiv belongs here" — ADR-0078 ratified the opposite
// for the **personal day boundary**: a habit tick / meal log / daily entry
// belongs to the device clock, and Europe/Kyiv stays only for time *display*,
// server-side reports and financial periods. Both doctrines are live, so a
// bare host-getter is ambiguous: it never shows whether the author chose the
// device on purpose or just wrote the shortest code. This rule forces that
// choice to be explicit.
//
// Two legitimate resolutions per site:
//   1. Kyiv (display / report / financial period) — use the helpers in
//      `apps/web/src/shared/lib/time/kyivTime.ts`:
//        getKyivDateParts(ts) → { year, month, day, hour, minute }
//        getKyivDayKey(d)     → "YYYY-MM-DD" in Kyiv
//        isSameKyivDay(ts)    → boolean
//   2. Device (personal day) — keep the host getters and suppress with a WHY
//      that names ADR-0078. Reference: `deviceDayKey` in
//      `apps/web/src/core/observability/adviceTelemetry.ts`. In shared code
//      prefer `dateKeyFromDate` from `@sergeant/routine-domain`.
//
// Severity: stays `warn` permanently. The old ramp to `error` targeted zero
// host-getters, which after ADR-0078 would penalise correct device-local code.
//
// Allowlist (rule-level skip):
//   - The helper itself (`kyivTime.ts`)
//   - Server code (`apps/server/**`) — backend handles time as UTC.
//   - Tests (`*.test.{ts,tsx,js}`) — explicit `vi.setSystemTime` ok.
//   - Strategy `kyivMondayISO` uses `Intl.DateTimeFormat` directly and is
//     itself the recommended pattern.
//
// See docs/04-governance/governance/rules/kyiv-time-helpers.md for the full
// doctrine table, the suppress-comment contract and the audit cross-ref.
const PREFER_KYIV_TIME_MESSAGE =
  "Host-local date part ({{name}}) — make the day-boundary doctrine explicit (ADR-0078). " +
  "Display, server reports and financial periods → @shared/lib/time/kyivTime " +
  "(getKyivDateParts, getKyivDayKey, isSameKyivDay). The PERSONAL day (habit tick, meal " +
  "log, daily entry, streak) belongs to the DEVICE — that is canonical, so keep the host " +
  "getters and suppress with `-- ADR-0078: <why the device owns this day>`. " +
  "See docs/04-governance/governance/rules/kyiv-time-helpers.md.";

const HOST_TIME_GETTERS = new Set([
  "getFullYear",
  "getMonth",
  "getDate",
  "getDay",
  "getHours",
  "getMinutes",
  "getSeconds",
]);

const preferKyivTime = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Flag host-local Date getters so the day-boundary doctrine is explicit (ADR-0078): Kyiv helpers for display/reports, documented suppress for the device-local personal day.",
    },
    schema: [],
    messages: {
      forbidden: PREFER_KYIV_TIME_MESSAGE,
    },
  },
  create(context) {
    const filename =
      typeof context.filename === "string"
        ? context.filename
        : typeof context.getFilename === "function"
          ? context.getFilename()
          : "";
    const normalized = filename.replace(/\\/g, "/");
    if (/\/shared\/lib\/time\/kyivTime\.[jt]sx?$/.test(normalized)) return {};
    if (/\/apps\/server\//.test(normalized)) return {};
    if (/\.test\.[jt]sx?$/.test(normalized)) return {};
    return {
      MemberExpression(node) {
        if (
          node.property &&
          node.property.type === "Identifier" &&
          HOST_TIME_GETTERS.has(node.property.name)
        ) {
          context.report({
            node,
            messageId: "forbidden",
            data: { name: node.property.name },
          });
        }
      },
    };
  },
};

// ─── prefer-parse-body-over-validate-body ────────────────────────────────
//
// Backend-perf PR-11 (prefer-parseBody governance rule). Застарілий
// `validateBody` / `validateQuery` хелпер повертає sentinel `{ ok: false }`
// і вимагає ручного `if (!parsed.ok) return`, забутий `return` якого
// породжував double-response 500-ки на проді. Throw-based `parseBody` /
// `parseQuery` у парі з `asyncHandler` + централізованим `errorHandler`
// робить той самий 400 з `code: "VALIDATION"` автоматично.
//
// Rule scope:
//   - Тільки `apps/server/**` — де живуть Express-handler-и.
//   - Виключаємо `apps/server/src/http/validate.ts` (і його тест) — там ці
//     функції визначені, включати їх у заборону означало б flag-ити власне
//     оголошення.
//   - Виключаємо `*.test.[jt]s(x)?` — тести можуть перевіряти legacy-поведінку
//     через мок чи вже закритий шля��.
//
// Rollout: `warn` зараз → `error` через 1 sprint після підтвердження, що
// усі callsite-и у PR-09 + PR-10 мігровані. Дивись AGENTS.md §Hard rules
// та docs/04-governance/governance/rules/prefer-parse-body.md.

const PREFER_PARSE_BODY_MESSAGE =
  "Use `parseBody(Schema, req)` instead of `validateBody(Schema, req, res)`. The throw-based helper works with `asyncHandler` + `errorHandler` and eliminates the sentinel pattern that caused double-response 500s. See docs/04-governance/governance/rules/prefer-parse-body.md.";
const PREFER_PARSE_QUERY_MESSAGE =
  "Use `parseQuery(Schema, req)` instead of `validateQuery(Schema, req, res)`. The throw-based helper works with `asyncHandler` + `errorHandler`. See docs/04-governance/governance/rules/prefer-parse-body.md.";

// Paths that are allowed to import/call validateBody — the definition file
// and its test.
const VALIDATE_BODY_ALLOWLIST_RE =
  /\/apps\/server\/src\/http\/validate(?:\.test)?\.[jt]sx?$/;

const preferParseBodyOverValidateBody = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer throw-based parseBody/parseQuery over sentinel validateBody/validateQuery in Express handlers",
      recommended: false,
      url: "docs/04-governance/governance/rules/prefer-parse-body.md",
    },
    schema: [],
    messages: {
      preferParseBody: PREFER_PARSE_BODY_MESSAGE,
      preferParseQuery: PREFER_PARSE_QUERY_MESSAGE,
    },
  },
  create(context) {
    const filename =
      typeof context.filename === "string"
        ? context.filename
        : typeof context.getFilename === "function"
          ? context.getFilename()
          : "";
    const normalized = filename.replace(/\\/g, "/");

    // Only lint server handler files.
    if (!/\/apps\/server\//.test(normalized)) return {};
    // Skip the definition file and its test.
    if (VALIDATE_BODY_ALLOWLIST_RE.test(normalized)) return {};
    // Skip test files — legacy paths may appear in mocks/setup.
    if (/\.test\.[jt]sx?$/.test(normalized)) return {};

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "Identifier") return;
        if (callee.name === "validateBody") {
          context.report({ node, messageId: "preferParseBody" });
        } else if (callee.name === "validateQuery") {
          context.report({ node, messageId: "preferParseQuery" });
        }
      },
    };
  },
};

// ─── no-raw-storage-key ──────────────────────────────────────────────────────
//
// Theme 5 (consolidated audit 2026-05-13): raw localStorage key string literals
// (e.g. `"finyk_tx_cache"`, `"hub_routine_v1"`) scattered across the codebase
// drift from the canonical `STORAGE_KEYS` registry in
// `packages/shared/src/lib/storageKeys.ts`. When a key is renamed/deprecated
// in the registry, inline literals silently keep reading the stale key.
//
// The rule fires on string literals (and template literals with no expressions)
// passed as the first argument to any of the storage helper functions:
//   - `safeReadLS`, `safeWriteLS`, `safeReadStringLS`, `safeWriteStringLS`,
//     `safeRemoveLS`, `safeParseLS`, `useLocalStorageState`,
//     `readLS`, `lsSet`, `lsGet`, `ls`, `readAllData`.
//
// Known literal values come from the STORAGE_KEYS registry. The allowlist covers
// legitimate string-only callsites (e.g. cache keys that are not storage reads,
// migration helpers, legacy read-one-shot helpers). Severity: `warn` — the
// burndown list is large; wire error only after the sweep is complete.
//
// Burn-down target: 2026-Q3. See audit docs/audits/2026-05-13-consolidated-page-audit.md § Theme 5.

const RAW_STORAGE_KEY_LITERALS = new Set([
  // Core 4 module data keys
  "finyk_tx_cache",
  "hub_routine_v1",
  "nutrition_log_v1",
  "fizruk_workouts_v1",
  // Finyk family
  "finyk_tx_cache_last_good",
  "finyk_info_cache",
  "finyk_show_balance_v1",
  "finyk_hidden",
  "finyk_hidden_txs",
  "finyk_excluded_stat_txs",
  "finyk_budgets",
  "finyk_subs",
  "finyk_assets",
  "finyk_debts",
  "finyk_recv",
  "finyk_monthly_plan",
  "finyk_tx_cats",
  "finyk_tx_splits",
  "finyk_mono_debt_linked",
  "finyk_networth_history",
  "finyk_custom_cats_v1",
  "finyk_manual_expenses_v1",
  "finyk_tx_filters_v1",
  "finyk_tx_day_collapse_v1",
  // Fizruk family
  "fizruk_exercises_v1",
  "fizruk_custom_exercises_v1",
  "fizruk_workout_templates_v1",
  "fizruk-storage-monthly-plan",
  "fizruk_monthly_plan_v1",
  "fizruk_plan_template_v1",
  "fizruk_wellbeing_v1",
  "fizruk_measurements_v1",
  "fizruk_selected_template_id_v1",
  "fizruk_active_workout_id_v1",
  "fizruk_active_program_id_v1",
  "fizruk_daily_log_v1",
  "fizruk_rest_settings_v1",
  // Nutrition family
  "nutrition_pantries_v1",
  "nutrition_active_pantry_v1",
  "nutrition_prefs_v1",
  "nutrition_recipe_book_v1",
  // Hub family
  "hub_dark_mode_v1",
  "hub_last_module",
  "hub_routine_main_tab_v1",
  "hub_nutrition_main_tab_v1",
  "hub_onboarding_done_v1",
  "hub_dashboard_order_v1",
  "hub_prefs_v1",
  "hub_user_profile_v1",
  "hub_biometrics_v1",
  "hub_dashboard_density_v1",
  "hub_weekly_digest_monday_auto_v1",
]);

const RAW_STORAGE_HELPER_NAMES = new Set([
  "safeReadLS",
  "safeWriteLS",
  "safeReadStringLS",
  "safeWriteStringLS",
  "safeRemoveLS",
  "safeParseLS",
  "useLocalStorageState",
  "readLS",
  "lsSet",
  "lsGet",
  "ls",
]);

const NO_RAW_STORAGE_KEY_MESSAGE =
  "Raw localStorage key literal '{{key}}' — use `STORAGE_KEYS.<NAME>` from `@sergeant/shared` instead. " +
  "Inline string literals drift from the registry when keys are renamed/deprecated. " +
  "See docs/audits/2026-05-13-consolidated-page-audit.md § Theme 5. " +
  "Burn-down: 2026-Q3.";

function extractStringValue(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (
    node.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    const cooked = node.quasis[0].value && node.quasis[0].value.cooked;
    return typeof cooked === "string" ? cooked : null;
  }
  return null;
}

const noRawStorageKey = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Forbid raw localStorage key string literals in storage helper calls — use STORAGE_KEYS.* from @sergeant/shared.",
    },
    schema: [],
    messages: { rawKey: NO_RAW_STORAGE_KEY_MESSAGE },
  },
  create(context) {
    const filename = (
      context.filename ??
      context.getFilename?.() ??
      ""
    ).replace(/\\/g, "/");
    // Exempt: the registry itself, test files, stories, migration/seed helpers.
    if (
      /storageKeys\.(ts|js)/.test(filename) ||
      /storageManager\.(ts|js)/.test(filename) ||
      /residualImport\.(ts|js)/.test(filename) ||
      /seedDemoData/.test(filename) ||
      /cleanupDemoData/.test(filename) ||
      /presetApply/.test(filename) ||
      /\.test\.(ts|tsx|js|jsx)$/.test(filename) ||
      /(^|\/)__tests__\//.test(filename) ||
      /\.stories\.(ts|tsx|js|jsx)$/.test(filename) ||
      /searchCache\.(ts|js)/.test(filename)
    ) {
      return {};
    }
    return {
      CallExpression(node) {
        const callee = node.callee;
        let name = null;
        if (callee.type === "Identifier") {
          name = callee.name;
        } else if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier"
        ) {
          name = callee.property.name;
        }
        if (!name || !RAW_STORAGE_HELPER_NAMES.has(name)) return;
        const firstArg = node.arguments[0];
        const value = extractStringValue(firstArg);
        if (value !== null && RAW_STORAGE_KEY_LITERALS.has(value)) {
          context.report({
            node: firstArg,
            messageId: "rawKey",
            data: { key: value },
          });
        }
      },
    };
  },
};

// ─── no-adhoc-metric-aggregation ────────────────────────────────────────
//
// Реєстр метрик (`docs/02-engineering/architecture/metric-registry.md`),
// стадія 5. Аудит показав, що та сама метрика мала 4-6 незалежних
// реалізацій і числа розходились у користувача на різних екранах в одну
// хвилину. Cutover звів їх на канонічні функції доменних пакетів; це
// правило не дає наступному інлайн-редьюсу знову розійтися.
//
// Ловить РІВНО одну форму: інлайн-перетворення копійок у гривні для
// ВИТРАТИ (`Math.abs(<tx>.amount / 100)`) в **акумуляторі** — тобто
// підрахунок суми витрат за набором транзакцій вручну. Це буквально тіло
// `getTxStatAmount` з `@sergeant/finyk-domain`, тільки без сплітів, тому
// кожне таке місце тихо втрачає спліти і розходиться з каноном.
//
// Навмисно НЕ ловить (інакше правило кричало б вовк):
//   - показ однієї суми: `const total = Math.abs(tx.amount / 100)`,
//     фільтр за діапазоном, рядок пошуку, підпис у JSX;
//   - дохід (`t.amount / 100` без `Math.abs`) — додатні суми не потребують
//     модуля, і канонічної функції для доходу реєстр не має;
//   - будь-яку іншу арифметику з `/ 100` (відсотки, ккал на 100 г, кути).
//
// `Math.abs` — не косметика, а сам дискримінатор: витрати зберігаються
// відʼємними, тож модуль бере рівно той код, що сумує витрати.
//
// Доменні пакети (`packages/*-domain/**`) звільнені — там канон і живе.

const ADHOC_METRIC_MESSAGE =
  "Інлайн-підрахунок витрат: `Math.abs(<tx>.amount / 100)` в акумуляторі. " +
  "Це копія `getTxStatAmount` без сплітів — число розійдеться з рештою екранів. " +
  "Використай канонічну функцію з `@sergeant/finyk-domain` " +
  "(`getTxStatAmount`, `calcCategorySpent`, `calcFinykPeriodAggregate`). " +
  "Реєстр метрик: docs/02-engineering/architecture/metric-registry.md.";

/** `<expr>.amount / 100` — інлайн-перетворення копійок у гривні. */
function isMinorAmountDivision(node) {
  if (!node || node.type !== "BinaryExpression" || node.operator !== "/") {
    return false;
  }
  const { left, right } = node;
  if (right.type !== "Literal" || right.value !== 100) return false;
  const target = left.type === "CallExpression" ? left.arguments[0] : left;
  return (
    !!target &&
    target.type === "MemberExpression" &&
    !target.computed &&
    target.property.type === "Identifier" &&
    target.property.name === "amount"
  );
}

function isMathAbsCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "Math" &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "abs"
  );
}

/** `Math.abs(x.amount / 100)` або `Math.abs(x.amount) / 100`. */
function isAbsoluteSpendAmount(node) {
  if (isMathAbsCall(node)) return isMinorAmountDivision(node.arguments[0]);
  return (
    isMinorAmountDivision(node) &&
    node.left.type === "CallExpression" &&
    isMathAbsCall(node.left)
  );
}

function isReduceCallback(fn) {
  const call = fn.parent;
  return (
    !!call &&
    call.type === "CallExpression" &&
    call.arguments[0] === fn &&
    call.callee.type === "MemberExpression" &&
    !call.callee.computed &&
    call.callee.property.type === "Identifier" &&
    call.callee.property.name === "reduce"
  );
}

/**
 * Сума накопичується? `acc += X`, `acc[k] = (acc[k] || 0) + X`,
 * або `X` в `+`-ланцюжку, що повертається з `.reduce`-колбека.
 */
function isAccumulatedTerm(node) {
  let cur = node;
  let parent = cur.parent;
  let sawPlus = false;
  while (parent) {
    if (parent.type === "BinaryExpression" && parent.operator === "+") {
      sawPlus = true;
    } else if (parent.type === "AssignmentExpression") {
      return parent.operator === "+=" || sawPlus;
    } else if (parent.type === "ReturnStatement") {
      return sawPlus;
    } else if (
      parent.type === "ArrowFunctionExpression" ||
      parent.type === "FunctionExpression"
    ) {
      return sawPlus && isReduceCallback(parent);
    } else if (
      parent.type !== "ConditionalExpression" &&
      parent.type !== "LogicalExpression"
    ) {
      return false;
    }
    cur = parent;
    parent = cur.parent;
  }
  return false;
}

const noAdhocMetricAggregation = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid ad-hoc spending aggregation (`Math.abs(tx.amount / 100)` accumulated by hand) outside the domain packages — metrics must go through the canonical functions listed in the metric registry.",
    },
    schema: [],
    messages: { adhocAggregation: ADHOC_METRIC_MESSAGE },
  },
  create(context) {
    const filename = (
      context.filename ??
      context.getFilename?.() ??
      ""
    ).replace(/\\/g, "/");
    // Доменні пакети — місце, де канон і живе.
    if (/packages\/[^/]*-domain\//.test(filename)) return {};

    function check(node) {
      if (!isAbsoluteSpendAmount(node)) return;
      if (!isAccumulatedTerm(node)) return;
      context.report({ node, messageId: "adhocAggregation" });
    }

    return { CallExpression: check, BinaryExpression: check };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// ── require-toast-error-action ──────────────────────────────────────────
//
// `toast.error(...)` мусить нести recovery-дію `{ label, onClick }`.
//
// Історія. Правило з такою ж назвою існувало до ADR-0081 і було retired
// разом із рештою «естетичних» AST-правил — з тезою, що коректність дії
// залежить від сценарію й не має надійного синтаксичного сигналу. Теза
// правильна, висновок — ні: за пів року без гейта з 37 error-тостів у
// `apps/web` дію мали ТРИ. Решта 34 лишали користувача в глухому куті
// («Не вдалося оновити аватар» — і все).
//
// Тому правило повертається, але у формі, яка визнає ту саму тезу:
// синтаксично воно ловить лише ФАКТ відсутності дії, а рішення «тут дії
// справді бути не може» фіксується явним записом в `allowlist` — з
// причиною в коді конфіга. Тобто гейт не вирішує за людину, а вимагає,
// щоб мовчазний глухий кут став свідомим і підписаним.
//
// Виявляє `toast.error(...)`, `t.error(...)`, `toastApi.error(...)` — усе,
// де обʼєкт-приймач названий `*toast*` (case-insensitive), плюс голий
// `error(...)`, деструктурований з `useToast()`. Третій аргумент має бути
// обʼєктним літералом із `label` і `onClick`, або ідентифікатором /
// spread-ом (тоді довіряємо — форма не читається статично).
const REQUIRE_TOAST_ERROR_ACTION_MESSAGE =
  '`toast.error()` без recovery-дії лишає користувача в глухому куті: він не знає, чи буде нова спроба і що робити далі. Додай третім аргументом `{ label, onClick }` (напр. `{ label: "Повторити", onClick: retry }`). Якщо дії справді не може бути — валідація файлу, rate-limit із поясненням у копії, помилка форми, що вже видно інлайном — додай файл у `allowlist` цього правила з коментарем-причиною.';

function isToastReceiver(node) {
  if (!node) return false;
  if (node.type === "Identifier") return /toast/i.test(node.name);
  // `this.toast.error(...)` / `ctx.toast.error(...)`
  if (
    node.type === "MemberExpression" &&
    node.property?.type === "Identifier"
  ) {
    return /toast/i.test(node.property.name);
  }
  return false;
}

function hasToastAction(args) {
  const action = args[2];
  if (!action) return false;
  // Не object-literal (змінна, spread, виклик) — статично не прочитати,
  // довіряємо авторові.
  if (action.type !== "ObjectExpression") return true;
  let hasLabel = false;
  let hasClick = false;
  for (const prop of action.properties) {
    if (prop.type === "SpreadElement") return true;
    const key = prop.key;
    const name =
      key?.type === "Identifier"
        ? key.name
        : key?.type === "Literal"
          ? String(key.value)
          : null;
    if (name === "label") hasLabel = true;
    if (name === "onClick") hasClick = true;
  }
  return hasLabel && hasClick;
}

const requireToastErrorAction = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a `{ label, onClick }` recovery action on `toast.error(...)`; exempt files must be listed in `allowlist` with a reason.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowlist: {
            type: "array",
            items: { type: "string" },
            description:
              "Project-relative file paths (forward-slash) exempt from the rule. " +
              "Кожен запис — свідоме рішення; тримай причину коментарем поруч.",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: { needsAction: REQUIRE_TOAST_ERROR_ACTION_MESSAGE },
  },
  create(context) {
    const options = context.options[0] || {};
    const allowlist = options.allowlist || [];
    const filename = (
      context.filename ??
      context.getFilename?.() ??
      ""
    ).replace(/\\/g, "/");

    for (const entry of allowlist) {
      const norm = entry.replace(/\\/g, "/").replace(/^\.\//, "");
      if (filename === norm || filename.endsWith("/" + norm)) return {};
    }
    // Тести, stories і сам toast-примітив живуть за іншими правилами.
    if (
      /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filename) ||
      /(^|\/)__tests__\//.test(filename) ||
      /\.stories\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filename)
    ) {
      return {};
    }

    // Імена, деструктуровані з `useToast()` — щоб голий `error("…")` теж
    // ловився, а не лише `toast.error("…")`.
    const destructuredErrorNames = new Set();

    return {
      VariableDeclarator(node) {
        if (node.id?.type !== "ObjectPattern") return;
        const init = node.init;
        if (
          init?.type !== "CallExpression" ||
          init.callee?.type !== "Identifier" ||
          init.callee.name !== "useToast"
        ) {
          return;
        }
        for (const prop of node.id.properties) {
          if (prop.type !== "Property") continue;
          if (prop.key?.type !== "Identifier" || prop.key.name !== "error") {
            continue;
          }
          const local = prop.value;
          if (local?.type === "Identifier") {
            destructuredErrorNames.add(local.name);
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        const isMemberCall =
          callee?.type === "MemberExpression" &&
          callee.property?.type === "Identifier" &&
          callee.property.name === "error" &&
          !callee.computed &&
          isToastReceiver(callee.object);
        const isBareCall =
          callee?.type === "Identifier" &&
          destructuredErrorNames.has(callee.name);
        if (!isMemberCall && !isBareCall) return;
        if (hasToastAction(node.arguments)) return;
        context.report({ node, messageId: "needsAction" });
      },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// `no-raw-motion-value` — сирі тривалості й криві в className.
//
// Токени руху існують у `theme.css` і прокинуті в Tailwind
// (`duration-fast|base|slow|slower|slowest`, `ease-standard|…`). До
// 2026-08-06 компонентний код їх НЕ знав: 141 сирий літерал у пʼяти
// значеннях проти двох через токен, причому шкали навіть не збігались —
// `duration-200` ≠ `--motion-duration-base` (220 ms).
//
// Без цього правила прохід розпадеться: `duration-200` лишається
// валідним класом Tailwind, тож наступний автор напише його не зі зла, а
// тому, що воно працює.
const RAW_MOTION_VALUE_MESSAGE =
  "Сира тривалість чи крива в className. Візьми токен: duration-{instant|fast|base|slow|slower|slowest} або ease-{standard|emphasized|accelerate|decelerate|overshoot}. Шкала — apps/web/src/styles/theme.css, обґрунтування — анти-слоп §4/П5.";

const RAW_MOTION_RE = new RegExp(
  "(?:^|[\\s\"'`])(?:[a-z-]+:)*(?:duration-(?:\\d+|\\[[^\\]]+\\])|ease-(?:in-out|in|out|linear)(?![-a-z]))",
);

// Друга половина правила: імʼя ТОКЕНА, що потрапило в CSS-літерал.
//
// AI-DANGER: `ease-standard` — клас Tailwind, а НЕ функція плавності.
// Опинившись у рядку `transition: transform 0.2s ease-standard`, воно
// робить усю декларацію невалідною, і браузер її мовчки відкидає: перехід
// стає миттєвим, анімація не запускається взагалі. Нічого не падає.
//
// Саме так і сталося 2026-08-06: прохід П5 замінював `ease-out` на
// `ease-standard` регуляркою, і чотири інлайнові стилі (BreathingMeshDemo,
// EmptyStateIdleDemo, PullToRefreshIndicator, SwipeToAction) отримали
// клас туди, де потрібна змінна. У CSS-літералі правильна форма —
// `var(--motion-ease-standard)` і `var(--motion-duration-base)`.
// Токен, що НЕ є частиною `var(--motion-…)`.
const MOTION_TOKEN_NAME_RE =
  /(?<!--motion-)\b(?:ease-(?:standard|emphasized|accelerate|decelerate|overshoot)|duration-(?:instant|fast|base|slow|slower|slowest))\b/;

// Ознаки, що рядок — це CSS, а не список класів:
//   1. літерал часу (`0.2s`, `320ms`) — у className його не буває;
//   2. декларація `animation:` / `transition:` з двокрапкою (клас
//      `transition-[…]` двокрапки не має, тож сюди не потрапляє).
const CSS_TIME_RE = /\b\d+(?:\.\d+)?m?s\b/;
const CSS_DECLARATION_RE =
  /\b(?:animation|transition)(?:-(?:duration|timing-function))?\s*:/;

function isCssLiteralWithTokenName(value) {
  if (!MOTION_TOKEN_NAME_RE.test(value)) return false;
  return CSS_TIME_RE.test(value) || CSS_DECLARATION_RE.test(value);
}

const CSS_LITERAL_TOKEN_MESSAGE =
  "Імʼя Tailwind-класу в CSS-літералі: `ease-standard` / `duration-base` тут НЕ працюють — браузер відкине всю декларацію мовчки. Візьми змінну: var(--motion-ease-standard), var(--motion-duration-base).";

const rawMotionValue = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid raw Tailwind duration/easing literals in className — use the motion tokens forwarded from theme.css.",
    },
    schema: [],
    messages: {
      rawMotion: RAW_MOTION_VALUE_MESSAGE,
      cssLiteralToken: CSS_LITERAL_TOKEN_MESSAGE,
    },
  },
  create(context) {
    const check = (node, value) => {
      if (typeof value !== "string") return;
      if (isCssLiteralWithTokenName(value)) {
        context.report({ node, messageId: "cssLiteralToken" });
        return;
      }
      if (!RAW_MOTION_RE.test(value)) return;
      context.report({ node, messageId: "rawMotion" });
    };
    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value && (node.value.cooked ?? node.value.raw));
      },
    };
  },
};

// ─── no-opacity-on-text-token ──────────────────────────────────────────
//
// Анти-слоп, атрактор 9 (аудит 2026-08-08). `--c-subtle` і `--c-muted`
// підібрані так, щоб сидіти РІВНО на порозі WCAG AA — це записано в
// `theme.css` прямим текстом («tertiary, WCAG AA ≥4.5:1 on
// panel/panel-hi/bg»). Наслідок арифметичний, не смаковий: будь-яка
// прозорість нижче 100% виводить такий текст під поріг.
//
//   subtle #6b645d на фоні сторінки #ecebe7:
//     100% → 4.88   /80 → 3.32   /70 → 2.76   /60 → 2.34
//
// Гейт контрасту (`packages/design-tokens/contrast.test.js`) цього не
// ловить і не може: він перевіряє ЗНАЧЕННЯ токенів, а `/70` дописують
// у className, тобто на місці використання. Це той самий механізм, що
// дав три копії семантичних тирів і хекс, який їхав через застосунок:
// інваріант захищено там, де його визначають, і не захищено там, де
// ним користуються. Правило закриває саме цей розрив.
//
// Семантичні кольори (`success`/`danger`/`warning`/`info`) тут теж є —
// вони ще темніші за subtle і так само не мають запасу під розведення.
const OPACITY_ON_TEXT_TOKEN_MESSAGE =
  "Прозорість на кольоровому токені тексту. Нейтральні токени підібрані рівно на порозі WCAG AA (subtle 4.88 на фоні сторінки), тож для них навіть /80 дає 3.3; `-strong` мають трохи запасу й тримаються до /80, але вже /70 їх валить. Бери тихіший ТОКЕН або `-strong` companion замість розведення. Винятки, де правило не застосовне, — hover-стан над правильною базою, вимкнений контрол і неозначальна іконка (поріг 3:1): познач їх `eslint-disable-next-line` з причиною. Заміри — анти-слоп §3.2, атрактор 9.";

// Суфікси обовʼязкові. Перша версія цього регексу дивилась лише на
// голі корені й пропускала 18 місць із 60 — `text-danger-strong/80`,
// `text-info-soft-fg/70` тощо. Той самий клас помилки, проти якого
// написано §8 анти-слоп канону («не описувати ціле за заміром
// підмножини»), і зроблений у гейті, що мав його ловити.
const OPACITY_ON_TEXT_TOKEN_RE =
  /\btext-(?:subtle|muted|text|success|danger|warning|info|brand|accent)(?:-(?:strong|soft|soft-fg))?\/\d{1,3}\b/;

const noOpacityOnTextToken = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid opacity modifiers on colour text tokens — their values already sit at the WCAG AA floor, so any dilution drops the text below 4.5:1.",
    },
    schema: [],
    messages: { opacityOnTextToken: OPACITY_ON_TEXT_TOKEN_MESSAGE },
  },
  create(context) {
    const check = (node, value) => {
      if (typeof value !== "string") return;
      if (!OPACITY_ON_TEXT_TOKEN_RE.test(value)) return;
      context.report({ node, messageId: "opacityOnTextToken" });
    };
    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value && (node.value.cooked ?? node.value.raw));
      },
    };
  },
};

// ─── no-raw-type-size ──────────────────────────────────────────────────
//
// Анти-слоп, атрактор 8 (аудит 2026-08-08). Правило вже було написане
// прозою — П4, пункт 5: «Без сирих `text-xs` / `text-sm`. Дві
// паралельні шкали = ієрархія, за якою не може стежити лінт». Замір
// показав 300 входжень у 116 файлах: правило лишилось текстом, тож
// його просто не виконували.
//
// Рівень `warn`, а не `error`, і це навмисно. Заміна НЕ механічна:
// `text-style-label` — це clamp(13→14px) плюс вага 500, а сирий
// `text-sm` — рівно 14px з успадкованою вагою. Тобто міграція змінює
// вигляд, і кожне місце потребує ока, а не sed-у. `error` тут зробив
// би гейт червоним від народження — рівно той стан «червоний завжди =
// вимкнений», проти якого цей репо вже боровся з бандл-бюджетами.
// Прецедент рівня — `prefer-kyiv-time: "warn"` у тому ж конфігу.
const RAW_TYPE_SIZE_MESSAGE =
  "Сирий розмір шрифта в className. Візьми семантичну роль: text-style-{display|headline|title|body|label|caption|overline|code}. Дві паралельні шкали дають ієрархію, за якою не стежить ніхто — анти-слоп §4/П4 правило 5, §3.2 атрактор 8.";

const RAW_TYPE_SIZE_RE =
  /(?:^|[\s"'`])(?:[a-z-]+:)*text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)(?![-a-z0-9])/;

const noRawTypeSize = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer the semantic type roles (text-style-*) over raw Tailwind font-size utilities in className.",
    },
    schema: [],
    messages: { rawTypeSize: RAW_TYPE_SIZE_MESSAGE },
  },
  create(context) {
    const check = (node, value) => {
      if (typeof value !== "string") return;
      if (!RAW_TYPE_SIZE_RE.test(value)) return;
      context.report({ node, messageId: "rawTypeSize" });
    };
    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value && (node.value.cooked ?? node.value.raw));
      },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// `ukrainian-copy` — гейт tone-of-voice для UA-копії
// ─────────────────────────────────────────────────────────────────────────
//
// Канон: `docs/01-product/copy/style-guide.uk.md`. До 2026-08-26 він був
// лише документом, і аудит копії показав, що без механічного гейта правила
// дрейфують саме в найновішому коді: довге тире жило в чек-скані, bulk-
// імпорті та Сільпо — тобто в тому, що писалося останнім.
//
// Три перевірки, усі — про рядки, які бачить людина:
//   1. EM_DASH — довге тире «—» у копії. §1.9: воно читається як «це писала
//      машина». Виняток — самотнє «—» як плейсхолдер порожнього значення,
//      бо там це символ, а не текст.
//   2. FORMAL_VY — «Ви/Вас/Вам/Ваш» та імператив множини («Спробуйте»).
//      §1.1: звертання лише на «ти».
//   3. FIRST_PERSON_PLURAL — «ми» у голосі продукту. §2.
//
// Що НЕ ловить: коментарі (ESLint не віддає їх як вузли), рядки без
// кирилиці, тести й stories (там копія запінена навмисно).
//
//   4. APOSTROPHE — `'` (U+0027) чи `’` (U+2019) між українськими
//      літерами. §1.10: канонічний апостроф — `ʼ` (U+02BC).
//
// Гейт апострофа зʼявився ТРЕТІМ кроком, і порядок тут важливіший за саму
// перевірку. Ці слова не завжди копія: у `packages/**` і `apps/server` ті
// самі рядки працюють ключами зіставлення й значеннями у сховищі
// користувача. Спроба замінити символ ПЕРШИМ ділом (2026-08-26) мовчки
// розірвала розпізнавання числівників і категоризацію ручних витрат — і
// була відкочена. Тому спершу кожна межа порівняння отримала
// `foldApostrophes` (`@sergeant/shared`), потім пройшла заміна у показі, і
// лише тепер стоїть цей гейт. Знімати його — лише разом із поверненням
// перших двох кроків.

const UKRAINIAN_COPY_MESSAGES = {
  emDash:
    "Довге тире «—» у копії читається як ШІ-текст (канон §1.9). " +
    "Заміни на кому, двокрапку чи окреме речення; якщо тире несе граматику — коротке «–» (§9а).",
  formalVy:
    "Звертання до людини — на «ти» (канон §1.1). Знайдено формальне «{{found}}».",
  firstPersonPlural:
    "1-а особа множини заборонена (канон §2): «ми» створює дистанцію «команда проти користувача». " +
    "Голос асистента — 1-а однини («не раджу»), опис системи — 3-я однини. Знайдено «{{found}}».",
  apostrophe:
    "Український апостроф — «ʼ» (U+02BC), канон §1.10. Знайдено «{{found}}»: " +
    "`'` і `’` це лапки, а не літера, тож пошук по слову з одним символом не знаходить слово з іншим. " +
    "Якщо цей рядок — КЛЮЧ зіставлення чи значення у сховищі, не міняй символ наосліп: " +
    "спершу згорни форми через `foldApostrophes` на межі порівняння.",
};

const RX_EM_DASH_IN_COPY = /\S\s*—\s*\S/;
const RX_FORMAL_PRONOUN =
  /(^|[\s"'`>(«])(Ви|Вас|Вам|Ваш[а-яіїєґ]*)([\s,.!?»]|$)/;
const RX_IMPERATIVE_PLURAL =
  /(^|[\s"'`>(«])(с|С)проб(уй|ій)те|(п|П)еревірте|(в|В)ведіть|(н|Н)атисніть|(о|О)беріть|(в|В)иберіть|(д|Д)одайте|(с|С)творіть|(з|З)ачекайте|(о|О)новіть|(з|З)аповніть|(у|У)війдіть|(о|О)чистіть|(з|З)мініть|(в|В)идаліть|(з|З)бережіть|(п|П)очніть|(в|В)імкніть|(в|В)имкніть|(п|П)оверніться|(х|Х)вилюйтесь/;

// «Ми» як займенник + характерні закінчення 1-ї особи множини теперішнього
// й майбутнього часу. Коментарі сюди не потрапляють — правило ходить лише
// по Literal / JSXText / TemplateElement, а розробницьке «ми» живе саме в
// коментарях, тож шуму від нього нема.
// `…` у класі завершальних символів обовʼязкове: найчастіша форма 1-ї
// множини в цьому коді — саме спінер «Завантажуємо…», і без трикрапки
// правило мовчало б рівно там, де порушення трапляється найчастіше
// (знайдено юніт-тестом до цього правила, а не на кодовій базі).
// Апостроф у показі: `'` або `’` між українськими літерами. Саме «між
// літерами» — інакше правило ловило б звичайні лапки навколо слова
// («'Готово'») і англійські контракції, які до §1.10 стосунку не мають.
const RX_APOSTROPHE = /[а-яіїєґА-ЯІЇЄҐ](['’])[а-яіїєґА-ЯІЇЄҐ]/;

const RX_FIRST_PERSON_PLURAL =
  /(^|[\s"'`>(«])(М|м)и\s+[а-яіїєґ]|[а-яіїєґ]{2}(аємо|уємо|юємо|имемо|немо|ємо)(\s|[.,!?»…:;)]|$)/;

// Непробільний сентинел на місці інтерполяції: каже «тут вираз МОЖЕ
// віддати текст». Потрібен лише перевірці тире, яка дивиться на сусідів
// зліва й справа; решту патернів ним годувати не можна — вони мають
// класи меж (`[\s"'`>(«]`, `[\s,.!?»…:;)]`), і чужий символ у них
// зламав би збіг. Тому дві версії рядка, а не одна.
const UA_EXPR_SENTINEL = "\u0001";

function ukrainianCopyViolations(text, emDashText = text) {
  if (!RX_CYRILLIC.test(text)) return [];
  const out = [];
  // Плейсхолдер порожнього значення — символ, не копія.
  if (emDashText.trim() !== "—" && RX_EM_DASH_IN_COPY.test(emDashText)) {
    out.push({ messageId: "emDash", data: {} });
  }
  const pronoun = RX_FORMAL_PRONOUN.exec(text);
  if (pronoun) {
    out.push({ messageId: "formalVy", data: { found: pronoun[2] } });
  } else {
    const verb = RX_IMPERATIVE_PLURAL.exec(text);
    if (verb)
      out.push({ messageId: "formalVy", data: { found: verb[0].trim() } });
  }
  const apostrophe = RX_APOSTROPHE.exec(text);
  if (apostrophe) {
    out.push({ messageId: "apostrophe", data: { found: apostrophe[1] } });
  }
  const plural = RX_FIRST_PERSON_PLURAL.exec(text);
  if (plural) {
    out.push({
      messageId: "firstPersonPlural",
      data: { found: plural[0].trim() },
    });
  }
  return out;
}

const ukrainianCopy = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce UA copy tone-of-voice: no em-dash, informal «ти», no first-person plural.",
    },
    messages: UKRAINIAN_COPY_MESSAGES,
    schema: [
      {
        type: "object",
        properties: {
          allowlist: {
            type: "array",
            items: { type: "string" },
            description:
              "Project-relative file paths (forward-slash) that are exempt.",
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const { allowlist = [] } = context.options[0] ?? {};
    const filename = (context.filename ?? context.getFilename() ?? "").replace(
      /\\/g,
      "/",
    );
    if (
      /\.(test|spec)\.[jt]sx?$/.test(filename) ||
      filename.includes("/__tests__/") ||
      // Уся тека `tests/` — E2E/QA-обвʼязка, а не продукт. Крім спеків там
      // лежать матриці ручних прогонів (`tests/beta/betaMatrix.ts`,
      // `tests/profiles/profileMatrix.ts`), де «питання» адресовані
      // ТЕСТЕРУ, а не користувачу: «чи не продаємо платнику підписку
      // вдруге?». Це внутрішній документ у формі коду, і ToV продукту до
      // нього не застосовний. Самого `*.test.*` тут мало — ці файли так
      // не називаються.
      filename.includes("/tests/") ||
      /\.stories\.[jt]sx?$/.test(filename) ||
      // Запис allowlist — або конкретний файл (`endsWith`), або каталог
      // (`.../<p>/...`). Без другої гілки виняток на теку мовчки не діяв би.
      allowlist.some((p) => filename.endsWith(p) || filename.includes(`${p}/`))
    ) {
      return {};
    }
    const report = (node, text, emDashText = text) => {
      for (const v of ukrainianCopyViolations(text, emDashText)) {
        context.report({ node, messageId: v.messageId, data: v.data });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") report(node, node.value);
      },
      JSXText(node) {
        report(node, node.value);
      },
      // Літерал перевіряємо ЦІЛИМ, а не поквазі: тире часто стоїть саме
      // на межі інтерполяції, і поквазі там не збігається нічого.
      //
      // Але одного склеювання мало, і це коштувало другого заходу
      // (ревʼю CodeRabbit). Пробіл-роздільник рятує лише випадок, коли
      // ліворуч від тире вже є текст у своєму квазі: `Немає ${n} — …`
      // дає «Немає   — …», де `\S\s*—` збігається на «є». А коли квазі
      // ПОРОЖНІЙ — `${name} — …` — квазі це ["", " — …"], склейка дає
      // самі пробіли перед тире, і порушення знову проходить повз. Те
      // саме між двома інтерполяціями: `${a} — ${b} грн`.
      //
      // Тому перевірці тире віддаємо версію із сентинелом на місці
      // виразу (він і означає «тут може бути текст»), а решті патернів —
      // версію з пробілом: їхні класи меж чужого символу не приймають.
      // Повідомляємо один раз — обидві версії йдуть в один виклик.
      TemplateLiteral(node) {
        const parts = node.quasis.map((q) => q.value.cooked ?? q.value.raw);
        report(node, parts.join(" "), parts.join(UA_EXPR_SENTINEL));
      },
    };
  },
};

const plugin = {
  rules: {
    "ukrainian-copy": ukrainianCopy,
    "no-opacity-on-text-token": noOpacityOnTextToken,
    "no-raw-type-size": noRawTypeSize,
    "no-raw-tracked-storage": noRawTrackedStorage,
    "no-raw-local-storage": noRawLocalStorage,
    "no-finyk-token-in-storage": noFinykTokenInStorage,
    "ai-marker-syntax": aiMarkerSyntax,
    "no-bigint-string": noBigintString,
    "rq-keys-only-from-factory": rqKeysOnlyFromFactory,
    "no-anthropic-key-in-logs": noAnthropicKeyInLogs,
    "no-console-pii": noConsolePii,
    "no-raw-req-in-pino-log": noRawReqInPinoLog,
    "no-strict-bypass": noStrictBypass,
    "no-cyrillic-jsx-literal": noCyrillicJsxLiteral,
    "no-flat-shared-lib": noFlatSharedLib,
    "forbid-shell-only-feature": forbidShellOnlyFeature,
    "no-hash-router-in-modules": noHashRouterInModules,
    "prefer-kyiv-time": preferKyivTime,
    "no-inline-body-size-limit": noInlineBodySizeLimit,
    "prefer-parse-body-over-validate-body": preferParseBodyOverValidateBody,
    "no-raw-storage-key": noRawStorageKey,
    "no-adhoc-metric-aggregation": noAdhocMetricAggregation,
    "require-toast-error-action": requireToastErrorAction,
    "no-raw-motion-value": rawMotionValue,
  },
};

export {
  TRACKED_STORAGE_KEY_NAMES,
  TRACKED_STORAGE_KEY_VALUES,
  RAW_TRACKED_STORAGE_MESSAGE,
  RAW_LOCAL_STORAGE_MESSAGE,
  DEFAULT_NUMERIC_COLUMNS,
  RQ_KEYS_MESSAGE,
  DEFAULT_FACTORY_PATH,
  NO_ANTHROPIC_KEY_MESSAGE,
  NO_CONSOLE_PII_MESSAGE,
  NO_STRICT_BYPASS_MESSAGES,
  DEFAULT_FORBID_PATTERNS,
  NO_CYRILLIC_JSX_LITERAL_MESSAGE,
  NO_FLAT_SHARED_LIB_MESSAGE,
  NO_FLAT_SHARED_LIB_ALLOWED_TOP,
  NO_HASH_ROUTER_MESSAGE,
  PREFER_KYIV_TIME_MESSAGE,
  PREFER_PARSE_BODY_MESSAGE,
  PREFER_PARSE_QUERY_MESSAGE,
  RAW_STORAGE_KEY_LITERALS,
  RAW_STORAGE_HELPER_NAMES,
  NO_RAW_STORAGE_KEY_MESSAGE,
  REQUIRE_TOAST_ERROR_ACTION_MESSAGE,
  RAW_MOTION_VALUE_MESSAGE,
  CSS_LITERAL_TOKEN_MESSAGE,
  OPACITY_ON_TEXT_TOKEN_MESSAGE,
  RAW_TYPE_SIZE_MESSAGE,
};

export default plugin;
