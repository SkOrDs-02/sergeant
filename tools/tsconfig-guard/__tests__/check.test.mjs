import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { run } from "../check.mjs";

const TMP = join(import.meta.dirname, "__fixtures__");

function scaffold(appConfigs, { base, allowlist } = {}) {
  rmSync(TMP, { recursive: true, force: true });

  // packages/config/tsconfig.base.json
  const configDir = join(TMP, "packages/config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "tsconfig.base.json"),
    JSON.stringify(
      base || {
        compilerOptions: {
          strict: true,
          noImplicitAny: true,
          strictNullChecks: true,
        },
      },
    ),
  );

  // packages/config/tsconfig.react.json (intermediate)
  writeFileSync(
    join(configDir, "tsconfig.react.json"),
    JSON.stringify({
      extends: "./tsconfig.base.json",
      compilerOptions: { jsx: "react-jsx" },
    }),
  );

  // apps
  for (const [name, config] of Object.entries(appConfigs)) {
    const appDir = join(TMP, "apps", name);
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, "tsconfig.json"), JSON.stringify(config));
  }

  // guard dir with allowlist
  const guardDir = join(TMP, "guard");
  mkdirSync(guardDir, { recursive: true });
  writeFileSync(
    join(guardDir, "allowlist.json"),
    JSON.stringify(allowlist || []),
  );

  return { rootDir: TMP, guardDir };
}

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
});

describe("tsconfig-guard", () => {
  it("fails when app has strict:false without allowlist", () => {
    const { rootDir, guardDir } = scaffold({
      web: {
        extends: "../../packages/config/tsconfig.react.json",
        compilerOptions: { strict: false },
      },
    });

    const code = run({ rootDir, guardDir });
    expect(code).toBe(1);
  });

  it("passes when app has strict:true matching base", () => {
    const { rootDir, guardDir } = scaffold({
      web: {
        extends: "../../packages/config/tsconfig.react.json",
        compilerOptions: { strict: true },
      },
    });

    const code = run({ rootDir, guardDir });
    expect(code).toBe(0);
  });

  it("passes when app inherits strict from base (no explicit override)", () => {
    const { rootDir, guardDir } = scaffold({
      server: {
        extends: "../../packages/config/tsconfig.base.json",
        compilerOptions: { allowJs: true },
      },
    });

    const code = run({ rootDir, guardDir });
    expect(code).toBe(0);
  });

  it("passes when app has strict:false with valid allowlist entry", () => {
    const { rootDir, guardDir } = scaffold(
      {
        web: {
          extends: "../../packages/config/tsconfig.react.json",
          compilerOptions: { strict: false },
        },
      },
      {
        allowlist: [
          {
            path: "apps/web",
            option: "strict",
            value: false,
            reason: "PR-6.C in flight",
            expires: "2099-12-31",
          },
        ],
      },
    );

    const code = run({ rootDir, guardDir });
    expect(code).toBe(0);
  });

  it("fails when allowlist entry has expired", () => {
    const { rootDir, guardDir } = scaffold(
      {
        web: {
          extends: "../../packages/config/tsconfig.react.json",
          compilerOptions: { strict: false },
        },
      },
      {
        allowlist: [
          {
            path: "apps/web",
            option: "strict",
            value: false,
            reason: "PR-6.C in flight",
            expires: "2020-01-01",
          },
        ],
      },
    );

    const code = run({ rootDir, guardDir, now: new Date("2025-06-01") });
    expect(code).toBe(1);
  });

  it("skips apps that do not extend from packages/config", () => {
    const { rootDir, guardDir } = scaffold({
      mobile: {
        compilerOptions: { strict: false },
      },
    });

    const code = run({ rootDir, guardDir });
    expect(code).toBe(0);
  });

  it("detects noImplicitAny drift", () => {
    const { rootDir, guardDir } = scaffold({
      web: {
        extends: "../../packages/config/tsconfig.base.json",
        compilerOptions: { noImplicitAny: false },
      },
    });

    const code = run({ rootDir, guardDir });
    expect(code).toBe(1);
  });

  it("detects strictNullChecks drift", () => {
    const { rootDir, guardDir } = scaffold({
      web: {
        extends: "../../packages/config/tsconfig.base.json",
        compilerOptions: { strictNullChecks: false },
      },
    });

    const code = run({ rootDir, guardDir });
    expect(code).toBe(1);
  });

  it("detects noUncheckedIndexedAccess drift when base sets it true", () => {
    const { rootDir, guardDir } = scaffold(
      {
        web: {
          extends: "../../packages/config/tsconfig.base.json",
          compilerOptions: { noUncheckedIndexedAccess: false },
        },
      },
      {
        base: {
          compilerOptions: {
            strict: true,
            noImplicitAny: true,
            strictNullChecks: true,
            noUncheckedIndexedAccess: true,
          },
        },
      },
    );

    const code = run({ rootDir, guardDir });
    expect(code).toBe(1);
  });

  it("passes noUncheckedIndexedAccess override with valid allowlist entry", () => {
    const { rootDir, guardDir } = scaffold(
      {
        web: {
          extends: "../../packages/config/tsconfig.base.json",
          compilerOptions: { noUncheckedIndexedAccess: false },
        },
      },
      {
        base: {
          compilerOptions: {
            strict: true,
            noImplicitAny: true,
            strictNullChecks: true,
            noUncheckedIndexedAccess: true,
          },
        },
        allowlist: [
          {
            path: "apps/web",
            option: "noUncheckedIndexedAccess",
            value: false,
            reason: "Phase 6a per-module rollout — see frontend.md §11.1",
            expires: "2099-12-31",
          },
        ],
      },
    );

    const code = run({ rootDir, guardDir });
    expect(code).toBe(0);
  });
});
