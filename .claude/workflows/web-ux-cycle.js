export const meta = {
  name: "web-ux-cycle",
  description:
    "Web task / UI-UX audit diagnosis for apps/web: map the touched surface and diagnose UI/UX defects via read-only fan-out, then return ranked findings + a browser-verification checklist. The fix + live-browser verification run serialized in the main session (see the /web-ux-cycle command).",
  whenToUse:
    'Invoked by the /web-ux-cycle command (hybrid orchestration). This workflow is the read-only fan-out half: it never edits files. Pass args={mode:"task"|"audit", target, routes?:[], taskDescription?, todayDate?}. Returns {mode, surfaceMap, findings[], plan, browserChecklist}.',
  phases: [
    {
      title: "Map",
      detail:
        "fan-out readers map the router, the target surface, and the design-system constraints in parallel",
    },
    {
      title: "Diagnose",
      detail:
        "task mode → build an implementation plan; audit mode → per-route UI/UX defect scan (static + rule hotspots)",
    },
    {
      title: "Verify",
      detail:
        "adversarial pass — drop false-positive findings (intentional data-compact, deliberate patterns)",
    },
    {
      title: "Synthesize",
      detail: "rank findings, emit a concrete browser-verification checklist",
    },
  ],
};

// ---- args ----------------------------------------------------------------
// `args` can arrive as a JSON-encoded STRING rather than a parsed object
// (observed on this harness when launched with an object payload). If we don't
// normalize, every `args.x` is undefined and the script silently falls back to
// ALL defaults (e.g. every route) — expensive and wrong. Parse defensively so
// both an object and a JSON string work.
let A = args;
if (typeof A === "string") {
  try {
    A = JSON.parse(A);
  } catch {
    A = {};
  }
}
A = A || {};

const MODE = A.mode === "task" ? "task" : "audit";
const TARGET = A.target || "apps/web";
const TASK = A.taskDescription || "";
const DEFAULT_ROUTES = ["/", "/finyk", "/fizruk", "/routine", "/nutrition"];
const ROUTES =
  Array.isArray(A.routes) && A.routes.length ? A.routes : DEFAULT_ROUTES;

phase("Map");
log(`mode=${MODE} target=${TARGET} routes=${ROUTES.join(", ")}`);

// ---- shared schemas ------------------------------------------------------
const MAP_SCHEMA = {
  type: "object",
  required: ["area", "summary", "files"],
  properties: {
    area: { type: "string" },
    summary: { type: "string", description: "what this slice of the app is" },
    files: {
      type: "array",
      items: {
        type: "object",
        required: ["path", "role"],
        properties: {
          path: { type: "string" },
          role: { type: "string", description: "what it does in one phrase" },
        },
      },
    },
    risks: {
      type: "array",
      items: { type: "string" },
      description: "fragile spots, hard-rule hotspots, lazy boundaries",
    },
  },
};

const FINDING = {
  type: "object",
  required: ["title", "severity", "category"],
  properties: {
    title: { type: "string" },
    route: { type: "string" },
    file: { type: "string", description: "path:line when known" },
    severity: {
      type: "string",
      enum: ["low", "medium", "high", "critical"],
    },
    category: {
      type: "string",
      enum: [
        "a11y",
        "layout",
        "design-token",
        "touch-target",
        "console-error",
        "network",
        "state",
        "responsive",
        "copy",
        "perf",
        "other",
      ],
    },
    evidence: { type: "string", description: "code excerpt or rule reference" },
    suggestedFix: { type: "string" },
    browserCheck: {
      type: "string",
      description: "exactly what to confirm in the live browser after the fix",
    },
  },
};

