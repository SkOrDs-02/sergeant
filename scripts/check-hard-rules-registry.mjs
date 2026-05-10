#!/usr/bin/env node
// scripts/check-hard-rules-registry.mjs
//
// Validates the Hard Rules registry at `docs/governance/hard-rules.json`:
//
//   1. Conforms to the JSON Schema at `docs/governance/hard-rules.schema.json`
//      (a minimal schema validator implemented inline — we do not pull AJV
//      just to check ~10 properties, see DECISION below).
//   2. `rules[].id` is dense from 1..N with no gaps and no duplicates.
//   3. Each `id` and `title` matches its row in the AGENTS.md compact rules
//      table (post-0009 PR 3.2 format) OR the legacy `### N. <title>`
//      heading (used by small unit-test fixtures). The compact table is
//      the primary form; heading support is a fallback so older fixtures
//      and downstream consumers still parse during the migration window.
//   4. Every rule has a per-rule canonical file at
//      `docs/governance/rules/NN-<slug>.md` whose H1 reads
//      `# Rule <id> — <title>`. This is the third leg of the 3-way sync
//      introduced by initiative 0009 PR 3.2 (AGENTS.md ↔ JSON ↔ per-rule
//      files). Per-rule directory absence is silently tolerated so legacy
//      test fixtures without that directory still pass.
//   5. Every rule listed in AGENTS.md also appears in CONTRIBUTING.md
//      § Hard rules (`N. **<title-fragment>**`). This duplicates the check
//      `scripts/check-governance-sync.mjs` does today, but anchored to the
//      JSON registry rather than AGENTS.md so future tooling can read the
//      machine-readable file directly.
//
// DECISION on inline schema validator
// ───────────────────────────────────
// The schema is small (one root object, one array of objects, ~10 keys per
// item, all required-or-not + enum + type). Pulling AJV (~150 kB) for that
// triples our governance-tooling dep weight and makes `pnpm install` on CI
// slower. A 60-line walker is enough to catch every realistic mistake
// (missing key, wrong type, unknown enum value) that authors of the JSON
// file actually make. If the schema grows past trivial we'll swap it for
// AJV in a one-line follow-up.
//
// Usage:
//   node scripts/check-hard-rules-registry.mjs           # validate
//   node scripts/check-hard-rules-registry.mjs --json    # machine-readable
//
// Exit code 1 on any failure.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

const REGISTRY_PATH = resolve(ROOT, "docs/governance/hard-rules.json");
const SCHEMA_PATH = resolve(ROOT, "docs/governance/hard-rules.schema.json");
const AGENTS_PATH = resolve(ROOT, "AGENTS.md");
const CONTRIB_PATH = resolve(ROOT, "CONTRIBUTING.md");
const RULES_DIR = resolve(ROOT, "docs/governance/rules");
const ESLINT_PLUGIN_PATH = resolve(
  ROOT,
  "packages/eslint-plugin-sergeant-design/index.js",
);

// ── Minimal JSON Schema validator (Draft-07 subset) ──────────────────────────
//
// Supported keywords: type, required, properties, items, enum, minimum,
// minLength, minItems, additionalProperties, anyOf. Anything else is
// silently ignored — by design, see DECISION above.

