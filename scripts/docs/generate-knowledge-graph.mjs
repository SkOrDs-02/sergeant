#!/usr/bin/env node
// scripts/docs/generate-knowledge-graph.mjs
//
// Build a unified knowledge graph (`docs/governance/knowledge-graph.json` +
// `.html`) that links every Sergeant governance artifact:
//   adr | initiative | playbook | skill | hard-rule | audit |
//   service (Phase 3) | package (Phase 3) | file (Phase 2) | pr (Phase 5)
//
// Phase 1 covers: adr / initiative / playbook / skill / hard-rule / audit
// + PR nodes auto-created from `#NNNN` mentions inside doc bodies.
// Later phases (services, packages, symbols) feed this generator with
// additional node sources.
//
// Schema:    docs/governance/schemas/knowledge-graph.schema.json
// ADR:       docs/adr/0058-knowledge-graph-schema.md
// Initiative: docs/90-work/initiatives/0014-knowledge-graph-and-catalogs.md
//
// Usage:
//   node scripts/docs/generate-knowledge-graph.mjs            # write
//   node scripts/docs/generate-knowledge-graph.mjs --check    # CI gate
//
// Exits 1 on `--check` diff, schema violation, or I/O error.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join, relative, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

const OUT_JSON = resolve(REPO_ROOT, "docs/governance/knowledge-graph.json");
const OUT_HTML = resolve(REPO_ROOT, "docs/governance/knowledge-graph.html");
const SCHEMA_PATH = resolve(
  REPO_ROOT,
  "docs/governance/schemas/knowledge-graph.schema.json",
);

const SCHEMA_VERSION = 1;

// ── Regexes ─────────────────────────────────────────────────────────────────

const RE_H1 = /^#\s+(.+?)\s*$/m;
const RE_BLOCK_STATUS = /^>\s*\*\*Status:\*\*\s*(.+?)\s*$/m;
const RE_FIELD_STATUS = /^\s*-\s*\*\*Status:\*\*\s*(.+?)\s*$/m;
const RE_LAST_VALIDATED =
  /^>\s*\*\*Last validated:\*\*\s*(\d{4}-\d{2}-\d{2})\b/m;
const RE_OWNER = /^>\s*\*\*Owner:\*\*\s*`?(@[\w-]+)`?/m;
const RE_PRIORITY = /^>\s*\*\*Priority:\*\*\s*([^\n]+)/m;
const RE_ADR_SUPERSEDES =
  /^\s*-\s*\*\*Supersedes:\*\*\s*(?:—|-|\(none\))?\s*((?:ADR-\d{4}(?:\s*,\s*ADR-\d{4})*)?)/im;
const RE_PR_NUMBER = /#(\d{3,5})(?!\d)|\/pull\/(\d{3,5})(?!\d)/g;
const RE_ADR_REF = /(?<![:\w/])adr[/\\-_]?(\d{4})\b/gi;
const RE_HARD_RULE_REF = /\b(?:Hard\s+Rule|HR|hard-rule)\s*#?(\d{1,3})\b/gi;
const RE_INITIATIVE_REF = /\b(?:initiative|ініціатив[аи])\s*#?-?(\d{4})\b/gi;
const RE_SKILL_NAME = /^name:\s*([\w-]+)\s*$/m;
const RE_SKILL_DESCRIPTION = /^description:\s*(.+?)\s*$/m;
const RE_PLAYBOOK_TITLE = /^#\s+(?:Playbook:\s*)?(.+?)\s*$/m;

// ── Helpers ─────────────────────────────────────────────────────────────────

function relPath(abs) {
  return relative(REPO_ROOT, abs).split(sep).join("/");
}

function readSafe(abs) {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return "";
  }
}

function listMarkdown(dir, { recursive = false, skipUnderscore = true } = {}) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const childPath = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!recursive) continue;
      if (ent.name === "archive") continue;
      out.push(...listMarkdown(childPath, { recursive, skipUnderscore }));
      continue;
    }
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith(".md")) continue;
    if (skipUnderscore && ent.name.startsWith("_")) continue;
    if (ent.name === "README.md") continue;
    if (ent.name === "TEMPLATE.md") continue;
    out.push(childPath);
  }
  return out.sort();
}

