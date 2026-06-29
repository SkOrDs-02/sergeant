import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, relative, join, sep, posix } from "node:path";
import { logger } from "../shared/logger.js";
import type { DriftFinding } from "../shared/types.js";

interface ImportMap {
  readonly [absPath: string]: readonly string[];
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  "tools/entropy-janitors",
  "tools/agent-snapshot",
  "tools/tsconfig-guard",
  ".pnpm-store",
  ".husky",
  "scripts",
]);

const SOURCE_EXTS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

const IMPORT_RE =
  /(?:^|[^\w])(?:import\s+(?:[^'"`;]+?\s+from\s+)?|export\s+(?:[^'"`;]+?\s+from\s+)|from\s+|import\()\s*['"]([^'"]+)['"]/g;

function toPosix(p: string): string {
  return p.split(sep).join(posix.sep);
}

function resolveImport(
  spec: string,
  fromFile: string,
  root: string,
): string | null {
  if (spec.startsWith("node:") || spec.startsWith("virtual:")) return null;
  if (
    spec.startsWith("@sergeant/") ||
    spec.startsWith("@finyk/") ||
    spec.startsWith("@fizruk/") ||
    spec.startsWith("@nutrition/") ||
    spec.startsWith("@routine/") ||
    spec.startsWith("@insights/")
  ) {
    return null;
  }
  if (!spec.startsWith(".") && !spec.startsWith("/")) {
    return null;
  }
  const base = resolve(fromFile, "..", spec);
  for (const ext of SOURCE_EXTS) {
    const candidate = base + ext;
    if (candidate.startsWith(root)) {
      return candidate;
    }
  }
  const indexMatch = SOURCE_EXTS.map((e) => join(base, `index${e}`)).find((p) =>
    p.startsWith(root),
  );
  return indexMatch ?? null;
}

async function* walkSrc(dir: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walkSrc(full);
    } else if (e.isFile() && SOURCE_EXTS.some((ext) => e.name.endsWith(ext))) {
      yield full;
    }
  }
}

async function buildImportMap(
  root: string,
): Promise<{ map: ImportMap; files: number }> {
  const map: Record<string, string[]> = {};
  const roots: string[] = [];
  for (const top of ["apps", "packages"]) {
    const topAbs = resolve(root, top);
    try {
      const s = await stat(topAbs);
      if (s.isDirectory()) roots.push(topAbs);
    } catch {
      // ignore
    }
  }
  let count = 0;
  for (const r of roots) {
    for await (const f of walkSrc(r)) {
      count += 1;
      let body: string;
      try {
        body = await readFile(f, "utf8");
      } catch {
        continue;
      }
      const out: string[] = [];
      IMPORT_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = IMPORT_RE.exec(body)) !== null) {
        const spec = m[1];
        if (!spec) continue;
        const resolved = resolveImport(spec, f, root);
        if (resolved) out.push(resolved);
      }
      if (out.length > 0) map[f] = out;
    }
  }
  return { map, files: count };
}

function findCycles(map: ImportMap): string[][] {
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const dfs = (node: string): void => {
    if (onStack.has(node)) {
      const idx = stack.indexOf(node);
      if (idx >= 0) {
        const cycle = stack.slice(idx).concat(node);
        const key = cycle.slice(0, -1).sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
      }
      return;
    }
    if (seen.has(`node:${node}`)) return;
    onStack.add(node);
    stack.push(node);
    for (const next of map[node] ?? []) {
      dfs(next);
    }
    stack.pop();
    onStack.delete(node);
    seen.add(`node:${node}`);
  };

  for (const node of Object.keys(map)) {
    dfs(node);
  }
  return cycles;
}

export interface DepCycleScan {
  readonly scanned: number;
  readonly findings: readonly DriftFinding[];
  readonly cycles: readonly (readonly string[])[];
}

export async function scanDepCycles(
  root: string,
  limit: number,
): Promise<DepCycleScan> {
  const { map, files } = await buildImportMap(root);
  const cycles = findCycles(map);
  const findings: DriftFinding[] = cycles.slice(0, limit).map((cycle) => {
    const rel = cycle.map((p) => relative(root, p));
    return {
      kind: "circular-dep",
      path: rel[0] ?? "<unknown>",
      message: `Circular dependency: ${rel.join(" → ")}`,
      severity: "error",
    };
  });
  logger.info("dep-cycles scan complete", {
    files,
    cycles: cycles.length,
    findings: findings.length,
  });
  return { scanned: files, findings, cycles };
}

export const __test_only = { resolveImport, findCycles, toPosix };
