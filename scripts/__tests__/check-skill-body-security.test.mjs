// scripts/__tests__/check-skill-body-security.test.mjs
//
// Unit tests for the SKILL.md body security scanner.
// Validates that each of the 7 threat categories is caught, and that
// a clean skill body produces 0 hits.
//
// Linked roadmap: docs/agents/skills-evolution-roadmap.md (PR 5).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scanBody,
  extractBody,
  THREAT_CATEGORIES,
} from "../check-skill-body-security.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures", "malicious-skills");

function readFixture(name) {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

describe("THREAT_CATEGORIES coverage", () => {
  test("scanner defines >= 7 threat categories", () => {
    assert.ok(
      THREAT_CATEGORIES.length >= 7,
      `Expected >= 7 categories, got ${THREAT_CATEGORIES.length}`,
    );
  });
});

describe("malicious fixture detection", () => {
  const cases = [
    { file: "command-injection.md", category: "command-injection", minHits: 3 },
    { file: "data-exfiltration.md", category: "data-exfiltration", minHits: 1 },
    {
      file: "credential-harvesting.md",
      category: "credential-harvesting",
      minHits: 2,
    },
    { file: "prompt-injection.md", category: "prompt-injection", minHits: 2 },
    { file: "persistence.md", category: "persistence", minHits: 3 },
    { file: "reverse-shell.md", category: "reverse-shell", minHits: 2 },
    { file: "destructive.md", category: "destructive", minHits: 3 },
  ];

  for (const { file, category, minHits } of cases) {
    test(`catches ${category} in ${file} (>= ${minHits} hits)`, () => {
      const text = readFixture(file);
      const body = extractBody(text);
      const hits = scanBody(body);
      const catHits = hits.filter((h) => h.category === category);
      assert.ok(
        catHits.length >= minHits,
        `Expected >= ${minHits} ${category} hits, got ${catHits.length}: ${JSON.stringify(catHits)}`,
      );
    });
  }
});

describe("clean body produces 0 hits", () => {
  test("normal skill body has no security hits", () => {
    const cleanBody = `
## Overview

This skill covers standard web UI development patterns.

### Commands

\`\`\`bash
pnpm lint
pnpm typecheck
pnpm test
\`\`\`

### Key files

- apps/web/src/shared/components/
- packages/design-tokens/tailwind-preset.js

### Playbooks

See [docs/playbooks/README.md](docs/playbooks/README.md).
`;
    const hits = scanBody(cleanBody);
    assert.equal(
      hits.length,
      0,
      `Expected 0 hits, got: ${JSON.stringify(hits)}`,
    );
  });
});
