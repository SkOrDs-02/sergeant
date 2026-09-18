#!/usr/bin/env node
// Validate the Sergeant agent graph (.agents/agent-graph.json) against disk reality.
//
// WHY THIS EXISTS
// ---------------
// The agent layer used to be described only in prose: routing tables in AGENTS.md,
// spawn recipes inside squad SKILLs, rosters restated in docs. Prose rots silently.
// A 2026-08 audit found exactly the failure modes an unvalidated graph produces:
//
//   • dangling edges   — squads dispatching `qa-openclaw`, a routing rule pointing at a
//                        skill named "docs"; neither target existed
//   • orphan nodes     — apps/landing and the 11 packages/* workspaces had no QA runner
//                        (incl. the api-client contract tests, the Hard Rule #3 evidence)
//   • missing terminal — the deliver chain ended at stage 4 with no edge to verification
//   • privilege drift  — nothing mechanically stopped a reviewer from gaining Write
//
// Each check below corresponds to one of those. The graph is hand-maintained INTENT;
// this script is the gate that keeps intent and reality identical.
//
// Run: `pnpm lint:agent-graph` (also wired into `pnpm lint:skills`).

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const GRAPH_PATH = path.join(repoRoot, ".agents/agent-graph.json");
const SKILLS_DIR = path.join(repoRoot, ".agents/skills");
const AGENTS_DIR = path.join(repoRoot, ".claude/agents");
const MAPPING_PATH = path.join(repoRoot, "scripts/docs/skill-mapping.json");

// Roles that must never be able to mutate the repo. A reviewer or QA runner that can
// write is no longer an independent check on the work — it becomes part of it.
const READ_ONLY_ROLES = new Set(["reviewer", "runner", "advisor"]);
const MUTATING_TOOLS = ["Write", "Edit", "NotebookEdit"];

// Surfaces removed from the repo. An agent or skill still naming one sends work to a
// place that no longer exists (ADR-0074 Railway→Coolify, ADR-0075 OpenClaw decommission).
const RETIRED_SURFACES = [
  { pattern: /\btools\/openclaw\b/, why: "removed by ADR-0075" },
  { pattern: /\bops\/openclaw\b/, why: "removed by ADR-0075" },
  { pattern: /\bqa-openclaw\b/, why: "agent deleted with ADR-0075" },
  {
    pattern: /\bsergeant-openclaw\b/,
    why: "skill never existed after ADR-0075",
  },
  { pattern: /modules\/openclaw\b/, why: "removed by ADR-0075" },
];

const errors = [];
const warnings = [];
const fail = (check, msg) => errors.push(`[${check}] ${msg}`);
const warn = (check, msg) => warnings.push(`[${check}] ${msg}`);

const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));

