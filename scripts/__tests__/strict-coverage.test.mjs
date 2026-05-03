import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanStrictCoverage, formatMarkdown } from "../strict-coverage.mjs";

function createTmpRepo(structure) {
  const root = mkdtempSync(join(tmpdir(), "strict-cov-test-"));
  for (const [relPath, content] of Object.entries(structure)) {
    const fullPath = join(root, relPath);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, JSON.stringify(content, null, 2));
  }
  return root;
}

describe("scanStrictCoverage", () => {
  test("detects strict: true from direct config", () => {
    const root = createTmpRepo({
      "apps/web/tsconfig.json": {
        compilerOptions: { strict: true },
      },
      "packages/shared/tsconfig.json": {
        compilerOptions: { strict: false, strictNullChecks: true },
      },
    });

    try {
      const result = scanStrictCoverage(root);
      assert.equal(result.packages.length, 2);

      const web = result.packages.find((p) => p.name === "apps/web");
      assert.equal(web.strict, true);
      assert.equal(web.strictNullChecks, true);
      assert.equal(web.noImplicitAny, true);

      const shared = result.packages.find((p) => p.name === "packages/shared");
      assert.equal(shared.strict, false);
      assert.equal(shared.strictNullChecks, true);
      assert.equal(shared.noImplicitAny, false);

      assert.equal(result.summary.total, 2);
      assert.equal(result.summary.strictCount, 1);
      assert.equal(result.summary.pct, 50);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("resolves extends from relative path", () => {
    const root = createTmpRepo({
      "packages/config/tsconfig.base.json": {
        compilerOptions: { strict: true, allowJs: true },
      },
      "packages/shared/tsconfig.json": {
        extends: "../../packages/config/tsconfig.base.json",
        compilerOptions: {},
      },
    });

    try {
      const result = scanStrictCoverage(root);
      const shared = result.packages.find((p) => p.name === "packages/shared");
      assert.equal(shared.strict, true);
      assert.equal(shared.allowJs, true);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("override in child takes precedence over extends", () => {
    const root = createTmpRepo({
      "packages/config/tsconfig.base.json": {
        compilerOptions: { strict: true },
      },
      "apps/web/tsconfig.json": {
        extends: "../../packages/config/tsconfig.base.json",
        compilerOptions: { strict: false, allowJs: true },
      },
    });

    try {
      const result = scanStrictCoverage(root);
      const web = result.packages.find((p) => p.name === "apps/web");
      assert.equal(web.strict, false);
      assert.equal(web.strictNullChecks, false);
      assert.equal(web.allowJs, true);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("resolves @sergeant/config workspace alias without node_modules", () => {
    // Regression for the case where `pnpm install` has not yet populated
    // `node_modules` (cold dev clones, isolated CI stages): the script
    // must still inherit `strict: true` through the workspace alias the
    // way `tools/tsconfig-guard/check.mjs` does.
    const root = createTmpRepo({
      "packages/config/tsconfig.base.json": {
        compilerOptions: { strict: true },
      },
      "packages/shared/tsconfig.json": {
        extends: "@sergeant/config/tsconfig.base.json",
        compilerOptions: {},
      },
      "apps/web/tsconfig.json": {
        extends: "@sergeant/config/tsconfig.base.json",
        compilerOptions: { strict: true },
      },
    });

    try {
      const result = scanStrictCoverage(root);
      const shared = result.packages.find((p) => p.name === "packages/shared");
      assert.equal(shared.strict, true);
      assert.equal(shared.strictNullChecks, true);
      assert.equal(shared.noImplicitAny, true);
      assert.equal(result.summary.strictCount, 2);
      assert.equal(result.summary.total, 2);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("explicit sub-flag override takes precedence over strict: true", () => {
    const root = createTmpRepo({
      "apps/api/tsconfig.json": {
        compilerOptions: {
          strict: true,
          strictNullChecks: false,
          noImplicitAny: false,
        },
      },
    });

    try {
      const result = scanStrictCoverage(root);
      const api = result.packages.find((p) => p.name === "apps/api");
      assert.equal(api.strict, true);
      assert.equal(api.strictNullChecks, false);
      assert.equal(api.noImplicitAny, false);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});

describe("formatMarkdown", () => {
  test("produces valid markdown table", () => {
    const result = {
      packages: [
        {
          name: "apps/web",
          path: "apps/web/tsconfig.json",
          strict: false,
          strictNullChecks: true,
          noImplicitAny: false,
          allowJs: true,
        },
        {
          name: "packages/shared",
          path: "packages/shared/tsconfig.json",
          strict: true,
          strictNullChecks: true,
          noImplicitAny: true,
          allowJs: false,
        },
      ],
      summary: { total: 2, strictCount: 1, pct: 50 },
    };

    const md = formatMarkdown(result);
    assert.ok(md.includes("## Strict TypeScript Coverage"));
    assert.ok(md.includes("1 / 2 packages"));
    assert.ok(md.includes("50%"));
    assert.ok(md.includes("| apps/web |"));
    assert.ok(md.includes("| packages/shared |"));
  });
});
