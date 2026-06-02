/// <reference types="node" />
// `apps/web/tsconfig.json` ships `"types": ["vite/client"]` so the standalone
// `tsc-files` pre-commit (initiative 0009 PR 1.3) cannot see Node's globals
// when this file is checked in isolation. The triple-slash reference adds
// `@types/node` only for this file — vitest config already pulls it in for
// `pnpm typecheck`, so this is a no-op in the project-wide build.

/**
 * Parses a Content-Security-Policy string into a `Map<directive, Set<source>>`.
 *
 * Each semicolon-delimited directive is split on whitespace: the first token
 * is the directive name; the rest are source expressions. Value-less
 * directives (e.g. `upgrade-insecure-requests`) produce an empty `Set`.
 *
 * Examples
 * --------
 * ```ts
 * const m = parseCsp("default-src 'self'; script-src 'self' https://cdn.example;");
 * m.get("default-src"); // Set { "'self'" }
 * m.get("script-src");  // Set { "'self'", "https://cdn.example" }
 * ```
 */
export function parseCsp(header: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const raw of header.split(";")) {
    const directive = raw.trim();
    if (!directive) continue;
    const [name, ...sources] = directive.split(/\s+/);
    if (!name) continue;
    out.set(name, new Set(sources));
  }
  return out;
}
