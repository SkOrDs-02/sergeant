#!/usr/bin/env node
// Codemod: migrate inline UA JSX literals (text + attribute strings) to
// references to the central message catalog
// (`apps/web/src/shared/i18n/uk.ts`), and drop the corresponding entries
// from `apps/web/eslint.i18n-allowlist.json`.
//
// This is the long-running burndown codemod for item #18 of
// `docs/audits/2026-05-03-web-deep-dive/00-overview.md`. Unlike the
// one-shot codemods next to it (`strip-js-extensions/`, `syncedKV/`),
// this script is meant to be **re-run** every time we widen the catalog
// or want to pull more files out of the allowlist. It is idempotent — a
// second run on the same tree is a no-op, because the JSXText / JSX
// attribute string literals it targets get rewritten to JsxExpression
// references (`{messages.foo.bar}`) and no longer match the source-text
// scan.
//
// Usage:
//   node scripts/codemods/i18n-burndown/script.mjs              # dry run
//   node scripts/codemods/i18n-burndown/script.mjs --write      # apply
//   node scripts/codemods/i18n-burndown/script.mjs --filter=foo # only files
//                                                               # whose
//                                                               # allowlist
//                                                               # entry
//                                                               # contains
//                                                               # "foo"
//
// Conservatism: only migrates files where every single Cyrillic JSX
// literal is covered by the catalog mapping. Files with mixed
// migrate-able + non-migrate-able strings are skipped so the resulting
// tree never has half-migrated components.
//
// Long-term enforcement: the ESLint rule
// `sergeant-design/no-cyrillic-jsx-literal` (warn-mode + allowlist) gates
// new drift in. This codemod is intentionally NOT a CI drift-check —
// burndown is gradual and per-PR.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const WRITE = argv.includes("--write");
const FILTER =
  argv.find((a) => a.startsWith("--filter="))?.slice("--filter=".length) ??
  null;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const CATALOG_PATH = resolve(REPO_ROOT, "apps/web/src/shared/i18n/uk.ts");
const ALLOWLIST_PATH = resolve(
  REPO_ROOT,
  "apps/web/eslint.i18n-allowlist.json",
);

const RX_CYRILLIC = /[\u0400-\u04FF]/;

// ── 1. Build literal -> messages.path mapping from the catalog ──────────
//
// Walks `apps/web/src/shared/i18n/uk.ts`'s `messages = { … }` object
// literal and emits a Map<string, "messages.group.key"> for every leaf
// string value. Last-write-wins on duplicates (warned).

function buildMapping() {
  const src = readFileSync(CATALOG_PATH, "utf8");
  const sf = ts.createSourceFile(
    "uk.ts",
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const mapping = new Map();

  function walkObj(node, prefix) {
    if (!ts.isObjectLiteralExpression(node)) return;
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      let key;
      if (ts.isIdentifier(prop.name)) key = prop.name.text;
      else if (ts.isStringLiteral(prop.name)) key = prop.name.text;
      else continue;
      const path = prefix ? `${prefix}.${key}` : key;
      const init = prop.initializer;
      if (
        ts.isStringLiteral(init) ||
        init.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral
      ) {
        const value = init.text;
        if (!RX_CYRILLIC.test(value)) continue;
        if (mapping.has(value) && mapping.get(value) !== path) {
          console.warn(
            `[i18n-burndown] duplicate literal in catalog: ${JSON.stringify(value)} → ` +
              `${mapping.get(value)} & ${path}; keeping the first.`,
          );
        } else if (!mapping.has(value)) {
          mapping.set(value, path);
        }
      } else if (ts.isObjectLiteralExpression(init)) {
        walkObj(init, path);
      }
    }
  }

  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== "messages")
        continue;
      let init = decl.initializer;
      // Strip `as const`, `satisfies …`, `as const satisfies …` chains.
      while (
        init &&
        (ts.isAsExpression(init) || ts.isSatisfiesExpression(init))
      ) {
        init = init.expression;
      }
      if (init && ts.isObjectLiteralExpression(init)) {
        walkObj(init, "messages");
      }
    }
  }

  return mapping;
}

