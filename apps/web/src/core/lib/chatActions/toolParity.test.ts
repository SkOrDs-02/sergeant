/**
 * Web-side parity gate for audit gap #2 (2026-08): every canonical HubChat
 * tool name declared in the shared registry
 * (`packages/shared/src/hubchat/toolNames.ts`, `ALL_HUBCHAT_TOOL_NAMES`)
 * must be dispatched by *some* executor under
 * `apps/web/src/core/lib/chatActions/` — and every executor `case` label
 * must in turn be a canonical registry name. Without this, a tool can be:
 *
 *   (a) declared server-side and offered to Anthropic, but silently no-op
 *       on the client because no `case` label handles it
 *       (`hubChatActions.ts`'s dispatch chain falls through to
 *       "Невідома дія: <name>"), or
 *   (b) wired as a client `case` label the model is never told about — dead
 *       code, or worse, a typo'd tool name that never fires.
 *
 * Mirrors the server-side gate at
 * `apps/server/src/modules/chat/toolDefs/toolNamesRegistry.test.ts`, but the
 * web dispatch chain is a set of `switch (action.name)` statements spread
 * across `chatActions/*.ts` (not an array of tool-def objects with a
 * `.name`), and several tools are legitimately implemented in a *different*
 * domain file than the registry group they are categorized under — e.g.
 * `log_weight` is grouped under `FIZRUK_TOOL_NAMES` but its executor lives
 * in `nutritionActions.ts`; `weight_chart`/`habit_trend` are grouped under
 * `CROSS_MODULE_TOOL_NAMES` but execute in `fizrukActions.ts` /
 * `routineActions.ts` respectively; `recall_memory`/`create_transaction`
 * dispatch through the async `serverActions.ts` branch, not the sync
 * `?? `-chain in `hubChatActions.ts`. So — unlike the server test — this
 * file compares the *flat* union of every dispatcher's handled names
 * against the *flat* `ALL_HUBCHAT_TOOL_NAMES`, not group-by-group.
 *
 * Extraction is static (regex over each dispatcher's function body, bounded
 * by brace-counting) rather than invoking the handlers — the handlers read
 * localStorage/SQLite warm caches and, in a couple of cases, fire real
 * network calls (e.g. `add_recipe` → `saveRecipeToBook`), so exercising all
 * 77 tool names through every handler here would need the same per-module
 * mocking `finykActions.test.ts` / `fizrukActions.test.ts` / etc. already
 * own — duplicating that setup here would just be a second, worse copy of
 * those suites. This file only asserts *which names are reachable*, not
 * *what each handler does* with them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_HUBCHAT_TOOL_NAMES, isHubChatToolName } from "@sergeant/shared";

const CHAT_ACTIONS_DIR = join(process.cwd(), "src/core/lib/chatActions");

/**
 * Every `ChatAction.name` dispatcher that `hubChatActions.ts` actually
 * calls (sync `dispatch()` `??`-chain in `hubChatActions.ts` plus the async
 * `handleAsyncChatAction` branch in `serverActions.ts`). Add a new entry
 * here alongside any new dispatcher — if a dispatcher is wired into
 * `hubChatActions.ts` but missing from this list, this test cannot see its
 * `case` labels and will under-report parity (registry names it handles
 * will look like false "missing executor" failures).
 */
const DISPATCHERS: ReadonlyArray<{
  readonly file: string;
  readonly fn: string;
}> = [
  { file: "finykActions.ts", fn: "handleFinykAction" },
  { file: "queryFinykActions.ts", fn: "handleQueryFinykAction" },
  { file: "fizrukActions.ts", fn: "handleFizrukAction" },
  { file: "queryFizrukActions.ts", fn: "handleQueryFizrukAction" },
  { file: "routineActions.ts", fn: "handleRoutineAction" },
  { file: "queryRoutineActions.ts", fn: "handleQueryRoutineAction" },
  { file: "nutritionActions.ts", fn: "handleNutritionAction" },
  { file: "queryNutritionActions.ts", fn: "handleQueryNutritionAction" },
  { file: "crossActions.ts", fn: "handleCrossAction" },
  // Async branch — `hubChatActions.executeAction(s)` routes names in
  // `ASYNC_CHAT_ACTION_NAMES` here BEFORE the sync `dispatch()` chain
  // above ever runs, so these cases never reach the sync dispatchers even
  // though `create_transaction` also has a fallback `case` in
  // `finykActions.ts` (unreachable via the primary dispatch order; kept
  // only as the offline-write path `handleCreateTransaction` calls
  // directly when the server round-trip fails).
  { file: "serverActions.ts", fn: "handleAsyncChatAction" },
];

/**
 * Explicit allowlist for canonical registry tool names that intentionally
 * have NO client-side `chatActions` executor — e.g. a tool answered
 * entirely server-side that never reaches a `tool_use` block the web app
 * must dispatch. Empty today: every one of the 77 canonical names
 * round-trips through a web executor (verified by the parity test below).
 *
 * If you add a genuinely server-only tool, add its name here WITH a comment
 * explaining why the web side never dispatches it — do not special-case it
 * silently in the assertions below.
 */
const SERVER_ONLY_TOOL_NAMES: ReadonlySet<string> = new Set([]);

