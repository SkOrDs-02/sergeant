import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Extra coverage for `readStrategyDoc` beyond `tools.test.ts` §"readStrategyDoc
 * security boundaries" / "ENOENT handling": the directory-listing branch, and
 * the two defensive rethrow branches (non-traversal `safeJoin` error,
 * non-ENOENT `fs.stat` error) that the happy-path/ENOENT tests can't reach
 * without mocking their collaborators directly.
 */

describe("readStrategyDoc: directory listing", () => {
  let fakeRepoRoot: string;
  let originalEnv: string | undefined;

  beforeAll(async () => {
    fakeRepoRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "openclaw-strategy-docs-"),
    );
    originalEnv = process.env["OPENCLAW_REPO_ROOT"];
    process.env["OPENCLAW_REPO_ROOT"] = fakeRepoRoot;
  });

  afterAll(async () => {
    if (originalEnv === undefined) {
      delete process.env["OPENCLAW_REPO_ROOT"];
    } else {
      process.env["OPENCLAW_REPO_ROOT"] = originalEnv;
    }
    await fs.rm(fakeRepoRoot, { recursive: true, force: true });
  });

  it("returns a sorted newline-joined entry list with size = entry count", async () => {
    const { readStrategyDoc } = await import("./tools-strategy-docs.js");
    const stratDir = path.join(fakeRepoRoot, "docs", "strategy");
    await fs.mkdir(stratDir, { recursive: true });
    await fs.writeFile(path.join(stratDir, "zeta.md"), "z", "utf-8");
    await fs.writeFile(path.join(stratDir, "alpha.md"), "a", "utf-8");

    const result = await readStrategyDoc({ path: "docs/strategy" });
    expect(result.path).toBe("docs/strategy");
    expect(result.size).toBe(2);
    expect(result.contents).toBe("alpha.md\nzeta.md");
  });
});

describe("readStrategyDoc: defensive rethrow branches", () => {
  afterAll(() => {
    vi.resetModules();
    vi.doUnmock("./safeJoin.js");
    vi.doUnmock("node:fs");
  });

  it("rethrows a non-traversal error raised by safeJoin unchanged", async () => {
    vi.resetModules();
    vi.doMock("./safeJoin.js", async () => {
      const actual =
        await vi.importActual<typeof import("./safeJoin.js")>("./safeJoin.js");
      return {
        ...actual,
        safeJoin: () => {
          throw new Error("boom: unrelated filesystem failure");
        },
      };
    });
    const { readStrategyDoc } = await import("./tools-strategy-docs.js");
    await expect(
      readStrategyDoc({ path: "docs/strategy/foo.md" }),
    ).rejects.toThrow(/boom: unrelated filesystem failure/);
  });

  it("rethrows a non-ENOENT fs.stat error unchanged (not wrapped as NotFoundError)", async () => {
    vi.resetModules();
    vi.doUnmock("./safeJoin.js");
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        promises: {
          ...actual.promises,
          stat: async () => {
            const err = Object.assign(new Error("permission denied"), {
              code: "EACCES",
            });
            throw err;
          },
        },
      };
    });
    const { readStrategyDoc } = await import("./tools-strategy-docs.js");
    const { OpenClawNotFoundError } = await import("./tools-errors.js");
    await expect(
      readStrategyDoc({ path: "docs/strategy/foo.md" }),
    ).rejects.toThrow(/permission denied/);
    await expect(
      readStrategyDoc({ path: "docs/strategy/foo.md" }),
    ).rejects.not.toBeInstanceOf(OpenClawNotFoundError);
  });
});
