import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Tombstone за зразком `syncV1Sunset.test.ts`: роут `/api/account/recovery`
// не існує і не буде (Варіант C, docs/work/specs/account-recovery.md).
// Скидання пароля - `/api/auth/request-password-reset` (Better Auth).
const ROOT = join(import.meta.dirname, "../../../..");
const SCAN_ROOTS = [
  "apps/web/src",
  "apps/mobile/src",
  "packages/api-client/src",
  "packages/shared/src",
];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const SELF = "accountRecoverySunset.test.ts";
const NEEDLES = ["/api/account/recovery", "AccountRecovery"] as const;

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (fullPath.includes(join("src", "generated"))) return [];
    if (entry.isDirectory()) return listFiles(fullPath);
    if (!entry.isFile() || entry.name === SELF) return [];
    const dot = entry.name.lastIndexOf(".");
    return EXTENSIONS.has(dot === -1 ? "" : entry.name.slice(dot))
      ? [fullPath]
      : [];
  });
}

describe("account-recovery contract sunset", () => {
  it("does not reintroduce the removed /api/account/recovery contract", () => {
    const offenders = SCAN_ROOTS.flatMap((root) =>
      listFiles(join(ROOT, root)).filter((file) => {
        const text = readFileSync(file, "utf8");
        return NEEDLES.some((needle) => text.includes(needle));
      }),
    ).map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});
