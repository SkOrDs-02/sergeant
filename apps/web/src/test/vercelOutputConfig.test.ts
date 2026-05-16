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

  it("serves SPA route HTML with edge no-cache headers", () => {
    const webRootConfig = readJson(resolve(process.cwd(), "vercel.json")) as {
      headers?: Array<{
        source: string;
        headers: Array<{ key: string; value: string }>;
      }>;
    };

    const spaHtmlHeaders = webRootConfig.headers?.find(
      (entry) =>
        entry.source === "/((?!api/|assets/|_vercel/|\\.well-known/).*)",
    );
    const cacheControl = spaHtmlHeaders?.headers.find(
      (header) => header.key.toLowerCase() === "cache-control",
    );

    expect(cacheControl?.value).toBe(
      "public, max-age=0, must-revalidate, s-maxage=0",
    );
  });
});
