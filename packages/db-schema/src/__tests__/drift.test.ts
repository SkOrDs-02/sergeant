import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../../../..");

/**
 * Integration smoke-test for scripts/check-schema-drift.mjs (PR-11).
 * Runs the script against the real SQL migrations and Drizzle schema files.
 * Passes if and only if the script exits 0 (no drift detected).
 *
 * This test catches accidental regression where a SQL migration is added
 * without updating the Drizzle schema (or vice-versa) and the script's
 * whitelist is not updated to document the divergence.
 */
describe("Drizzle schema ↔ SQL migration drift", () => {
  it("reports no drift between packages/db-schema/src/pg and migrations", () => {
    let output = "";
    let exitCode = 0;
    try {
      output = execSync("node scripts/check-schema-drift.mjs --json", {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; status?: number };
      output = e.stdout ?? "";
      exitCode = e.status ?? 1;
    }

    let result: { ok: boolean; issues: Array<{ kind: string; message: string }> };
    try {
      result = JSON.parse(output);
    } catch {
      throw new Error(
        `check-schema-drift.mjs did not produce valid JSON.\nRaw output:\n${output}`,
      );
    }

    if (!result.ok) {
      const summary = result.issues
        .map((i) => `  [${i.kind}] ${i.message}`)
        .join("\n");
      throw new Error(
        `Schema drift detected (${result.issues.length} issue(s)):\n${summary}\n\n` +
          "Fix: update packages/db-schema/src/pg/*.ts to match SQL migrations,\n" +
          "or add a whitelist entry in scripts/check-schema-drift.mjs.",
      );
    }

    expect(result.ok).toBe(true);
    expect(exitCode).toBe(0);
  });
});
