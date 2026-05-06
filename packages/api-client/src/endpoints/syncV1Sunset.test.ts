import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "../../../..");
const SCAN_ROOTS = [
  "apps/web/src",
  "apps/mobile/src",
  "packages/api-client/src",
];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const LEGACY_PATHS = [
  "/api/sync/push",
  "/api/sync/pull",
  "/api/sync/push-all",
  "/api/sync/pull-all",
] as const;

function extensionOf(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (fullPath.includes(`${join("src", "generated")}`)) {
      return [];
    }
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return listFiles(fullPath);
    if (!EXTENSIONS.has(extensionOf(fullPath))) return [];
    return [fullPath];
  });
}

describe("CloudSync v1 client sunset", () => {
  it("does not keep client-side calls to legacy /api/sync endpoints", () => {
    const offenders = SCAN_ROOTS.flatMap((root) =>
      listFiles(join(ROOT, root)).flatMap((file) => {
        if (file.endsWith("syncV1Sunset.test.ts")) return [];
        const text = readFileSync(file, "utf8");
        return LEGACY_PATHS.filter((path) => text.includes(path)).map(
          (path) => `${relative(ROOT, file)} -> ${path}`,
        );
      }),
    );

    expect(offenders).toEqual([]);
  });
});