function extractTitle(content, fallback) {
  const m = RE_H1.exec(content);
  return m ? m[1].trim() : fallback;
}

function extractStatus(content) {
  // Prefer the canonical `> **Status:**` block-quote marker (Rule #10).
  const block = RE_BLOCK_STATUS.exec(content);
  if (block) return block[1].trim();
  // Fall back to ADR-style `- **Status:**` list field.
  const field = RE_FIELD_STATUS.exec(content);
  if (field) return field[1].trim();
  return null;
}

function tierForPlaybookStatus(status) {
  return status && /^Deprecated\b/i.test(status) ? "extended" : "core";
}

function extractPRNumbers(content) {
  if (!content) return [];
  const seen = new Set();
  for (const m of content.matchAll(RE_PR_NUMBER)) {
    const num = m[1] || m[2];
    if (num) seen.add(Number(num));
  }
  return [...seen].sort((a, b) => a - b);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── Node collectors ─────────────────────────────────────────────────────────

function collectADRs() {
  const dir = resolve(REPO_ROOT, "docs/adr");
  const files = listMarkdown(dir);
  return files.map((abs) => {
    const content = readSafe(abs);
    const base = basename(abs, ".md"); // e.g. "0045-hard-rules-taxonomy"
    const num = base.match(/^(\d{4})/)?.[1];
    const id = num ? `adr:${num}` : `adr:${base}`;
    const title = extractTitle(content, base);
    const status = extractStatus(content);
    return {
      id,
      type: "adr",
      title,
      path: relPath(abs),
      ...(status ? { status } : {}),
      tier: "core",
      meta: {
        ...(num ? { number: Number(num) } : {}),
        ...(RE_LAST_VALIDATED.exec(content)
          ? { last_validated: RE_LAST_VALIDATED.exec(content)[1] }
          : {}),
      },
      _content: content,
    };
  });
}

function collectInitiatives() {
  const dir = resolve(REPO_ROOT, "docs/90-work/initiatives");
  // Recursive to include `stack-pulse-2026-05/*`, skip `_` prefix + archive/.
  const files = listMarkdown(dir, { recursive: true, skipUnderscore: true });
  return files.map((abs) => {
    const content = readSafe(abs);
    const base = basename(abs, ".md");
    const num = base.match(/^(\d{4})/)?.[1];
    const id = num
      ? `initiative:${num}`
      : `initiative:${relPath(abs)
          .replace(/^docs\/90-work\/initiatives\//, "")
          .replace(/\.md$/, "")}`;
    const title = extractTitle(content, base);
    const status = extractStatus(content);
    const owner = RE_OWNER.exec(content)?.[1];
    const priority = RE_PRIORITY.exec(content)?.[1]?.trim();
    return {
      id,
      type: "initiative",
      title,
      path: relPath(abs),
      ...(status ? { status } : {}),
      tier: "core",
      meta: {
        ...(num ? { number: Number(num) } : {}),
        ...(owner ? { owner } : {}),
        ...(priority ? { priority } : {}),
      },
      _content: content,
    };
  });
}

function collectPlaybooks() {
  const dir = resolve(REPO_ROOT, "docs/00-start/playbooks");
  const files = listMarkdown(dir).filter(
    (f) => !basename(f).startsWith("_") && basename(f) !== "INDEX.md",
  );
  return files.map((abs) => {
    const content = readSafe(abs);
    const slug = basename(abs, ".md");
    const id = `playbook:${slug}`;
    const titleM = RE_PLAYBOOK_TITLE.exec(content);
    const title = titleM ? titleM[1].trim() : slug;
    const status = extractStatus(content);
    return {
      id,
      type: "playbook",
      title,
      path: relPath(abs),
      ...(status ? { status } : {}),
      tier: tierForPlaybookStatus(status),
      meta: {},
      _content: content,
    };
  });
}

function collectSkills() {
  const dir = resolve(REPO_ROOT, ".agents/skills");
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const skillPath = join(dir, ent.name, "SKILL.md");
    const content = readSafe(skillPath);
    if (!content) continue;
    const name = RE_SKILL_NAME.exec(content)?.[1] || ent.name;
    const description = RE_SKILL_DESCRIPTION.exec(content)?.[1];
    nodes.push({
      id: `skill:${name}`,
      type: "skill",
      title: name,
      path: relPath(skillPath),
      tier: "core",
      meta: { ...(description ? { description } : {}) },
      _content: content,
    });
  }
  return nodes;
}

