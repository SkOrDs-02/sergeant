import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Bundle-graph guard for PR #015 in `docs/planning/storage-roadmap.md`:
 *
 * The whole point of `core/db/sqlite.ts` is to ship sqlite-wasm in its
 * own async chunk so that the home screen does not pay for ~700 KB of
 * WASM that nobody is using yet.
 *
 * We guard this with a static-analysis assertion against the eager
 * import graph rooted at `apps/web/src/main.tsx`. If a future change
 * accidentally adds a top-level `import` of `core/db/sqlite` to any of
 * those files, this test fails and CI blocks the regression.
 *
 * It's intentionally a parser-free regex sweep: pulling in a real AST
 * walker would balloon the test runtime and the regex catches every
 * shape of static `import` while ignoring `await import(...)` calls,
 * which is exactly the property we're trying to enforce.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WEB_SRC = resolve(__dirname, "../../..");

const STATIC_IMPORT_RE =
  /^\s*import\s+[^;]*?from\s+["']([^"']+)["'][^;\n]*;?$/gm;

const SIDE_EFFECT_IMPORT_RE = /^\s*import\s+["']([^"']+)["']\s*;?$/gm;

const FORBIDDEN_LEAF = /(?:^|[\\/])core[\\/]db[\\/]sqlite(?:\.|$)/;

function readSource(absolute: string): string {
  return readFileSync(absolute, "utf8");
}

function collectStaticImports(absolute: string): string[] {
  const src = readSource(absolute);
  const out: string[] = [];
  for (const m of src.matchAll(STATIC_IMPORT_RE)) out.push(m[1]!);
  for (const m of src.matchAll(SIDE_EFFECT_IMPORT_RE)) out.push(m[1]!);
  return out;
}

describe("core/db/sqlite — lazy-import contract", () => {
  it("is NOT statically imported by main.tsx (eager entry)", () => {
    const main = resolve(WEB_SRC, "main.tsx");
    const specifiers = collectStaticImports(main);

    const offenders = specifiers.filter((s) => FORBIDDEN_LEAF.test(s));
    expect(
      offenders,
      `\`apps/web/src/main.tsx\` must not statically import \`core/db/sqlite\`. ` +
        `Use \`await import(…)\` from inside a feature instead so the ` +
        `sqlite-wasm chunk stays out of the initial bundle.`,
    ).toEqual([]);
  });

  it("uses dynamic import() internally to load the sqlite-wasm package", () => {
    const sqlite = resolve(WEB_SRC, "core/db/sqlite.ts");
    const src = readSource(sqlite);

    // Sanity check: the heavy `@sqlite.org/sqlite-wasm` import must be
    // dynamic (i.e., reachable only via `import("@sqlite.org/...")`),
    // never via a top-level `import ... from "@sqlite.org/..."`.
    const staticHits = [
      ...src.matchAll(STATIC_IMPORT_RE),
      ...src.matchAll(SIDE_EFFECT_IMPORT_RE),
    ]
      .map((m) => m[1])
      .filter((spec) => spec!.startsWith("@sqlite.org/sqlite-wasm")!);

    expect(
      staticHits,
      "core/db/sqlite.ts must only reference @sqlite.org/sqlite-wasm via dynamic import()",
    ).toEqual([]);

    expect(
      src.includes('import("@sqlite.org/sqlite-wasm")'),
      'core/db/sqlite.ts must call dynamic `import("@sqlite.org/sqlite-wasm")`',
    ).toBe(true);
  });
});