function validate(value, schema, path = "$") {
  const errs = [];

  if (schema.anyOf) {
    const anyOk = schema.anyOf.some(
      (sub) => validate(value, sub, path).length === 0,
    );
    if (!anyOk) {
      errs.push(`${path}: did not match any of the anyOf branches`);
    }
    return errs;
  }

  if (schema.type) {
    const ok = matchesType(value, schema.type);
    if (!ok) {
      errs.push(
        `${path}: expected type '${schema.type}', got ${typeOf(value)}`,
      );
      return errs; // type fail → skip nested checks
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errs.push(
      `${path}: value '${value}' is not one of [${schema.enum.join(", ")}]`,
    );
  }
  if (
    schema.minimum !== undefined &&
    typeof value === "number" &&
    value < schema.minimum
  ) {
    errs.push(`${path}: value ${value} < minimum ${schema.minimum}`);
  }
  if (
    schema.minLength !== undefined &&
    typeof value === "string" &&
    value.length < schema.minLength
  ) {
    errs.push(
      `${path}: string length ${value.length} < minLength ${schema.minLength}`,
    );
  }

  if (schema.type === "array" || Array.isArray(value)) {
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errs.push(
          `${path}: array length ${value.length} < minItems ${schema.minItems}`,
        );
      }
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          errs.push(...validate(value[i], schema.items, `${path}[${i}]`));
        }
      }
    }
  }

  if (
    schema.type === "object" ||
    (schema.properties && typeof value === "object" && value !== null)
  ) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      if (schema.required) {
        for (const k of schema.required) {
          if (!(k in value))
            errs.push(`${path}: missing required property '${k}'`);
        }
      }
      if (schema.properties) {
        for (const [k, sub] of Object.entries(schema.properties)) {
          if (k in value) errs.push(...validate(value[k], sub, `${path}.${k}`));
        }
      }
      if (schema.additionalProperties === false && schema.properties) {
        for (const k of Object.keys(value)) {
          if (!(k in schema.properties)) {
            errs.push(`${path}: unexpected property '${k}'`);
          }
        }
      }
    }
  }

  return errs;
}

function matchesType(v, t) {
  if (t === "string") return typeof v === "string";
  if (t === "integer") return Number.isInteger(v);
  if (t === "number") return typeof v === "number";
  if (t === "boolean") return typeof v === "boolean";
  if (t === "object")
    return typeof v === "object" && v !== null && !Array.isArray(v);
  if (t === "array") return Array.isArray(v);
  if (t === "null") return v === null;
  return false;
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v;
}

// ── AGENTS.md / CONTRIBUTING.md parsers ──────────────────────────────────────

// AGENTS.md compact rules table row, e.g.
//   `| 1 | DB types: coerce ... | \`blocker-invariant\` | [\`01-...md\`](./...) |`
// We only care about the first two cells (id, title). Stripping markdown
// formatting (`**bold**`, `[text](url)`) from the title cell keeps it
// comparable with `registry.title`. The third cell is the category and the
// fourth is the per-rule file link, but neither is parsed here — the schema
// + per-rule-file checks cover those.
function stripInlineMarkdown(s) {
  // Remove `[text](url)` → `text`, then trim only whitespace. We deliberately
  // do NOT strip backticks or asterisks here — backticks inside the title
  // (e.g. `\`className\``) are part of the canonical title and must round-trip
  // exactly to match `registry.title`.
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
}

function parseAgentsTableRules(text) {
  const out = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    const cells = trimmed
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    // Header: `| #   | Rule ... |` — first cell text is `#`. Skip it and any
    // alignment/separator row.
    const idCell = cells[0];
    if (!/^\d+$/.test(idCell)) continue;
    const id = Number(idCell);
    const titleCell = stripInlineMarkdown(cells[1]);
    if (!titleCell) continue;
    out.set(id, titleCell);
  }
  return out;
}

function parseAgentsHeadingRules(text) {
  const re = /^### (\d+)\.\s+(.+)$/gm;
  const out = new Map();
  let m;
  while ((m = re.exec(text)) !== null) {
    out.set(Number(m[1]), m[2].trim());
  }
  return out;
}

// Primary parser: prefer table rows (post-0009 PR 3.2 format). Fall back to
// `### N. <title>` headings (legacy / fixture format) so transitional fixtures
// and downstream tooling don't break. Returns id→title.
function parseAgentsRules(text) {
  const tableHits = parseAgentsTableRules(text);
  if (tableHits.size > 0) return tableHits;
  return parseAgentsHeadingRules(text);
}

function parseContribRules(text) {
  const re = /^(\d+)\.\s+\*\*(.+?)\*\*/gm;
  const out = new Map();
  let m;
  while ((m = re.exec(text)) !== null) {
    out.set(Number(m[1]), m[2].trim());
  }
  return out;
}