/**
 * Strips `/* ... *\/` block comments (incl. JSDoc) and `// ...` line
 * comments. Applied before brace-counting / case-label extraction below so
 * a commented-out `case "x":` (dead code) doesn't count as a live executor,
 * and so stray `{`/`}` inside a comment can't desync the brace counter.
 * Safe for this file set specifically — verified none of the scanned
 * dispatcher files have a `//` inside a string literal (e.g. a URL) that
 * this would wrongly truncate.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Extracts the brace-balanced `{ ... }` body of `function <fnName>(` from
 * `source`. Brace-counting (not "grab everything after the declaration to
 * EOF") so it doesn't spill into unrelated code that happens to follow the
 * dispatcher in the same file — e.g. the `isDateKey` helper declared after
 * `handleRoutineAction`, or the `ASYNC_CHAT_ACTION_NAMES` set declared
 * after `handleAsyncChatAction` in `serverActions.ts`.
 */
function extractFunctionBody(
  source: string,
  fnName: string,
  file: string,
): string {
  const declMatch = new RegExp(`function\\s+${fnName}\\s*\\(`).exec(source);
  if (!declMatch) {
    throw new Error(
      `toolParity: could not find "function ${fnName}(" in ${file} — did ` +
        "the dispatcher get renamed or moved? Update DISPATCHERS in " +
        "toolParity.test.ts to match.",
    );
  }
  const braceStart = source.indexOf("{", declMatch.index);
  if (braceStart === -1) {
    throw new Error(
      `toolParity: no function body found for ${fnName} in ${file}`,
    );
  }
  let depth = 0;
  let i = braceStart;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  if (depth !== 0) {
    throw new Error(
      `toolParity: unbalanced braces while scanning ${fnName} in ${file} — ` +
        "extraction assumes no literal `{`/`}` characters inside string " +
        "literals; check for one if this fires.",
    );
  }
  return source.slice(braceStart, i);
}

/** `case "tool_name":` labels inside a (brace-bounded) dispatcher body. */
function extractCaseNames(body: string): string[] {
  const names: string[] = [];
  for (const m of body.matchAll(/case\s+"([a-zA-Z0-9_]+)"\s*:/g)) {
    const name = m[1];
    if (name) names.push(name);
  }
  return names;
}

/** Reads `file`, strips comments, and returns `fn`'s brace-bounded body. */
function readDispatcherBody(file: string, fn: string): string {
  const source = stripComments(
    readFileSync(join(CHAT_ACTIONS_DIR, file), "utf8"),
  );
  return extractFunctionBody(source, fn, file);
}

/**
 * name -> files whose dispatcher handles it. A name can legitimately be
 * handled in more than one file (e.g. `create_transaction`: async
 * `serverActions.ts` branch + the offline-fallback `case` in
 * `finykActions.ts`).
 */
const executorFilesByName = new Map<string, string[]>();
for (const { file, fn } of DISPATCHERS) {
  const body = readDispatcherBody(file, fn);
  for (const name of extractCaseNames(body)) {
    const files = executorFilesByName.get(name) ?? [];
    files.push(file);
    executorFilesByName.set(name, files);
  }
}

describe("HubChat tool-name registry parity (web executors, @sergeant/shared/hubchat/toolNames)", () => {
  it("sanity: every dispatcher contributes at least one case (extraction didn't silently regress)", () => {
    for (const { file, fn } of DISPATCHERS) {
      const body = readDispatcherBody(file, fn);
      const names = extractCaseNames(body);
      expect(
        names.length,
        `${file}#${fn} extracted 0 "case" labels — extraction regex or the ` +
          "dispatcher's switch shape likely changed",
      ).toBeGreaterThan(0);
    }
  });

  it.each(ALL_HUBCHAT_TOOL_NAMES)(
    'registry tool "%s" has a web executor (or is in SERVER_ONLY_TOOL_NAMES)',
    (name) => {
      if (SERVER_ONLY_TOOL_NAMES.has(name)) {
        expect(
          executorFilesByName.has(name),
          `"${name}" is listed in SERVER_ONLY_TOOL_NAMES as having no web ` +
            "executor, but chatActions/*.ts now handles it — the allowlist " +
            "entry is stale, remove it.",
        ).toBe(false);
        return;
      }
      expect(
        executorFilesByName.has(name),
        `"${name}" is in ALL_HUBCHAT_TOOL_NAMES but no chatActions/*.ts ` +
          `dispatcher has a case "${name}": — add an executor, or, if it is ` +
          "genuinely server-only, add it to SERVER_ONLY_TOOL_NAMES in " +
          "toolParity.test.ts with a comment explaining why.",
      ).toBe(true);
    },
  );

  it.each([...executorFilesByName.keys()])(
    'web executor "%s" is a canonical registry tool name',
    (name) => {
      expect(
        isHubChatToolName(name),
        `chatActions/*.ts handles "${name}" (in ` +
          `${executorFilesByName.get(name)?.join(", ")}) but it is not in ` +
          "ALL_HUBCHAT_TOOL_NAMES (packages/shared/src/hubchat/toolNames.ts) " +
          "— typo, or a stale/removed tool the server no longer declares.",
      ).toBe(true);
    },
  );

  it("SERVER_ONLY_TOOL_NAMES entries are themselves canonical registry names", () => {
    for (const name of SERVER_ONLY_TOOL_NAMES) {
      expect(
        isHubChatToolName(name),
        `SERVER_ONLY_TOOL_NAMES lists "${name}" but it is not a canonical ` +
          "ALL_HUBCHAT_TOOL_NAMES entry — fix the typo or remove it.",
      ).toBe(true);
    }
  });
});
