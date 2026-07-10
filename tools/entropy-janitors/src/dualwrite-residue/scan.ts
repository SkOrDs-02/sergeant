import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { DriftFinding } from "../shared/types.js";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".turbo",
  "__snapshots__",
  "DesignShowcase",
]);

const SKIP_FILE_SUFFIXES = [
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
  ".sqlsnapshot.test.ts",
];

const MODULE_KEY_RE =
  /(?:readJSON|safeReadLS|writeJSON|writeJSONDebounced|safeWriteLS|localStorage\.(?:get|set)Item|\bls\s*\()\s*(?:<[^>]*>\s*)?\(?\s*["'`](?:finyk_|fizruk_|nutrition_|hub_routine)/;

const TOMBSTONED_READ_RE =
  /(?:readJSON|safeReadLS|localStorage\.getItem|\bls\s*\()\s*(?:<[^>]*>\s*)?\(?\s*["'`]finyk_(?:tx_cache|info_cache)/;

const TOMBSTONED_REMOVE_OK =
  /(?:remove(?:Item|FinykStorageItem)|safeRemoveLS|removeFinykStorageItem)/;

interface Baseline {
  readonly schemaVersion: number;
  readonly allowedPaths: readonly string[];
  readonly canonicalResidualImportPaths: readonly string[];
}

export interface DualwriteResidueScanOptions {
  readonly root: string;
  readonly limit: number;
}

export interface DualwriteResidueScan {
  readonly scanned: number;
  readonly findings: readonly DriftFinding[];
}

function toPosix(p: string): string {
  return p.split("\\").join("/");
}

function shouldSkipFile(name: string): boolean {
  if (name === "residualImport.ts") return true;
  if (name.startsWith("seedDemoData")) return false;
  return SKIP_FILE_SUFFIXES.some((s) => name.endsWith(s));
}

function shouldSkipDir(relPath: string): boolean {
  const parts = relPath.split("/");
  return parts.some((p) => SKIP_DIRS.has(p));
}

async function* walkSourceFiles(
  dir: string,
  root: string,
): AsyncGenerator<{ rel: string; abs: string }> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = join(dir, e.name);
    const rel = toPosix(relative(root, abs));
    if (e.isDirectory()) {
      if (shouldSkipDir(rel)) continue;
      if (rel.includes("seedDemoData")) {
        yield* walkSourceFiles(abs, root);
        continue;
      }
      yield* walkSourceFiles(abs, root);
    } else if (
      e.isFile() &&
      (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) &&
      !shouldSkipFile(e.name) &&
      (rel.startsWith("apps/web/src/") || rel.startsWith("apps/mobile/src/"))
    ) {
      yield { rel, abs };
    }
  }
}

async function loadBaseline(root: string): Promise<Baseline> {
  const p = join(
    root,
    "tools/entropy-janitors/src/dualwrite-residue/baseline.json",
  );
  const raw = await readFile(p, "utf8");
  return JSON.parse(raw) as Baseline;
}

async function findResidualImportFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const app of ["apps/web/src", "apps/mobile/src"] as const) {
    for (const mod of ["finyk", "fizruk", "nutrition", "routine"] as const) {
      const p = join(root, app, "modules", mod, "lib", "residualImport.ts");
      try {
        await stat(p);
        out.push(toPosix(relative(root, p)));
      } catch {
        // missing — reported separately
      }
    }
  }
  return out.sort();
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.endsWith("*/")
  );
}

function lineHasModuleKeyRead(line: string): boolean {
  if (isCommentLine(line)) return false;
  return MODULE_KEY_RE.test(line);
}

function lineHasTombstonedRead(line: string): boolean {
  if (isCommentLine(line)) return false;
  if (TOMBSTONED_REMOVE_OK.test(line)) return false;
  return TOMBSTONED_READ_RE.test(line);
}

export async function scanDualwriteResidue(
  options: DualwriteResidueScanOptions,
): Promise<DualwriteResidueScan> {
  const baseline = await loadBaseline(options.root);
  const allowed = new Set(baseline.allowedPaths.map(toPosix));
  const canonicalResidual = new Set(
    baseline.canonicalResidualImportPaths.map(toPosix),
  );
  const findings: DriftFinding[] = [];

  const residualFiles = await findResidualImportFiles(options.root);
  for (const p of residualFiles) {
    if (!canonicalResidual.has(p)) {
      findings.push({
        kind: "broken-ref",
        path: p,
        message:
          "residualImport.ts outside the 8 canonical module paths — demo-bootstrap bridge must not spread.",
        severity: "error",
      });
    }
  }
  for (const expected of canonicalResidual) {
    if (!residualFiles.includes(expected)) {
      findings.push({
        kind: "missing-file",
        path: expected,
        message: "Expected demo-bootstrap residualImport.ts is missing.",
        severity: "warning",
      });
    }
  }

  let scanned = 0;
  for await (const { rel, abs } of walkSourceFiles(
    join(options.root, "apps"),
    options.root,
  )) {
    if (rel.includes("/seedDemoData/")) continue;
    scanned += 1;
    let body: string;
    try {
      body = await readFile(abs, "utf8");
    } catch {
      continue;
    }
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      const lineNo = i + 1;
      if (lineHasTombstonedRead(line)) {
        findings.push({
          kind: "broken-ref",
          path: rel,
          line: lineNo,
          message:
            "Tombstoned finyk_tx_cache / finyk_info_cache LS read — use monoMirrorReader instead.",
          severity: "error",
        });
      } else if (lineHasModuleKeyRead(line) && !allowed.has(rel)) {
        findings.push({
          kind: "broken-ref",
          path: rel,
          line: lineNo,
          message:
            "Raw LS/MMKV read/write of module data outside teardown allowlist — migrate to sqliteWriter or add to baseline with justification.",
          severity: "warning",
        });
      }
      if (findings.length >= options.limit) break;
    }
    if (findings.length >= options.limit) break;
  }

  return { scanned, findings: findings.slice(0, options.limit) };
}

export const __test_only = {
  lineHasModuleKeyRead,
  lineHasTombstonedRead,
  toPosix,
};