/** Minimal frontmatter reader — two scalar fields, no YAML dependency. */
export function frontmatter(file) {
  // autocrlf-checkouts on Windows materialize `---\r\n`; without normalization the
  // LF-only delimiter checks below misread the file as having no frontmatter at all.
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return { fields: {}, body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { fields: {}, body: text };
  const fields = {};
  for (const line of text.slice(4, end).split("\n")) {
    const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (m) fields[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return { fields, body: text.slice(end + 4) };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const graph = readJSON(GRAPH_PATH);
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];

  const byId = new Map();
  for (const n of nodes) {
    if (byId.has(n.id))
      fail("duplicate-node", `node id declared twice: ${n.id}`);
    byId.set(n.id, n);
  }
  const idsOfKind = (kind) =>
    new Set(nodes.filter((n) => n.kind === kind).map((n) => n.id));

  // ── 1. No dangling edges ─────────────────────────────────────────────────────
  // The check that would have caught `qa-openclaw` the day the agent was deleted.
  for (const e of edges) {
    if (!byId.has(e.from))
      fail(
        "dangling-edge",
        `edge ${e.from} --${e.rel}--> ${e.to}: 'from' node does not exist`,
      );
    if (!byId.has(e.to))
      fail(
        "dangling-edge",
        `edge ${e.from} --${e.rel}--> ${e.to}: 'to' node does not exist`,
      );
  }

  // ── 2. Graph nodes ↔ disk reality ────────────────────────────────────────────
  const skillsOnDisk = new Set(
    readdirSync(SKILLS_DIR).filter((d) =>
      existsSync(path.join(SKILLS_DIR, d, "SKILL.md")),
    ),
  );
  const agentsOnDisk = new Set(
    readdirSync(AGENTS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3)),
  );

  for (const id of idsOfKind("skill"))
    if (!skillsOnDisk.has(id))
      fail(
        "node-not-on-disk",
        `skill node '${id}' has no .agents/skills/${id}/SKILL.md`,
      );
  for (const id of skillsOnDisk)
    if (!byId.has(id))
      fail(
        "disk-not-in-graph",
        `skill '${id}' exists on disk but has no node in agent-graph.json`,
      );

  for (const id of idsOfKind("agent"))
    if (!agentsOnDisk.has(id))
      fail(
        "node-not-on-disk",
        `agent node '${id}' has no .claude/agents/${id}.md`,
      );
  for (const id of agentsOnDisk)
    if (!byId.has(id))
      fail(
        "disk-not-in-graph",
        `agent '${id}' exists on disk but has no node in agent-graph.json`,
      );

  // ── 3. Every tested workspace is verified by some runner ─────────────────────
  // The check that would have caught apps/landing and packages/* sitting unverified.
  const verified = new Set(
    edges.filter((e) => e.rel === "verifies").map((e) => e.to),
  );
  const governed = new Set(
    edges.filter((e) => e.rel === "governs").map((e) => e.to),
  );
  for (const n of nodes.filter((n) => n.kind === "workspace")) {
    if (n.hasTests && !verified.has(n.id))
      fail(
        "orphan-workspace",
        `workspace '${n.id}' has tests but no 'verifies' edge from any qa-* agent`,
      );
    if (!governed.has(n.id))
      fail(
        "ungoverned-workspace",
        `workspace '${n.id}' has no owning skill ('governs' edge)`,
      );
  }

  // ── 4. Least privilege on read-only roles ────────────────────────────────────
  for (const n of nodes.filter((n) => n.kind === "agent")) {
    const file = path.join(repoRoot, n.path);
    if (!existsSync(file)) continue;
    const { fields } = frontmatter(file);

    if (fields.name !== n.id)
      fail(
        "name-mismatch",
        `${n.path}: frontmatter name '${fields.name}' ≠ node id '${n.id}'`,
      );

    if (READ_ONLY_ROLES.has(n.role)) {
      const tools = (fields.tools ?? "").split(",").map((t) => t.trim());
      const bad = MUTATING_TOOLS.filter((t) => tools.includes(t));
      if (bad.length)
        fail(
          "least-privilege",
          `${n.path}: role '${n.role}' must be read-only but declares ${bad.join(", ")}`,
        );
    }
  }

  // ── 5. Deliver chain terminates in verification ──────────────────────────────
  // A delivery squad whose last edge is "implement" has no proof it delivered anything.
  const terminators = edges.filter(
    (e) => e.rel === "terminates" && e.from === "sergeant-deliver-squad",
  );
  if (terminators.length === 0)
    fail(
      "no-terminal-verification",
      "sergeant-deliver-squad has no 'terminates' edge into a verification skill",
    );

  // ── 6. Handoff chain is contiguous and ordered ───────────────────────────────
  const handoffs = edges.filter((e) => e.rel === "handoff");
  for (const h of handoffs) {
    if (typeof h.stage !== "number")
      fail(
        "handoff-unordered",
        `handoff ${h.from} → ${h.to} has no numeric 'stage'`,
      );
    if (!h.payload)
      fail(
        "handoff-untyped",
        `handoff ${h.from} → ${h.to} declares no 'payload' contract`,
      );
  }
  const dispatchedByDeliver = new Set(
    edges
      .filter(
        (e) => e.rel === "dispatches" && e.from === "sergeant-deliver-squad",
      )
      .map((e) => e.to),
  );
  for (const h of handoffs) {
    for (const end of [h.from, h.to]) {
      if (!dispatchedByDeliver.has(end))
        fail(
          "handoff-outside-roster",
          `handoff touches '${end}', which sergeant-deliver-squad never dispatches`,
        );
    }
  }

  // ── 7. skill-mapping.json targets exist ──────────────────────────────────────
  // The check that would have caught the routing rule pointing at a skill named "docs".
  if (existsSync(MAPPING_PATH)) {
    const mapping = readJSON(MAPPING_PATH);
    const skillNodes = idsOfKind("skill");
    for (const rule of mapping.skillRules ?? []) {
      if (!skillNodes.has(rule.skill))
        fail(
          "mapping-dangling",
          `skill-mapping.json routes to '${rule.skill}', which is not a skill node`,
        );
    }
    if (mapping.fallbackSkill && !skillNodes.has(mapping.fallbackSkill))
      fail(
        "mapping-dangling",
        `skill-mapping.json fallbackSkill '${mapping.fallbackSkill}' is not a skill node`,
      );
  }

  // ── 8. No references to retired surfaces ─────────────────────────────────────
  for (const n of nodes.filter(
    (n) => n.kind === "agent" || n.kind === "skill",
  )) {
    const file = path.join(repoRoot, n.path);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const { pattern, why } of RETIRED_SURFACES) {
      const lines = text.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!pattern.test(line)) return;
        // A line that explicitly marks the surface as gone is documentation, not drift.
        if (
          /ADR-007[45]|retired|removed|decommission|historical|no longer|gone/i.test(
            line,
          )
        )
          return;
        warn(
          "retired-surface",
          `${n.path}:${i + 1} mentions ${pattern.source} (${why}) without marking it retired`,
        );
      });
    }
  }

  // ── report ───────────────────────────────────────────────────────────────────
  const counts = nodes.reduce(
    (acc, n) => ({ ...acc, [n.kind]: (acc[n.kind] ?? 0) + 1 }),
    {},
  );
  const shape = Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");

  for (const w of warnings) console.warn(`  ⚠️  ${w}`);

  if (errors.length) {
    console.error(`\n[lint:agent-graph] FAILED — ${errors.length} error(s):\n`);
    for (const e of errors) console.error(`  ❌ ${e}`);
    console.error(
      `\nThe graph in .agents/agent-graph.json is the declared topology of the agent layer.\n` +
        `Fix the graph, the file it points at, or both — a green graph is what keeps\n` +
        `squads from dispatching agents that do not exist.\n`,
    );
    process.exit(1);
  }

  console.log(
    `[lint:agent-graph] OK — ${shape}; ${edges.length} edges validated` +
      (warnings.length ? ` (${warnings.length} warning(s))` : ""),
  );
}
