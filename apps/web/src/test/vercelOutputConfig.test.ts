import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("Vercel output configuration", () => {
  it("points Vercel at an output directory inside the selected project root", () => {
    const repoRootConfig = readJson(
      resolve(process.cwd(), "../../vercel.json"),
    );
    const webRootConfig = readJson(resolve(process.cwd(), "vercel.json"));

    expect(repoRootConfig.outputDirectory).toBe("apps/web/dist");
    expect(webRootConfig.outputDirectory).toBe("dist");
  });
});