// ── 2. Per-file rewrite ────────────────────────────────────────────────
//
// Mirrors the ESLint rule's `isInsideJsxAttribute`: walk parents, return
// true on JsxAttribute, false on JsxElement / JsxFragment. Anything in
// between (JsxExpression, ConditionalExpression, BinaryExpression, …) is
// transparent. This matters so we count + rewrite literals nested inside
// attribute expressions, e.g.:
//
//   aria-label={item.done ? "Позначити завершене" : "Позначити незавершене"}
//
// — both branch-strings are "inside JsxAttribute" and the ESLint rule
// reports them, so the codemod must too, otherwise we'd mark a file as
// fully migrated and drop it from the allowlist while warnings remain.

function isInsideJsxAttribute(node) {
  let p = node.parent;
  while (p) {
    if (p.kind === ts.SyntaxKind.JsxAttribute) return true;
    if (
      p.kind === ts.SyntaxKind.JsxElement ||
      p.kind === ts.SyntaxKind.JsxFragment
    ) {
      return false;
    }
    p = p.parent;
  }
  return false;
}

function rewriteFile(filePath, source, mapping) {
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  /** @type {{start:number,end:number,replacement:string}[]} */
  const edits = [];
  let unmappable = 0;
  let parseError = null;

  function visit(node) {
    if (parseError) return;

    if (ts.isJsxText(node)) {
      const text = node.text;
      const trimmed = text.trim();
      if (RX_CYRILLIC.test(trimmed)) {
        const path = mapping.get(trimmed);
        if (!path) {
          unmappable += 1;
        } else {
          // JsxText `pos` is the offset right after the opening tag and
          // `text` covers the full content (incl. surrounding whitespace).
          // We replace just the trimmed slice so leading/trailing newlines
          // and indentation stay intact.
          const offsetInText = text.indexOf(trimmed);
          if (offsetInText < 0) {
            // Defensive: shouldn't happen since `trimmed` is derived from
            // `text` itself, but we'd rather skip than mis-edit.
            unmappable += 1;
            return;
          }
          const start = node.pos + offsetInText;
          const end = start + trimmed.length;
          edits.push({ start, end, replacement: `{${path}}` });
        }
      }
      return;
    }

    if (
      (ts.isStringLiteral(node) ||
        node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) &&
      isInsideJsxAttribute(node)
    ) {
      if (RX_CYRILLIC.test(node.text)) {
        const path = mapping.get(node.text);
        if (!path) {
          unmappable += 1;
        } else {
          // Two replacement shapes:
          //   prop="X"                  → prop={messages.x}
          //   prop={cond ? "X" : "Y"}   → prop={cond ? messages.x : messages.y}
          // The first needs `{…}` because a JSX-attribute initialiser must
          // be either a StringLiteral or JsxExpression; the second is
          // already inside a JsxExpression, so a bare reference is enough.
          const wrap =
            node.parent && node.parent.kind === ts.SyntaxKind.JsxAttribute;
          edits.push({
            start: node.getStart(sf),
            end: node.getEnd(),
            replacement: wrap ? `{${path}}` : path,
          });
        }
      }
      return;
    }

    ts.forEachChild(node, visit);
  }

  try {
    visit(sf);
  } catch (err) {
    parseError = err;
  }

  return { edits, unmappable, parseError };
}

function applyEdits(source, edits) {
  // Apply from end to start so earlier offsets stay valid.
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = source;
  for (const e of sorted) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return out;
}

// ── 3. Inject `import { messages } from "@shared/i18n/uk";` ────────────

const MESSAGES_IMPORT_DEFAULT = 'import { messages } from "@shared/i18n/uk";';