function collectHardRules() {
  const jsonPath = resolve(REPO_ROOT, "docs/governance/hard-rules.json");
  let registry;
  try {
    registry = JSON.parse(readSafe(jsonPath));
  } catch {
    return { nodes: [], edges: [] };
  }
  const nodes = [];
  const edges = [];
  for (const rule of registry.rules || []) {
    const id = `hard-rule:${rule.id}`;
    nodes.push({
      id,
      type: "hard-rule",
      title: rule.title,
      path: `docs/governance/hard-rules.json#${rule.id}`,
      tier: "core",
      meta: {
        number: rule.id,
        severity: rule.severity,
        category: rule.category,
        scope: rule.scope,
      },
    });
    // `enforced_by` → typed `enforces` edges. We add a synthetic file/CI node
    // only when the ref is an unmistakable repo-relative path.
    for (const enf of rule.enforced_by || []) {
      const ref = (enf.ref || "").split(/[\s(]/)[0].trim();
      if (!ref) continue;
      // Skip pure conventions like `pnpm api:check-openapi` — they don't have
      // a stable node id yet. ESLint rules → keep as text edges by ref.
      if (enf.kind === "eslint-rule") {
        edges.push({
          from: id,
          to: `file:${ref}`,
          type: "enforces",
          meta: { kind: enf.kind },
        });
      } else if (enf.kind === "ci") {
        edges.push({
          from: id,
          to: `file:${ref}`,
          type: "enforces",
          meta: { kind: enf.kind },
        });
      } else if (/^[\w/.@-]+\.[a-z0-9]+/i.test(ref)) {
        edges.push({
          from: id,
          to: `file:${ref}`,
          type: "enforces",
          meta: { kind: enf.kind },
        });
      }
    }
  }
  return { nodes, edges };
}

function collectAudits() {
  const dir = resolve(REPO_ROOT, "docs/90-work/audits");
  const files = listMarkdown(dir);
  return files.map((abs) => {
    const content = readSafe(abs);
    const slug = basename(abs, ".md");
    const id = `audit:${slug}`;
    const title = extractTitle(content, slug);
    const status = extractStatus(content);
    return {
      id,
      type: "audit",
      title,
      path: relPath(abs),
      ...(status ? { status } : {}),
      tier: "core",
      meta: {},
      _content: content,
    };
  });
}

// ── Edge derivation ─────────────────────────────────────────────────────────

function deriveEdges(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = [];
  const seenEdge = new Set();
  const ensurePrNode = (num, prNodes) => {
    const id = `pr:${num}`;
    if (!prNodes.has(id)) {
      prNodes.set(id, {
        id,
        type: "pr",
        title: `PR #${num}`,
        tier: "extended",
        meta: {
          number: num,
          url: `https://github.com/Skords-01/Sergeant/pull/${num}`,
        },
      });
    }
    return id;
  };
  const prNodes = new Map();

  const pushEdge = (edge) => {
    const key = `${edge.from}|${edge.to}|${edge.type}`;
    if (seenEdge.has(key)) return;
    seenEdge.add(key);
    edges.push(edge);
  };

  for (const node of nodes) {
    const content = node._content || "";

    // ── 1. `touched-by` edges from `#NNNN` PR mentions ──────────────────
    if (content) {
      for (const num of extractPRNumbers(content)) {
        const prId = ensurePrNode(num, prNodes);
        pushEdge({ from: node.id, to: prId, type: "touched-by" });
      }
    }

    // ── 2. ADR `supersedes` ─────────────────────────────────────────────
    if (node.type === "adr" && content) {
      const sup = RE_ADR_SUPERSEDES.exec(content);
      if (sup && sup[1]) {
        for (const m of sup[1].matchAll(/ADR-(\d{4})/g)) {
          const targetId = `adr:${m[1]}`;
          if (byId.has(targetId)) {
            pushEdge({ from: node.id, to: targetId, type: "supersedes" });
          }
        }
      }
    }

    // ── 3. Doc-to-doc `references` from textual mentions ────────────────
    if (content) {
      // ADR references: "ADR-0045", "adr/0045", "adr-0045"
      for (const m of content.matchAll(RE_ADR_REF)) {
        const targetId = `adr:${m[1]}`;
        if (targetId === node.id) continue;
        if (byId.has(targetId)) {
          pushEdge({ from: node.id, to: targetId, type: "references" });
        }
      }
      // Hard rule references: "Hard Rule #18", "HR-18", "hard-rule 18"
      for (const m of content.matchAll(RE_HARD_RULE_REF)) {
        const targetId = `hard-rule:${Number(m[1])}`;
        if (targetId === node.id) continue;
        if (byId.has(targetId)) {
          pushEdge({ from: node.id, to: targetId, type: "references" });
        }
      }
      // Initiative references: "initiative 0010", "ініціатива 0010"
      for (const m of content.matchAll(RE_INITIATIVE_REF)) {
        const targetId = `initiative:${m[1]}`;
        if (targetId === node.id) continue;
        if (byId.has(targetId)) {
          pushEdge({ from: node.id, to: targetId, type: "references" });
        }
      }
    }
  }

  return { edges, prNodes: [...prNodes.values()] };
}

// ── Edge derivation: owner / documents ──────────────────────────────────────

function deriveOwnershipEdges(_nodes) {
  const edges = [];
  // initiative `owned-by` Owner handle — synthesize a file-node target on demand
  // is overkill for Phase 1; instead embed owner in node.meta and emit a
  // virtual `owned-by` edge only when a matching node exists.
  // For Phase 1 we skip synthesizing owner nodes — the meta.owner field is
  // queryable from JSON consumers.
  return edges;
}

// ── Schema validation (minimal, no ajv dep) ─────────────────────────────────

function validateGraph(graph, schema) {
  const errors = [];
  const def = schema.definitions || {};
  const nodeTypes = new Set(def.nodeType?.enum || []);
  const edgeTypes = new Set(def.edgeType?.enum || []);
  const nodeIds = new Set();

  if (typeof graph.version !== "number") errors.push("version: not a number");
  if (typeof graph.generated_at !== "string")
    errors.push("generated_at: not a string");
  if (!Array.isArray(graph.nodes)) errors.push("nodes: not an array");
  if (!Array.isArray(graph.edges)) errors.push("edges: not an array");

  for (const n of graph.nodes || []) {
    if (!n.id || typeof n.id !== "string" || n.id.length < 3) {
      errors.push(`node ${JSON.stringify(n.id)}: invalid id`);
      continue;
    }
    if (nodeIds.has(n.id)) {
      errors.push(`node ${n.id}: duplicate`);
      continue;
    }
    nodeIds.add(n.id);
    if (!nodeTypes.has(n.type)) {
      errors.push(`node ${n.id}: invalid type ${JSON.stringify(n.type)}`);
    }
    if (!n.title) errors.push(`node ${n.id}: missing title`);
    if (n.tier && n.tier !== "core" && n.tier !== "extended") {
      errors.push(`node ${n.id}: invalid tier ${JSON.stringify(n.tier)}`);
    }
  }

  for (const e of graph.edges || []) {
    if (!e.from || !e.to || !e.type) {
      errors.push(`edge ${JSON.stringify(e)}: missing required field`);
      continue;
    }
    if (!edgeTypes.has(e.type)) {
      errors.push(`edge ${e.from} → ${e.to}: invalid type ${e.type}`);
    }
    if (!nodeIds.has(e.from)) {
      errors.push(`edge ${e.from} → ${e.to}: dangling 'from' node`);
    }
    if (!nodeIds.has(e.to)) {
      errors.push(`edge ${e.from} → ${e.to}: dangling 'to' node`);
    }
  }

  return errors;
}

// ── Build the graph ─────────────────────────────────────────────────────────

export function buildGraph() {
  const adrNodes = collectADRs();
  const initiativeNodes = collectInitiatives();
  const playbookNodes = collectPlaybooks();
  const skillNodes = collectSkills();
  const auditNodes = collectAudits();
  const hr = collectHardRules();

  const docNodes = [
    ...adrNodes,
    ...initiativeNodes,
    ...playbookNodes,
    ...skillNodes,
    ...auditNodes,
    ...hr.nodes,
  ];

  const { edges: derivedEdges, prNodes } = deriveEdges(docNodes);
  const ownershipEdges = deriveOwnershipEdges(docNodes);

  // Strip _content before emit (used only for edge derivation).
  const allNodes = [...docNodes, ...prNodes]
    .map(({ _content, ...rest }) => rest)
    .sort((a, b) => a.id.localeCompare(b.id));

  // Edges from hard-rule.enforced_by may target `file:*` nodes we never
  // collected. Filter them so JSON stays self-consistent (we'll re-introduce
  // file nodes in Phase 2 once symbol catalog lands).
  const allEdges = [...derivedEdges, ...ownershipEdges, ...hr.edges]
    .filter((e) => allNodes.some((n) => n.id === e.from))
    .filter((e) => allNodes.some((n) => n.id === e.to))
    .sort((a, b) => {
      if (a.from !== b.from) return a.from.localeCompare(b.from);
      if (a.to !== b.to) return a.to.localeCompare(b.to);
      return a.type.localeCompare(b.type);
    });

  const counts = {};
  for (const n of allNodes) counts[n.type] = (counts[n.type] || 0) + 1;

  return {
    $schema: "./schemas/knowledge-graph.schema.json",
    version: SCHEMA_VERSION,
    generated_at: todayISO(),
    counts,
    nodes: allNodes,
    edges: allEdges,
  };
}

// ── Rendering ───────────────────────────────────────────────────────────────

function renderJSON(graph) {
  return JSON.stringify(graph, null, 2) + "\n";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mermaidSafeId(id) {
  return id.replace(/[^a-z0-9_]/gi, "_");
}

function renderMermaidSubgraph(graph, nodeType, edgeFilter) {
  const nodes = graph.nodes.filter(
    (n) => n.type === nodeType && n.tier === "core",
  );
  if (nodes.length === 0) return "";
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter(
    (e) =>
      (ids.has(e.from) || ids.has(e.to)) && (edgeFilter ? edgeFilter(e) : true),
  );
  const lines = ["graph LR"];
  for (const n of nodes.slice(0, 30)) {
    lines.push(
      `  ${mermaidSafeId(n.id)}["${escapeHtml(n.title.slice(0, 60))}"]`,
    );
  }
  for (const e of edges.slice(0, 60)) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    lines.push(
      `  ${mermaidSafeId(e.from)} --|${e.type}|--> ${mermaidSafeId(e.to)}`,
    );
  }
  return lines.join("\n");
}

function renderHTML(graph) {
  const summaryChips = Object.entries(graph.counts)
    .sort()
    .map(
      ([type, n]) =>
        `<span class="chip chip-${type}">${escapeHtml(type)}: <b>${n}</b></span>`,
    )
    .join(" ");

  const rows = graph.nodes
    .filter((n) => n.tier === "core")
    .map((n) => {
      const linkTitle = n.path
        ? `<a href="../../${escapeHtml(n.path)}">${escapeHtml(n.title)}</a>`
        : escapeHtml(n.title);
      const status = n.status ? escapeHtml(n.status) : "";
      const meta = n.meta
        ? escapeHtml(
            Object.entries(n.meta)
              .map(
                ([k, v]) =>
                  `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`,
              )
              .join(" · "),
          )
        : "";
      return `<tr><td>${escapeHtml(n.type)}</td><td><code>${escapeHtml(n.id)}</code></td><td>${linkTitle}</td><td>${status}</td><td>${meta}</td></tr>`;
    })
    .join("\n");

  const edgeRows = graph.edges
    .filter((e) => {
      const fromNode = graph.nodes.find((n) => n.id === e.from);
      const toNode = graph.nodes.find((n) => n.id === e.to);
      return fromNode?.tier === "core" && toNode?.tier === "core";
    })
    .slice(0, 500)
    .map(
      (e) =>
        `<tr><td><code>${escapeHtml(e.from)}</code></td><td>${escapeHtml(e.type)}</td><td><code>${escapeHtml(e.to)}</code></td></tr>`,
    )
    .join("\n");

  const adrGraph = renderMermaidSubgraph(graph, "adr", (e) =>
    ["supersedes", "references"].includes(e.type),
  );

  return `<!doctype html>
<!-- AUTO-GENERATED -->
<html lang="uk">
<head>
<meta charset="utf-8" />
<title>Sergeant — Knowledge Graph (${graph.generated_at})</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 2rem; color: #111; }
  h1 { margin-top: 0; }
  .summary { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .chip { padding: .4rem .65rem; border-radius: 6px; font-weight: 600; background: #e2e3e5; color: #383d41; font-size: 14px; }
  .chip-adr { background: #d4edda; color: #155724; }
  .chip-initiative { background: #fff3cd; color: #856404; }
  .chip-playbook { background: #d1ecf1; color: #0c5460; }
  .chip-skill { background: #e2d4f0; color: #4a235a; }
  .chip-hard-rule { background: #f8d7da; color: #721c24; }
  .chip-audit { background: #fde2cf; color: #82461c; }
  .chip-pr { background: #cfe2ff; color: #0a3d8f; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; margin-top: 1rem; }
  th, td { padding: .35rem .55rem; text-align: left; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: #f6f8fa; position: sticky; top: 0; }
  code { background: #f6f8fa; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
  details { margin: 1rem 0; }
  summary { cursor: pointer; font-weight: 600; }
  .auto-gen { color: #666; font-size: 13px; margin-bottom: 1rem; }
</style>
</head>
<body>
<h1>Sergeant — Knowledge Graph</h1>
<p class="auto-gen">Generated ${graph.generated_at} · schema v${graph.version} · do not edit by hand — regenerate via <code>pnpm docs:gen-graph</code>.</p>
<div class="summary">${summaryChips}</div>

<details open>
<summary>Nodes (${graph.nodes.filter((n) => n.tier === "core").length} core)</summary>
<table>
<thead><tr><th>Type</th><th>Id</th><th>Title</th><th>Status</th><th>Meta</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</details>

<details>
<summary>Edges (${graph.edges.length} total, first 500 core-to-core)</summary>
<table>
<thead><tr><th>From</th><th>Edge</th><th>To</th></tr></thead>
<tbody>
${edgeRows}
</tbody>
</table>
</details>

<details>
<summary>ADR supersede / reference graph (Mermaid)</summary>
<pre><code class="language-mermaid">${escapeHtml(adrGraph)}</code></pre>
<p><em>Tip: paste the block above into <a href="https://mermaid.live">mermaid.live</a> to render it.</em></p>
</details>
</body>
</html>
`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function formatGenerated(content, parser, filepath) {
  const opts = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(content, { ...opts, parser });
}

async function main() {
  const args = process.argv.slice(2);
  const wantsCheck = args.includes("--check");

  const schema = JSON.parse(readSafe(SCHEMA_PATH) || "{}");
  const graph = buildGraph();
  const errors = validateGraph(graph, schema);
  if (errors.length > 0) {
    console.error(
      `knowledge-graph: schema validation failed (${errors.length} error${errors.length === 1 ? "" : "s"}):`,
    );
    for (const err of errors.slice(0, 20)) console.error(`  - ${err}`);
    if (errors.length > 20) console.error(`  … and ${errors.length - 20} more`);
    process.exit(1);
  }

  const nextJson = await formatGenerated(renderJSON(graph), "json", OUT_JSON);
  const nextHtml = await formatGenerated(renderHTML(graph), "html", OUT_HTML);

  if (wantsCheck) {
    let mismatch = false;
    for (const [path, next] of [
      [OUT_JSON, nextJson],
      [OUT_HTML, nextHtml],
    ]) {
      const current = readSafe(path);
      if (current !== next) {
        console.error(
          `${relPath(path)} is out of date. Run \`pnpm docs:gen-graph\` and commit.`,
        );
        mismatch = true;
      }
    }
    if (mismatch) process.exit(1);
    const total = graph.nodes.length;
    const edges = graph.edges.length;
    console.log(
      `knowledge-graph: up to date (${total} node${total === 1 ? "" : "s"}, ${edges} edge${edges === 1 ? "" : "s"}).`,
    );
    process.exit(0);
  }

  writeFileSync(OUT_JSON, nextJson);
  writeFileSync(OUT_HTML, nextHtml);
  const total = graph.nodes.length;
  const edges = graph.edges.length;
  console.log(
    `Wrote ${relPath(OUT_JSON)} (${total} node${total === 1 ? "" : "s"}, ${edges} edge${edges === 1 ? "" : "s"}) and ${relPath(OUT_HTML)}.`,
  );
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exit(1);
  });
}
