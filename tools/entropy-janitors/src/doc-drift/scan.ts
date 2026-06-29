import { writeFile, readFile, mkdir, stat, readdir } from "node:fs/promises";
import { resolve, relative, join, sep, posix } from "node:path";
import { logger } from "../shared/logger.js";
import type { DriftFinding } from "../shared/types.js";

const BACKTICK_PATH = /`([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?::(\d+))?`/g;
const PATH_IN_PARENS = /\(([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?::(\d+))?\)/g;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".pnpm-store",
  ".husky",
  "tools/entropy-janitors/dist",
  "tools/entropy-janitors/node_modules",
]);

interface ScanOptions {
  readonly root: string;
  readonly limit: number;
}

export interface DocDriftScan {
  readonly scanned: number;
  readonly findings: readonly DriftFinding[];
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function* walkDocs(dir: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".github") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walkDocs(full);
    } else if (e.isFile() && e.name.endsWith(".md")) {
      yield full;
    }
  }
}

function* extractReferences(
  text: string,
): Generator<{ path: string; line?: number | undefined }> {
  for (const re of [BACKTICK_PATH, PATH_IN_PARENS]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const p = m[1];
      if (!p) continue;
      if (p.startsWith("http") || p.startsWith("https")) continue;
      if (p.startsWith("$") || p.startsWith("@")) continue;
      if (p.includes("${")) continue;
      if (!/[./]/.test(p)) continue;
      if (p.includes(" ")) continue;
      const line = m[2] ? Number.parseInt(m[2], 10) : undefined;
      if (line !== undefined && Number.isNaN(line)) continue;
      const ref: { path: string; line: number | undefined } = { path: p, line };
      yield ref;
    }
  }
}

function toPosix(p: string): string {
  return p.split(sep).join(posix.sep);
}

export async function scanDocDrift(
  options: ScanOptions,
): Promise<DocDriftScan> {
  const findings: DriftFinding[] = [];
  let scanned = 0;
  const docsRoot = resolve(options.root, "docs");
  if (!(await exists(docsRoot))) {
    logger.warn("docs/ missing, scanning .github and package READMEs only");
  }
  const targets: string[] = [];
  if (await exists(docsRoot)) {
    for await (const f of walkDocs(docsRoot)) targets.push(f);
  }
  const agentsRoot = resolve(options.root, ".agents");
  if (await exists(agentsRoot)) {
    for await (const f of walkDocs(agentsRoot)) targets.push(f);
  }
  const ghRoot = resolve(options.root, ".github");
  if (await exists(ghRoot)) {
    for await (const f of walkDocs(ghRoot)) targets.push(f);
  }
  for (const pkg of ["packages", "apps", "tools"]) {
    const root = resolve(options.root, pkg);
    if (!(await exists(root))) continue;
    for await (const f of walkDocs(root)) targets.push(f);
  }
  const uniqueTargets = Array.from(new Set(targets));
  for (const docPath of uniqueTargets) {
    if (findings.length >= options.limit) break;
    scanned += 1;
    let body: string;
    try {
      body = await readFile(docPath, "utf8");
    } catch {
      continue;
    }
    const relDoc = relative(options.root, docPath);
    const refs = Array.from(extractReferences(body));
    for (const ref of refs) {
      if (findings.length >= options.limit) break;
      const normalised = toPosix(ref.path);
      const candidates = [
        resolve(options.root, normalised),
        resolve(options.root, normalised.replace(/^@\w+\//, "")),
      ];
      const found = await Promise.all(candidates.map((p) => exists(p)));
      if (!found.some((x) => x)) {
        findings.push({
          kind: "missing-file",
          path: `${relDoc}`,
          line: ref.line,
          message: `Reference \`${normalised}\` does not exist in repo.`,
          severity: "error",
        });
        continue;
      }
      if (ref.line !== undefined) {
        const targetPath =
          candidates[found.findIndex((x) => x)] ?? candidates[0];
        if (targetPath === undefined) continue;
        let text: string;
        try {
          text = await readFile(targetPath, "utf8");
        } catch {
          continue;
        }
        const totalLines = text.split(/\r?\n/).length;
        if (ref.line > totalLines) {
          findings.push({
            kind: "broken-ref",
            path: relative(options.root, targetPath),
            line: ref.line,
            message: `Line ${ref.line} referenced from ${relDoc} exceeds file length (${totalLines}).`,
            severity: "error",
          });
        }
      }
    }
  }
  logger.info("doc-drift scan complete", {
    scanned,
    findings: findings.length,
  });
  return { scanned, findings };
}

export const __test_only = { extractReferences, toPosix, SKIP_DIRS };

void mkdir;
void writeFile;