// AGENTS.md numbering also appears in two other top-level numbered lists
// (Soft rules, Architecture-checklist). We anchor on the literal heading
// strings and slice each section between its heading and the next "## "
// heading. Initiative 0009 фаза 3.1 виносить design-конвенції з єдиного
// "## Hard rules" розділу у "## Lint-enforced design conventions"; обидва
// тримають `### N. …` заголовки з тими ж id, тому sync-чек збирає їх в один
// індекс.
const HARD_RULES_SECTION_HEADINGS = [
  "## Hard rules (do not break)",
  "## Lint-enforced design conventions",
];

function sliceSection(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return "";
  const after = text.indexOf("\n## ", start + 1);
  return after < 0 ? text.slice(start) : text.slice(start, after);
}

function sliceHardRulesSection(text) {
  return HARD_RULES_SECTION_HEADINGS.map((h) => sliceSection(text, h)).join(
    "\n",
  );
}

// Parse the rule-name map exported by `packages/eslint-plugin-sergeant-design`
// without importing the plugin (it pulls in TypeScript-eslint deps that aren't
// guaranteed to resolve in every node-only context the script is run from).
// We only need the keys of the `rules: { ... }` object literal at the bottom
// of the file. Returns a Set of rule names like "no-foreign-module-accent".
//
// Returns null when the plugin file is missing (e.g. test fixtures that don't
// ship a real plugin). The caller treats null as "skip this check entirely".
function parseEslintRuleNames(pluginPath) {
  if (!existsSync(pluginPath)) return null;
  const src = readFileSync(pluginPath, "utf-8");
  // Anchor on the literal `rules: {` declaration inside the `plugin` const.
  // The plugin file has multiple `rules:` keys (every rule's `meta.docs.…`
  // also has `docs:` etc.), but only the plugin-level one is at column 2 of
  // an object spread directly after `const plugin = {`.
  const idx = src.indexOf("const plugin = {");
  if (idx < 0) return new Set();
  const rulesIdx = src.indexOf("rules: {", idx);
  if (rulesIdx < 0) return new Set();
  // Find matching closing brace for that block.
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf("{", rulesIdx); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return new Set();
  const body = src.slice(rulesIdx, end);
  const names = new Set();
  const re = /["']([a-z][a-z0-9-]+)["']\s*:/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    names.add(m[1]);
  }
  return names;
}

