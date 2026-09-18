/**
 * Last validated: 2026-06-15
 * Status: Active
 *
 * Per-module "selector" guard (T-7) for fizruk.
 *
 * Unlike finyk and nutrition, the fizruk module is **local-first**: its data
 * layer is SQLite/localStorage-backed (see `useWorkouts`, `useDailyLog`,
 * `useRestSettings`), so it owns *no* `fizrukKeys` factory and issues no
 * server-side React-Query reads. The T-7 card's "selector test" maps here to a
 * containment invariant that protects Hard Rule #2 from the other direction:
 *
 *   1. There is no `fizrukKeys` export to drift from the centralized factory.
 *   2. fizruk source hooks introduce no inline `queryKey: [...]` literals — if
 *      a future remote read lands, it must add a `fizrukKeys` factory in
 *      `@shared/lib/api/queryKeys.ts` rather than hand-rolling a tuple inside
 *      the module (which would silently re-key on every render and dodge the
 *      centralized invalidation contract).
 *
 * This is a structural source scan, intentionally not a runtime assertion.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as queryKeys from "@shared/lib/api/queryKeys";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIZRUK_ROOT = join(HERE, "..");

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

describe("fizruk · query-key containment (Hard Rule #2)", () => {
  it("exposes no fizrukKeys factory (module is local-first)", () => {
    expect("fizrukKeys" in queryKeys).toBe(false);
  });

  it("no fizruk source file hand-rolls an inline queryKey literal", () => {
    const offenders: string[] = [];
    // Matches `queryKey: [` / `queryKey:[` — the inline-tuple anti-pattern
    // Hard Rule #2 forbids. A legitimate future remote read would reference a
    // factory (`queryKey: fizrukKeys.x()`), which this pattern does not flag.
    const inlineKeyPattern = /queryKey\s*:\s*\[/;
    for (const file of collectSourceFiles(FIZRUK_ROOT)) {
      const src = readFileSync(file, "utf8");
      if (inlineKeyPattern.test(src)) {
        offenders.push(file.slice(FIZRUK_ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });
});
