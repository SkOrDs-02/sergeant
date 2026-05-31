export const meta = {
  name: "audits-runner",
  description:
    "Triage (and optionally execute) open audits from docs/open-work.md",
  whenToUse:
    'When the user wants a prioritized action plan across docs/audits/* or wants to fan out execution. Pass args={mode:"triage"|"execute", limit?:N, filter?:"substring"}.',
  phases: [
    {
      title: "Parse",
      detail: "read docs/open-work.md, extract audits section",
    },
    {
      title: "Triage",
      detail:
        "per-audit: read file, extract next concrete action + risk + scope",
    },
    {
      title: "Execute",
      detail: "optional: small/safe actions only — run in worktree isolation",
    },
    {
      title: "Synthesize",
      detail: "rank, write report to docs/audits/_runner-report.md",
    },
  ],
};

const MODE = (args && args.mode) || "triage";
const LIMIT = (args && args.limit) || null;
const FILTER = (args && args.filter) || null;

phase("Parse");
log(`mode=${MODE} limit=${LIMIT ?? "none"} filter=${FILTER ?? "none"}`);

const openWorkRaw = await agent(
  "Read the file at docs/open-work.md and return its FULL content verbatim. No commentary, just the file content.",
  { label: "read:open-work", phase: "Parse" },
);

const auditsSection = (() => {
  const start = openWorkRaw.indexOf("## Аудити");
  if (start < 0) return "";
  const next = openWorkRaw.indexOf("\n## ", start + 5);
  return next < 0 ? openWorkRaw.slice(start) : openWorkRaw.slice(start, next);
})();

const auditRowRe =
  /\[`([^`]+\.md)`\]\(([^)]+)\)\s*\|\s*([A-Za-z][A-Za-z0-9\s\-]*)\s*\|/g;
let audits = [];
let m;
while ((m = auditRowRe.exec(auditsSection)) !== null) {
  audits.push({
    file: m[1].trim(),
    path: m[2].trim().replace(/^\.\//, "docs/"),
    status: m[3].trim(),
  });
}

if (FILTER)
  audits = audits.filter(
    (a) => a.file.includes(FILTER) || a.path.includes(FILTER),
  );
if (LIMIT) audits = audits.slice(0, LIMIT);

log(`found ${audits.length} audits to process`);
if (!audits.length)
  return { error: "no audits matched filter/limit", mode: MODE };

const TRIAGE_SCHEMA = {
  type: "object",
  required: ["file", "summary", "openItems", "recommendation"],
  properties: {
    file: { type: "string" },
    summary: { type: "string", description: "one-sentence audit purpose" },
    openItems: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "risk", "scope", "autoSafe"],
        properties: {
          title: { type: "string" },
          where: { type: "string", description: "file path or area touched" },
          risk: { type: "string", enum: ["low", "medium", "high"] },
          scope: { type: "string", enum: ["xs", "s", "m", "l", "xl"] },
          autoSafe: {
            type: "boolean",
            description:
              "true only if pure docs/comment edit, no behavior change, no DB, no auth, no money path",
          },
          rationale: { type: "string" },
        },
      },
    },
    recommendation: {
      type: "string",
      enum: ["execute-now", "plan-first", "close-as-stale", "blocked"],
    },
    blockers: { type: "array", items: { type: "string" } },
  },
};

phase("Triage");

const triaged = await pipeline(
  audits,
  (a) =>
    agent(
      `You are triaging an audit document for the Sergeant monorepo.

File: ${a.path}
Current Status header: ${a.status}

Steps:
1. Read ${a.path} in full.
2. Skim cross-referenced PRs to see what has already shipped vs what is still open. Do NOT fetch GitHub — rely on the audit itself and grep the repo for any referenced files/symbols.
3. Identify the OPEN items only (skip completed, skip already-shipped).
4. For each open item, judge:
   - risk: low/medium/high
   - scope: xs/s/m/l/xl
   - autoSafe: true ONLY for pure docs/comment/typo edits with zero behavior change, zero DB, zero auth/money path
5. Recommend overall: execute-now (autoSafe-only items), plan-first (needs design), close-as-stale (audit superseded), blocked (waiting on external dep).

Return structured output via the StructuredOutput tool. Cap reading to the audit file + at most 3 referenced files.`,
      {
        label: `triage:${a.file.replace(/\.md$/, "").slice(0, 40)}`,
        phase: "Triage",
        schema: TRIAGE_SCHEMA,
      },
    ),
  // Stage 2: optional execute — runs only if MODE=execute AND triage produced autoSafe items
  async (triage, original) => {
    if (MODE !== "execute" || !triage) return { triage, executed: [] };
    const safe = (triage.openItems || []).filter(
      (i) =>
        i.autoSafe && i.risk === "low" && (i.scope === "xs" || i.scope === "s"),
    );
    if (!safe.length) return { triage, executed: [] };

    const executed = await parallel(
      safe.map(
        (item, idx) => () =>
          agent(
            `You are executing a SAFE doc/comment-level action from an audit triage.

Source audit: ${original.path}
Action: ${item.title}
Where: ${item.where || "(see audit body)"}
Rationale: ${item.rationale || ""}

Hard rules:
- DOC / COMMENT / TYPO edits only. Zero behavior change.
- No code logic, no schema, no auth, no money, no migrations.
- If you discover the edit requires anything beyond docs/comments — STOP and return {status:"escalated", reason}.
- Make the edit, run \`pnpm lint:docs\` if it exists, otherwise just verify the file parses.
- Return {status:"done"|"escalated"|"skipped", file, changesSummary, reason?}.`,
            {
              label: `exec:${original.file.replace(/\.md$/, "").slice(0, 30)}#${idx}`,
              phase: "Execute",
              isolation: "worktree",
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: {
                    type: "string",
                    enum: ["done", "escalated", "skipped"],
                  },
                  file: { type: "string" },
                  changesSummary: { type: "string" },
                  reason: { type: "string" },
                },
              },
            },
          ),
      ),
    );
    return { triage, executed: executed.filter(Boolean) };
  },
);

phase("Synthesize");

const cleaned = triaged.filter(Boolean);

const report = await agent(
  `You are synthesizing audit-triage results into a prioritized action plan for the Sergeant maintainer.

Mode: ${MODE}
Audits triaged: ${cleaned.length}

Input (JSON array of { triage, executed }):
${JSON.stringify(cleaned, null, 2).slice(0, 60000)}

Produce a markdown report with sections:
1. **TL;DR** — 3 bullets, what to do this week.
2. **Execute now** — autoSafe + low-risk items, grouped by audit. One line each: \`[ ] audit#item — where — rationale\`.
3. **Plan first** — medium/high risk items needing design or playbook. Sort by impact.
4. **Close as stale** — audits whose recommendation = close-as-stale.
5. **Blocked** — items with blockers, list the blocker.
6. **Executed in this run** (only if mode=execute) — what was actually done, what escalated.

Write the report to \`docs/audits/_runner-report.md\` with a proper lifecycle header:
\`\`\`
# Audit runner report

> **Last validated:** ${args?.todayDate || "<<fill from args.todayDate>>"} by audits-runner workflow. **Next review:** ${args?.nextReview || "<<fill from args.nextReview>>"}.
> **Status:** Reference
\`\`\`

Return the final report text (also the same text that you wrote to disk).`,
  { label: "synthesize", phase: "Synthesize" },
);

return {
  mode: MODE,
  auditsProcessed: cleaned.length,
  reportPath: "docs/audits/_runner-report.md",
  reportPreview:
    typeof report === "string" ? report.slice(0, 800) : "(non-string report)",
};