// CONTRIBUTING.md has multiple unrelated `N. **bold**` numbered lists
// ("Audit exception workflow", "Очікування до Pull Request-а", and the
// actual "Hard rules (з AGENTS.md)" section). Without slicing, those
// other lists overlap rule ids 1..6 and silently mask a real removal
// from the Hard Rules section. Anchor on the H3 "Hard rules" heading
// and stop at the next H2 or H3.
function sliceContribHardRulesSection(text) {
  const re = /^### .*Hard rules.*$/m;
  const match = re.exec(text);
  if (!match) return "";
  const start = match.index;
  const tail = text.slice(start + match[0].length);
  const h2 = tail.indexOf("\n## ");
  const h3 = tail.indexOf("\n### ");
  const candidates = [h2, h3].filter((i) => i >= 0);
  if (candidates.length === 0) return text.slice(start);
  return text.slice(start, start + match[0].length + Math.min(...candidates));
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = new Set(process.argv.slice(2));
  const jsonMode = args.has("--json");
  const errors = [];

  // Load files
  for (const p of [REGISTRY_PATH, SCHEMA_PATH, AGENTS_PATH, CONTRIB_PATH]) {
    if (!existsSync(p)) {
      errors.push(`missing file: ${p}`);
    }
  }
  if (errors.length > 0) {
    report(errors, jsonMode);
    process.exit(1);
  }

  let registry;
  try {
    registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  } catch (err) {
    report([`hard-rules.json: invalid JSON — ${err.message}`], jsonMode);
    process.exit(1);
  }
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
  const agentsContent = readFileSync(AGENTS_PATH, "utf-8");
  const contribContent = readFileSync(CONTRIB_PATH, "utf-8");

  // 1. Schema validation
  const schemaErrs = validate(registry, schema);
  for (const e of schemaErrs) errors.push(`schema: ${e}`);

  // 2. Dense numbering
  if (Array.isArray(registry.rules)) {
    const ids = registry.rules
      .map((r) => r?.id)
      .filter((n) => Number.isInteger(n));
    const sorted = [...ids].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        errors.push(
          `numbering: rule ids are not dense 1..N — found ${sorted.join(",")}`,
        );
        break;
      }
    }
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`numbering: duplicate rule id ${id}`);
      seen.add(id);
    }
  }

  // 3. AGENTS.md ↔ registry sync
  const agentsRules = parseAgentsRules(sliceHardRulesSection(agentsContent));
  if (Array.isArray(registry.rules)) {
    for (const r of registry.rules) {
      if (!r || !Number.isInteger(r.id)) continue;
      const heading = agentsRules.get(r.id);
      if (!heading) {
        errors.push(
          `agents-sync: registry has rule #${r.id} but AGENTS.md has no '### ${r.id}. …' heading`,
        );
        continue;
      }
      if (heading !== r.title) {
        errors.push(
          `agents-sync: rule #${r.id} title drift — registry='${r.title}' vs AGENTS.md='${heading}'`,
        );
      }
    }
    for (const [num, title] of agentsRules) {
      const inRegistry = registry.rules.find((r) => r?.id === num);
      if (!inRegistry) {
        errors.push(
          `agents-sync: AGENTS.md has Hard Rule #${num} ('${title}') but registry does not`,
        );
      }
    }
  }

  // 4. CONTRIBUTING.md mirror
  const contribRules = parseContribRules(
    sliceContribHardRulesSection(contribContent),
  );
  if (Array.isArray(registry.rules)) {
    for (const r of registry.rules) {
      if (!r || !Number.isInteger(r.id)) continue;
      if (!contribRules.has(r.id)) {
        errors.push(
          `contrib-sync: rule #${r.id} ('${r.title}') is missing from CONTRIBUTING.md § Hard rules`,
        );
      }
    }
  }

  // 4b. Per-rule canonical files (initiative 0009 PR 3.2 — 3-way sync)
  //
  // For each rule in the registry, expect a file
  // `docs/governance/rules/NN-<slug>.md` whose H1 is `# Rule <id> — <title>`.
  // The slug is whatever the file is named — we don't validate it here, only
  // that exactly one file with the `NN-` prefix exists and its H1 matches.
  // The directory can be missing entirely (legacy fixtures don't have it),
  // in which case we skip this check; once it exists, every registry rule
  // must have a matching file.
  if (existsSync(RULES_DIR) && Array.isArray(registry.rules)) {
    let entries = [];
    try {
      entries = readdirSync(RULES_DIR);
    } catch {
      entries = [];
    }
    const filesByPrefix = new Map();
    for (const name of entries) {
      const m = name.match(/^(\d{2})-[a-z0-9-]+\.md$/);
      if (!m) continue;
      const id = Number(m[1]);
      if (!filesByPrefix.has(id)) filesByPrefix.set(id, []);
      filesByPrefix.get(id).push(name);
    }
    for (const r of registry.rules) {
      if (!r || !Number.isInteger(r.id)) continue;
      const matches = filesByPrefix.get(r.id) ?? [];
      if (matches.length === 0) {
        errors.push(
          `rule-file-sync: rule #${r.id} ('${r.title}') has no matching file in docs/governance/rules/ (expected NN-<slug>.md)`,
        );
        continue;
      }
      if (matches.length > 1) {
        errors.push(
          `rule-file-sync: rule #${r.id} has multiple files with the same NN prefix in docs/governance/rules/: ${matches.join(", ")}`,
        );
        continue;
      }
      const filePath = resolve(RULES_DIR, matches[0]);
      let body;
      try {
        body = readFileSync(filePath, "utf-8");
      } catch (err) {
        errors.push(
          `rule-file-sync: cannot read docs/governance/rules/${matches[0]} — ${err.message}`,
        );
        continue;
      }
      const h1Re = /^#\s+Rule\s+(\d+)\s+—\s+(.+)$/m;
      const h1 = h1Re.exec(body);
      if (!h1) {
        errors.push(
          `rule-file-sync: docs/governance/rules/${matches[0]} has no '# Rule N — <title>' H1`,
        );
        continue;
      }
      const fileId = Number(h1[1]);
      const fileTitle = h1[2].trim();
      if (fileId !== r.id) {
        errors.push(
          `rule-file-sync: docs/governance/rules/${matches[0]} H1 says rule #${fileId} but file is named ${matches[0]} (expected #${r.id})`,
        );
      }
      if (fileTitle !== r.title) {
        errors.push(
          `rule-file-sync: rule #${r.id} title drift — registry='${r.title}' vs docs/governance/rules/${matches[0]} H1='${fileTitle}'`,
        );
      }
    }
    // Reverse direction: every NN-prefixed file must correspond to a rule.
    const knownIds = new Set(
      registry.rules.filter((r) => r?.id != null).map((r) => r.id),
    );
    for (const [id, names] of filesByPrefix) {
      if (!knownIds.has(id)) {
        errors.push(
          `rule-file-sync: docs/governance/rules/${names[0]} numbered #${id} but registry has no such rule`,
        );
      }
    }
  }

  // 5. eslint-rule refs name a real plugin rule
  //
  // Catches a class of bug where the registry says rule N is enforced by
  // 'sergeant-design/foo' but the actual rule is named 'sergeant-design/bar'.
  // Future tooling that resolves enforced_by.ref → real rule would silently
  // miss the rule. Parses the rule name map out of the plugin source so we
  // don't have to dynamically import the plugin (which pulls in eslint).
  const eslintRuleNames = parseEslintRuleNames(ESLINT_PLUGIN_PATH);
  if (eslintRuleNames !== null && Array.isArray(registry.rules)) {
    for (const r of registry.rules) {
      if (!Array.isArray(r?.enforced_by)) continue;
      for (const e of r.enforced_by) {
        if (e?.kind !== "eslint-rule" || typeof e.ref !== "string") continue;
        // Refs look like "sergeant-design/<name> (severity)". Pull <name> out.
        const m = e.ref.match(/^sergeant-design\/([a-z0-9-]+)/);
        if (!m) {
          errors.push(
            `eslint-rule-ref: rule #${r.id} enforced_by ref '${e.ref}' is not in 'sergeant-design/<rule>' shape`,
          );
          continue;
        }
        if (!eslintRuleNames.has(m[1])) {
          errors.push(
            `eslint-rule-ref: rule #${r.id} cites ESLint rule 'sergeant-design/${m[1]}' but plugin has no such rule`,
          );
        }
      }
    }
  }

  report(errors, jsonMode, registry);
  process.exit(errors.length === 0 ? 0 : 1);
}

function report(errors, jsonMode, registry) {
  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          ok: errors.length === 0,
          errors,
          ruleCount: registry?.rules?.length ?? 0,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (errors.length === 0) {
    const n = registry?.rules?.length ?? 0;
    console.log(
      `✅ Hard Rules registry OK — ${n} rule(s) in sync with AGENTS.md and CONTRIBUTING.md.`,
    );
    return;
  }
  console.error("❌ Hard Rules registry validation failed:\n");
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\nFix: update docs/governance/hard-rules.json so it agrees with AGENTS.md " +
      "§ Hard rules and CONTRIBUTING.md § Hard rules. Hard Rule #15 — these three " +
      "documents move together.\n",
  );
}

main();