const RX_CATALOG_IMPORT =
  /^import\s*\{\s*([^}]*)\}\s*from\s*(["'])([^"']*shared\/i18n\/uk)\2\s*;?[ \t]*$/m;

function ensureMessagesImport(source) {
  const existing = source.match(RX_CATALOG_IMPORT);
  if (existing) {
    const list = existing[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.includes("messages")) return source;
    list.push("messages");
    const newImport = `import { ${list.join(", ")} } from ${existing[2]}${existing[3]}${existing[2]};`;
    return source.replace(RX_CATALOG_IMPORT, newImport);
  }

  // Insert after the last top-level ImportDeclaration. We must walk the AST
  // here (not regex) because multi-line imports like
  //   import {
  //     type X,
  //     y,
  //   } from "z";
  // span several lines and a `^import …\n` regex would misidentify the
  // first `import {` line as the entire statement, causing the injection
  // to land inside the multi-line import block. (Bug fixed round 16.)
  const sf = ts.createSourceFile(
    "tmp.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let lastImportEnd = -1;
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      lastImportEnd = stmt.getEnd();
    }
  }
  if (lastImportEnd < 0) return `${MESSAGES_IMPORT_DEFAULT}\n${source}`;
  // Skip over the trailing newline (if any) after the last import so the
  // injected line lands on its own line, matching the project's existing
  // import-block formatting.
  let insertAt = lastImportEnd;
  if (source[insertAt] === "\n") insertAt += 1;
  return (
    source.slice(0, insertAt) +
    `${MESSAGES_IMPORT_DEFAULT}\n` +
    source.slice(insertAt)
  );
}

// ── 4. Main ────────────────────────────────────────────────────────────

const mapping = buildMapping();
console.log(`[i18n-burndown] catalog mapping size = ${mapping.size}`);

const allowlistRaw = readFileSync(ALLOWLIST_PATH, "utf8");
const allowlist = JSON.parse(allowlistRaw);
const filteredAllowlist = FILTER
  ? allowlist.filter((p) => p.includes(FILTER))
  : allowlist;

const migrated = [];
const skipped = [];
const errors = [];

for (const relPath of filteredAllowlist) {
  const absPath = resolve(REPO_ROOT, relPath);
  let before;
  try {
    before = readFileSync(absPath, "utf8");
  } catch (err) {
    errors.push({ relPath, err: String(err) });
    continue;
  }

  const { edits, unmappable, parseError } = rewriteFile(
    absPath,
    before,
    mapping,
  );

  if (parseError) {
    errors.push({ relPath, err: String(parseError) });
    continue;
  }
  if (edits.length === 0 && unmappable === 0) {
    skipped.push({ relPath, reason: "no-cyrillic-jsx" });
    continue;
  }
  if (unmappable > 0) {
    skipped.push({
      relPath,
      reason: `partial: ${edits.length} mappable + ${unmappable} unmappable`,
    });
    continue;
  }

  let after = applyEdits(before, edits);
  after = ensureMessagesImport(after);
  migrated.push({ relPath, count: edits.length, after });
}

if (WRITE) {
  for (const m of migrated) {
    writeFileSync(resolve(REPO_ROOT, m.relPath), m.after);
  }
  if (migrated.length > 0) {
    const migratedSet = new Set(migrated.map((m) => m.relPath));
    const newAllowlist = allowlist.filter((p) => !migratedSet.has(p));
    writeFileSync(ALLOWLIST_PATH, JSON.stringify(newAllowlist, null, 2) + "\n");
  }
}

const totalReplacements = migrated.reduce((acc, m) => acc + m.count, 0);
const newAllowlistSize = allowlist.length - migrated.length;
console.log(
  `[i18n-burndown] ${WRITE ? "migrated" : "would migrate"} ${migrated.length} ` +
    `file(s) (${totalReplacements} replacement(s)); skipped ${skipped.length}; ` +
    `allowlist: ${allowlist.length} → ${newAllowlistSize}`,
);
for (const m of migrated) {
  console.log(`  - ${m.relPath} (${m.count})`);
}
if (skipped.length > 0 && argv.includes("--verbose")) {
  console.log("[i18n-burndown] skipped:");
  for (const s of skipped) console.log(`  - ${s.relPath}: ${s.reason}`);
}
if (errors.length > 0) {
  console.error(`[i18n-burndown] ${errors.length} error(s):`);
  for (const e of errors) console.error(`  - ${e.relPath}: ${e.err}`);
  exit(2);
}