// ---- Phase: Map (parallel, read-only) ------------------------------------
const surfaceMap = (
  await parallel([
    () =>
      agent(
        `Read-only mapping task for the Sergeant monorepo (you are in a git worktree; cwd is the repo root).

Map the apps/web ROUTER and navigation shell.
1. Read apps/web/src/core/app/router.tsx (and any nested route files it references).
2. List the top-level routes, which component each renders, and which are lazy-loaded (lazyImport/lazyDefault boundaries).
3. Note where the target area "${TARGET}" lives in the route tree.

Return structured output. area="router". Cap at ~6 files.`,
        { label: "map:router", phase: "Map", schema: MAP_SCHEMA },
      ),
    () =>
      agent(
        `Read-only mapping task for the Sergeant monorepo (cwd = repo root).

Map the TARGET SURFACE: "${TARGET}".
1. Glob/grep to find the components, hooks, and modules that make up this surface.
2. For each key file note its role (component / hook / view-shell / store).
3. Note React Query usage: which queryKeys factory it uses (finykKeys, nutritionKeys, hubKeys, coachKeys, digestKeys, pushKeys, syncKeys, strategicKeys, billingKeys) — Hard Rule #2.
4. Flag any module over ~500 lines (Hard Rule #18 max-lines:600).

Return structured output. area="surface". Cap at ~12 files.`,
        { label: "map:surface", phase: "Map", schema: MAP_SCHEMA },
      ),
    () =>
      agent(
        `Read-only mapping task for the Sergeant monorepo (cwd = repo root).

Map the DESIGN-SYSTEM constraints that any UI fix must respect.
1. Read packages/design-tokens/tailwind-preset.js (opacity scale, touch-target utils) and apps/web/src/index.css (global touch-target safety-net, data-compact opt-out).
2. Read apps/web/src/shared/components/ui/Button.tsx (auto touch-target behavior).
3. Summarize the enforced rules an agent must not break: #8 opacity scale, #9 -strong companion behind text-white, #11 no arbitrary hex in className, #12 module-accent containment, #13 no raw light/dark palette pairs, #14 focus-visible not focus, #16 typography 12px floor, #17 animation budget.

Return structured output. area="design-system". risks[] = the rules most likely to be violated by a careless fix.`,
        { label: "map:design-system", phase: "Map", schema: MAP_SCHEMA },
      ),
  ])
).filter(Boolean);

const mapDigest = JSON.stringify(surfaceMap, null, 2).slice(0, 24000);

// ---- Phase: Diagnose -----------------------------------------------------
phase("Diagnose");

let findings = [];
let plan = null;

