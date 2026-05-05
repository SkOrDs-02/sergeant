/**
 * n8n smoke contract test (Initiative 0009 PR 5.3).
 *
 * Asserts that the runtime dispatcher payload built by
 * `buildDispatcherPayload()` cannot drift away from the validation logic
 * embedded in the `20-agent-dispatcher.json` n8n workflow's `Classify agent
 * task` Code node. Without this gate, a TS-side rename (new specialist, new
 * source, new risk tier, new mode) would silently route every Telegram
 * dispatch through n8n's `unknown_*` reject branches — visible only as a 200
 * response with `status: 'rejected'` long after rollout.
 *
 * Source of truth for the n8n side is the `jsCode` string in the workflow
 * JSON (parsed here via regex). Source of truth for the TS side is the
 * `SPECIALIST_SKILL_MAP` constant + the `RiskTier` / `DispatchMode` /
 * `AgentTaskEnvelope.source` literal unions exported from `dispatcher.ts`,
 * which we mirror in `EXPECTED_*` arrays below.
 *
 * Invariants asserted (every drift is a CI fail):
 *   - TS specialist set exactly equals n8n `allowedSpecialists`
 *   - TS source set exactly equals n8n `allowedSources`
 *   - TS risk-tier set is a subset of n8n `allowedRiskTiers`
 *     (n8n is allowed to be more permissive, e.g. accepting P3 for ops, but
 *      TS must never emit a tier n8n rejects)
 *   - TS mode set exactly equals n8n's accepted `mode` strings
 *   - `buildDispatcherPayload()` produces a payload that the n8n Code node
 *     would classify as `accepted` (round-trip simulation against the parsed
 *     `jsCode` rules)
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildDispatcherPayload, SPECIALIST_SKILL_MAP } from "./dispatcher.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WORKFLOW_PATH = resolve(
  __dirname,
  "../../../../ops/n8n-workflows/20-agent-dispatcher.json",
);

interface N8nWorkflowNode {
  name: string;
  type: string;
  parameters?: { jsCode?: string };
}

interface N8nWorkflow {
  nodes: N8nWorkflowNode[];
}

function loadAgentDispatcherWorkflow(): N8nWorkflow {
  const raw = readFileSync(WORKFLOW_PATH, "utf8");
  return JSON.parse(raw) as N8nWorkflow;
}

function getClassifyJsCode(workflow: N8nWorkflow): string {
  const node = workflow.nodes.find(
    (n) =>
      n.type === "n8n-nodes-base.code" &&
      typeof n.parameters?.jsCode === "string",
  );
  if (!node?.parameters?.jsCode) {
    throw new Error(
      "Could not find a Code node with `jsCode` in 20-agent-dispatcher.json. " +
        "If the workflow was renamed, update the test (and `docs/agents/specialists-mapping.md`).",
    );
  }
  return node.parameters.jsCode;
}

/**
 * Extracts a `new Set([...])` literal initializer for a given variable name
 * out of the n8n `jsCode` string. Returns the array of string literals
 * inside the Set constructor.
 *
 * Robust against single OR double quotes and arbitrary whitespace, but it
 * does require the literal to be on the same line as the variable
 * declaration (which is how `20-agent-dispatcher.json` is currently
 * authored — the Code node uses a single long line with `\n` separators).
 */
function extractAllowedSet(code: string, variableName: string): string[] {
  const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `${escaped}\\s*=\\s*new\\s+Set\\(\\s*\\[([^\\]]*)\\]\\s*\\)`,
  );
  const match = code.match(re);
  if (!match) {
    throw new Error(
      `n8n agent-dispatcher Code node no longer declares \`${variableName}\` ` +
        "as `new Set([…])`. Update the contract test parser.",
    );
  }
  const inner = match[1];
  if (inner === undefined) {
    throw new Error(
      `n8n agent-dispatcher Code node \`${variableName}\` Set body could not be captured.`,
    );
  }
  return [...inner.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

/**
 * Mirrors of the TS-side literal unions in `dispatcher.ts`. Adding a new
 * specialist / source / mode in the TS file requires adding it here too —
 * which forces the author to also update the n8n workflow if needed
 * (otherwise this test fails locally before push).
 */
const EXPECTED_SPECIALISTS = Object.keys(SPECIALIST_SKILL_MAP).sort();

const EXPECTED_SOURCES = ["telegram-console", "openclaw"].sort();

const EXPECTED_RISK_TIERS = ["P0", "P1", "P2"].sort();

const EXPECTED_MODES = ["read-only", "mutation"].sort();

describe("n8n agent-dispatcher contract", () => {
  const workflow = loadAgentDispatcherWorkflow();
  const jsCode = getClassifyJsCode(workflow);
  const n8nAllowedSources = extractAllowedSet(jsCode, "allowedSources").sort();
  const n8nAllowedSpecialists = extractAllowedSet(
    jsCode,
    "allowedSpecialists",
  ).sort();
  const n8nAllowedRiskTiers = extractAllowedSet(
    jsCode,
    "allowedRiskTiers",
  ).sort();

  it("specialist set matches between TS dispatcher and n8n workflow", () => {
    expect(n8nAllowedSpecialists).toEqual(EXPECTED_SPECIALISTS);
  });

  it("source set matches between TS dispatcher and n8n workflow", () => {
    expect(n8nAllowedSources).toEqual(EXPECTED_SOURCES);
  });

  it("TS risk tiers are a subset of n8n allowed risk tiers", () => {
    for (const tier of EXPECTED_RISK_TIERS) {
      expect(n8nAllowedRiskTiers).toContain(tier);
    }
  });

  it("n8n workflow accepts the literal mode strings the TS dispatcher emits", () => {
    // The n8n Code node compares `mode !== 'read-only' && mode !== 'mutation'`
    // and rejects anything else. Asserts the literal pair is present on
    // both sides — if a future refactor introduces e.g. `dry-run` on the TS
    // side, this test fails until the n8n branch is updated to match.
    for (const mode of EXPECTED_MODES) {
      expect(jsCode).toContain(`'${mode}'`);
    }
  });

  it("buildDispatcherPayload() produces a payload that n8n classifies as accepted", () => {
    const payload = buildDispatcherPayload({
      commandText: "plan finyk roadmap",
      telegramUserId: 42,
      telegramChatId: 42,
      messageId: 1,
    });

    // Round-trip the payload through the same predicates the n8n Code node
    // applies (see `Classify agent task` in 20-agent-dispatcher.json).
    expect(n8nAllowedSources).toContain(payload.source);
    expect(n8nAllowedSpecialists).toContain(payload.specialist);
    expect(n8nAllowedRiskTiers).toContain(payload.riskTier);
    expect(EXPECTED_MODES).toContain(payload.mode);
  });

  it("OpenClaw-sourced envelopes also pass n8n classification", () => {
    const payload = buildDispatcherPayload({
      source: "openclaw",
      commandText: "review server-api migration 029",
      telegramUserId: 99,
      telegramChatId: 99,
      messageId: 2,
    });

    expect(n8nAllowedSources).toContain(payload.source);
    expect(n8nAllowedSpecialists).toContain(payload.specialist);
    expect(n8nAllowedRiskTiers).toContain(payload.riskTier);
    expect(EXPECTED_MODES).toContain(payload.mode);
  });
});
