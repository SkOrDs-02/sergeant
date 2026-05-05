import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("Vercel output configuration", () => {
  it("points Vercel at an output directory inside the selected project root", () => {
    // SSOT lives next to the app — Vercel's Root Directory is `apps/web`, so
    // it only reads `apps/web/vercel.json`. A repo-root `vercel.json` is
    // explicitly disallowed and `scripts/check-vercel-config.sh` enforces
    // that on every PR (see commit 61196120).
    const webRootConfig = readJson(resolve(process.cwd(), "vercel.json"));
    expect(webRootConfig.outputDirectory).toBe("dist");

    const repoRootConfigPath = resolve(process.cwd(), "../../vercel.json");
    expect(existsSync(repoRootConfigPath)).toBe(false);
  });
});
