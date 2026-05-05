/**
 * Unit tests for the `sergeant-design/no-flat-shared-lib` rule.
 *
 * After the 2026-05-03 reorg (PR #1479) every utility under
 * `apps/web/src/shared/lib/` lives in one of five subdirs
 * (`api/`, `storage/`, `modules/`, `adapters/`, `ui/`). The rule
 * forbids any import that resolves to a *top-level* flat file inside
 * that directory, so adding `apps/web/src/shared/lib/newUtil.ts` plus
 * `import { x } from "@shared/lib/newUtil"` would fail lint.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-flat-shared-lib";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(code, filename) {
  return linter.verify(
    code,
    {
      files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: "error" },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    { filename },
  );
}

const WEB_FILE = abs("apps/web/src/modules/finyk/pages/Overview.tsx");
const WEB_SHARED_BARREL = abs("apps/web/src/shared/lib/index.ts");
const WEB_SHARED_API = abs("apps/web/src/shared/lib/api/queryClient.ts");
const WEB_HOOK = abs("apps/web/src/shared/hooks/useFocusTrap.ts");
const MOBILE_FILE = abs("apps/mobile/src/modules/fizruk/screens/Workout.tsx");
const SERVER_FILE = abs("apps/server/src/modules/finyk/transactionsHandler.ts");

// ── BAD: should flag flat top-level imports ─────────────────────────────

describe("no-flat-shared-lib – flags flat @shared/lib/<name>", () => {
  it("flags `@shared/lib/cn`", () => {
    const messages = lint(`import { cn } from "@shared/lib/cn";`, WEB_FILE);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.ok(messages[0].message.includes("cn"));
  });

  it("flags `@shared/lib/queryKeys`", () => {
    const messages = lint(
      `import { hubKeys } from "@shared/lib/queryKeys";`,
      WEB_FILE,
    );
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("queryKeys"));
  });

  it("flags `@shared/lib/haptic` re-exported via `export from`", () => {
    const messages = lint(
      `export { hapticTap } from "@shared/lib/haptic";`,
      WEB_FILE,
    );
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("haptic"));
  });

  it('flags `export * from "@shared/lib/cn"`', () => {
    const messages = lint(`export * from "@shared/lib/cn";`, WEB_FILE);
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("cn"));
  });

  it("flags relative `../../shared/lib/apiUrl` from core/lib", () => {
    const fileFromCore = abs(
      "apps/web/src/core/lib/chatActions/serverActions.ts",
    );
    const messages = lint(
      `import { apiUrl } from "../../../shared/lib/apiUrl";`,
      fileFromCore,
    );
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("apiUrl"));
  });

  it("flags intra-shared/lib relative `./cn` from the barrel", () => {
    const messages = lint(`export { cn } from "./cn";`, WEB_SHARED_BARREL);
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("cn"));
  });

  it("flags `../typedStore` from inside an api/ file (cross-flat)", () => {
    // A file inside api/ trying to reach the would-be flat typedStore.
    const messages = lint(
      `import { createTypedStore } from "../typedStore";`,
      WEB_SHARED_API,
    );
    assert.equal(messages.length, 1);
    assert.ok(messages[0].message.includes("typedStore"));
  });
});

// ── GOOD: should NOT flag legitimate imports ────────────────────────────

describe("no-flat-shared-lib – allows the canonical paths", () => {
  it("allows the barrel `@shared/lib`", () => {
    const messages = lint(
      `import { cn, hubKeys } from "@shared/lib";`,
      WEB_FILE,
    );
    assert.equal(messages.length, 0);
  });

  it("allows a subdir-prefixed deep import `@shared/lib/ui/cn`", () => {
    const messages = lint(`import { cn } from "@shared/lib/ui/cn";`, WEB_FILE);
    assert.equal(messages.length, 0);
  });

  it("allows `@shared/lib/api/queryKeys`", () => {
    const messages = lint(
      `import { hubKeys } from "@shared/lib/api/queryKeys";`,
      WEB_FILE,
    );
    assert.equal(messages.length, 0);
  });

  it("allows `@shared/lib/storage/storage`", () => {
    const messages = lint(
      `import { ls } from "@shared/lib/storage/storage";`,
      WEB_FILE,
    );
    assert.equal(messages.length, 0);
  });

  it("allows intra-subdir relative `./apiUrl` inside api/", () => {
    const messages = lint(`import { apiUrl } from "./apiUrl";`, WEB_SHARED_API);
    assert.equal(messages.length, 0);
  });

  it("allows cross-subdir relative `../adapters/haptic` inside ui/", () => {
    const fileFromUi = abs("apps/web/src/shared/lib/ui/undoToast.tsx");
    const messages = lint(
      `import { hapticTap } from "../adapters/haptic";`,
      fileFromUi,
    );
    assert.equal(messages.length, 0);
  });

  it("allows the barrel re-exporting subdir `./api/queryKeys`", () => {
    const messages = lint(
      `export { hubKeys } from "./api/queryKeys";`,
      WEB_SHARED_BARREL,
    );
    assert.equal(messages.length, 0);
  });

  it("allows non-shared/lib imports like `@shared/components/ui/Button`", () => {
    const messages = lint(
      `import { Button } from "@shared/components/ui/Button";`,
      WEB_FILE,
    );
    assert.equal(messages.length, 0);
  });

  it("allows package imports like `react`", () => {
    const messages = lint(`import React from "react";`, WEB_FILE);
    assert.equal(messages.length, 0);
  });

  it("allows nested `@shared/hooks/<name>` imports from within shared/hooks", () => {
    const messages = lint(
      `import { something } from "@shared/hooks/other";`,
      WEB_HOOK,
    );
    assert.equal(messages.length, 0);
  });
});

// ── EXEMPT SCOPE: rule does not fire outside apps/web/src ───────────────

describe("no-flat-shared-lib – scoped to apps/web/src", () => {
  it("does not fire on apps/mobile/src files", () => {
    // Mobile has no `apps/web/src/shared/lib` of its own, but even a
    // contrived import targeting that path from mobile is out of scope —
    // the guard belongs in the web app boundary.
    const messages = lint(`import { cn } from "@shared/lib/cn";`, MOBILE_FILE);
    assert.equal(messages.length, 0);
  });

  it("does not fire on apps/server/src files", () => {
    const messages = lint(`import { cn } from "@shared/lib/cn";`, SERVER_FILE);
    assert.equal(messages.length, 0);
  });
});

// ── EDGE: allowed top-level subdir names are not flagged ────────────────

describe("no-flat-shared-lib – subdir names themselves are not flat", () => {
  it("allows `@shared/lib/api` (subdir barrel-style — note: typically use deep path)", () => {
    const messages = lint(`import * as api from "@shared/lib/api";`, WEB_FILE);
    assert.equal(messages.length, 0);
  });

  it("allows `@shared/lib/index`", () => {
    const messages = lint(`import { cn } from "@shared/lib/index";`, WEB_FILE);
    assert.equal(messages.length, 0);
  });
});