if (MODE === "task") {
  const PLAN_SCHEMA = {
    type: "object",
    required: ["steps", "filesToTouch", "browserVerification"],
    properties: {
      understanding: {
        type: "string",
        description: "restate the task in terms of the actual code",
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          required: ["order", "what", "where"],
          properties: {
            order: { type: "number" },
            what: { type: "string" },
            where: { type: "string", description: "file(s) / component" },
            risk: { type: "string", enum: ["low", "medium", "high"] },
          },
        },
      },
      filesToTouch: { type: "array", items: { type: "string" } },
      hardRuleWatch: {
        type: "array",
        items: { type: "string" },
        description: "which hard rules this change is most likely to trip",
      },
      browserVerification: {
        type: "array",
        items: { type: "string" },
        description:
          "concrete things to confirm in the live browser (route + observable outcome)",
      },
      openQuestions: { type: "array", items: { type: "string" } },
    },
  };

  plan = await agent(
    `You are planning a web feature/change for the Sergeant monorepo. You are READ-ONLY: produce a plan, do not edit anything.

TASK from the user:
"""
${TASK}
"""

Surface map (from the fan-out readers):
${mapDigest}

Build a concrete, minimal-diff implementation plan:
- Restate the task against the real code (components, hooks, routes).
- Ordered steps, each with the exact file/component to touch.
- Files to touch (explicit paths).
- Which Hard Rules this change is most likely to trip (#1 bigint→number, #2 RQ keys, #8/#9/#11/#14 Tailwind, #18 max-lines, #19 noUncheckedIndexedAccess).
- A browser-verification list: for each user-visible outcome, the route to open and what to observe (no console errors, element renders, interaction works, no layout shift).
- Open questions only if genuinely blocking.

Match scope to the task — no surrounding cleanup, no premature abstractions. Return structured output.`,
    { label: "diagnose:plan", phase: "Diagnose", schema: PLAN_SCHEMA },
  );

  log(`task plan: ${plan ? plan.steps?.length || 0 : 0} steps`);
} else {
  // audit mode: per-route fan-out → diagnose, then adversarial verify per finding
  const DIAGNOSE_SCHEMA = {
    type: "object",
    required: ["route", "findings"],
    properties: {
      route: { type: "string" },
      findings: { type: "array", items: FINDING },
    },
  };

  const VERDICT_SCHEMA = {
    type: "object",
    required: ["isReal", "reason"],
    properties: {
      isReal: { type: "boolean" },
      reason: { type: "string" },
      severityAdjusted: {
        type: "string",
        enum: ["low", "medium", "high", "critical"],
      },
    },
  };

  phase("Verify");

  const perRoute = await pipeline(
    ROUTES,
    // Stage 1: diagnose one route (static analysis of the code behind it)
    (route) =>
      agent(
        `Read-only UI/UX defect scan for the Sergeant web app (cwd = repo root). NO edits.

Route under audit: "${route}"

Design-system + surface context:
${mapDigest}

Find UI/UX defects in the CODE that renders this route. Look for, with file:line evidence:
- a11y: missing aria-*, non-semantic interactive divs, no focus-visible (Rule #14 — focus: instead of focus-visible:), label/control mismatch.
- touch-target: interactive elements under 44x44 that are NOT Button and NOT data-compact (WCAG 2.5.5).
- design-token: arbitrary hex in className (Rule #11), off-scale opacity (Rule #8), raw light/dark palette pairs (Rule #13), saturated brand fill behind text-white without -strong (Rule #9).
- typography: font sizes below the 12px floor (Rule #16).
- layout / responsive: fixed widths that overflow on narrow viewports, missing min-w-0 in flex, content that can clip.
- state: unhandled loading/empty/error states, missing skeletons, flashes.
- copy: non-UA copy in user-facing strings, tone violations (docs/copy/style-guide.uk.md).

Only report DEFECTS you can point to in code. For each, give a suggestedFix and a precise browserCheck (what to confirm live after fixing). If the route renders cleanly, return an empty findings array. Return structured output.`,
        {
          label: `diag:${route === "/" ? "root" : route.replace(/\W+/g, "")}`,
          phase: "Diagnose",
          schema: DIAGNOSE_SCHEMA,
        },
      ),
    // Stage 2: adversarial verify each finding from this route
    async (routeResult, route) => {
      if (!routeResult || !routeResult.findings?.length)
        return { route, findings: [] };
      const verified = await parallel(
        routeResult.findings.map(
          (f) => () =>
            agent(
              `You are an adversarial reviewer. Try to REFUTE this UI/UX finding for the Sergeant web app. Default to isReal=false if the evidence is weak, the pattern is intentional (e.g. data-compact opt-out on heatmap cells, deliberate eslint-disable with a reason), or you cannot confirm it in the code.

Finding:
${JSON.stringify(f, null, 2)}

Read the cited file(s) yourself. Confirm the defect actually exists and is user-visible. Return structured output: isReal, reason, optional severityAdjusted.`,
              {
                label: `verify:${(f.category || "x").slice(0, 10)}`,
                phase: "Verify",
                schema: VERDICT_SCHEMA,
              },
            ).then((v) => ({ ...f, route, verdict: v })),
        ),
      );
      return { route, findings: verified.filter(Boolean) };
    },
  );

  findings = perRoute
    .filter(Boolean)
    .flatMap((r) => r.findings)
    .filter((f) => f.verdict && f.verdict.isReal)
    .map((f) => ({
      ...f,
      severity: f.verdict.severityAdjusted || f.severity,
    }));

  log(
    `audit: ${findings.length} confirmed findings across ${ROUTES.length} routes`,
  );
}

// ---- Phase: Synthesize ---------------------------------------------------
phase("Synthesize");

const sevRank = { critical: 0, high: 1, medium: 2, low: 3 };
findings.sort(
  (a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9),
);

const browserChecklist =
  MODE === "task"
    ? (plan && plan.browserVerification) || []
    : findings.map((f) => ({
        route: f.route,
        check: f.browserCheck || f.title,
        severity: f.severity,
      }));

return {
  mode: MODE,
  target: TARGET,
  routes: ROUTES,
  surfaceMap,
  findings,
  plan,
  browserChecklist,
  counts: {
    findings: findings.length,
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
  },
};
