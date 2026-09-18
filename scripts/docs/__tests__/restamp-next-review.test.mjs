// scripts/docs/__tests__/restamp-next-review.test.mjs
//
// Unit tests for the policy re-stamp. Головна властивість, яку вони
// стережуть: скрипт НІКОЛИ не чіпає `Last touched` і автора. Він міняє
// політику, а не факт про минуле — і саме на цій межі тримається чесність
// заголовка свіжості.
//
// Run with: node --test scripts/docs/__tests__/restamp-next-review.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { restampHeader } from "../restamp-next-review.mjs";
import { nextReviewFor } from "../freshness-config.mjs";

const CONFIG = {
  defaultCadenceDays: 90,
  cadenceOverrides: { "docs/rec/**": 365 },
};

const doc = (touched, author, due) =>
  `# T\n\n> **Last touched:** ${touched} by ${author}. **Next review:** ${due}.\n> **Status:** Active\n\nbody\n`;

describe("restampHeader", () => {
  it("переписує лише дату перегляду", () => {
    const before = doc("2026-05-13", "@Skords-01", "2026-08-11");
    const { content, changed } = restampHeader(before, "docs/x.md", CONFIG);
    assert.equal(changed, true);
    assert.match(content, /\*\*Last touched:\*\* 2026-05-13 by @Skords-01\./);
    assert.match(
      content,
      new RegExp(
        `\\*\\*Next review:\\*\\* ${nextReviewFor("docs/x.md", "2026-05-13", CONFIG)}\\.`,
      ),
    );
  });

  // Найважливіше твердження всього скрипта.
  it("НЕ підміняє дату останнього дотику й автора", () => {
    const before = doc("2026-05-13", "Devin", "2026-08-11");
    const { content } = restampHeader(before, "docs/x.md", CONFIG);
    assert.match(content, /\*\*Last touched:\*\* 2026-05-13 by Devin\./);
    assert.equal(content.includes("2026-05-13"), true);
  });

  it("бере каденцію тира зі шляху", () => {
    const before = doc("2026-01-01", "@x", "2026-04-01");
    const { content } = restampHeader(before, "docs/rec/audit.md", CONFIG);
    assert.match(
      content,
      new RegExp(
        `\\*\\*Next review:\\*\\* ${nextReviewFor("docs/rec/audit.md", "2026-01-01", CONFIG)}\\.`,
      ),
    );
  });

  it("ідемпотентний — другий прогін нічого не змінює", () => {
    const before = doc("2026-05-13", "@x", "2026-08-11");
    const once = restampHeader(before, "docs/x.md", CONFIG);
    const twice = restampHeader(once.content, "docs/x.md", CONFIG);
    assert.equal(twice.changed, false);
    assert.equal(twice.content, once.content);
  });

  it("не чіпає файл без заголовка свіжості", () => {
    const before = "# T\n\nbody\n";
    const { content, changed } = restampHeader(before, "docs/x.md", CONFIG);
    assert.equal(changed, false);
    assert.equal(content, before);
  });

  it("не чіпає заголовок нижче межі перших рядків", () => {
    const before =
      "# T\n" +
      "filler\n".repeat(20) +
      "> **Last touched:** 2026-01-01 by @x. **Next review:** 2026-04-01.\n";
    const { changed } = restampHeader(before, "docs/x.md", CONFIG);
    assert.equal(changed, false);
  });

  it("зберігає решту рядка недоторканою", () => {
    const before =
      "# T\n\n> **Category:** `blocker-invariant`\n> **Last touched:** 2026-05-14 by Codex. **Next review:** 2026-08-12.\n> **Status:** Active\n";
    const { content } = restampHeader(before, "docs/x.md", CONFIG);
    assert.match(content, /\*\*Category:\*\* `blocker-invariant`/);
    assert.match(content, /\*\*Status:\*\* Active/);
    assert.match(content, /\*\*Last touched:\*\* 2026-05-14 by Codex\./);
  });
});
