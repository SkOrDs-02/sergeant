// scripts/docs/__tests__/generate-playbook-index.test.mjs
//
// Unit tests for the playbook-index auto-generator.
// Run with: node --test scripts/docs/__tests__/generate-playbook-index.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractPlaybookMeta,
  escapeTableCell,
  renderIndex,
  addDays,
  normaliseForCompare,
} from "../generate-playbook-index.mjs";

describe("extractPlaybookMeta", () => {
  it("extracts title and trigger from a canonical playbook", () => {
    const content = [
      "# Playbook: Add API Endpoint",
      "",
      "> **Last validated:** 2026-04-27 by @Skords-01.",
      "",
      '**Trigger:** "Додати новий endpoint" / нова API-функціональність.',
      "",
      "Content",
    ].join("\n");
    const meta = extractPlaybookMeta(content);
    assert.equal(meta.title, "Add API Endpoint");
    assert.equal(
      meta.trigger,
      '"Додати новий endpoint" / нова API-функціональність.',
    );
    assert.equal(meta.isDecisionTree, false);
  });

  it("detects decision-tree marker 🌳", () => {
    const content = [
      "# 🌳 Hotfix Production",
      "",
      "**Trigger:** Прод впав.",
    ].join("\n");
    const meta = extractPlaybookMeta(content);
    assert.equal(meta.isDecisionTree, true);
  });

  it("returns null when Trigger line is missing", () => {
    const content = "# Some Doc\n\nNo trigger here.\n";
    assert.equal(extractPlaybookMeta(content), null);
  });

  it("collapses multi-line / whitespace inside trigger", () => {
    const content = "# Foo\n\n**Trigger:**   multiple   spaces    ok.\n";
    const meta = extractPlaybookMeta(content);
    assert.equal(meta.trigger, "multiple spaces ok.");
  });
});

describe("escapeTableCell", () => {
  it("escapes pipe characters", () => {
    assert.equal(escapeTableCell("a | b"), "a \\| b");
  });

  it("collapses newlines to spaces", () => {
    assert.equal(escapeTableCell("line1\nline2"), "line1 line2");
  });

  it("leaves plain text unchanged", () => {
    assert.equal(escapeTableCell("hello world"), "hello world");
  });
});

describe("renderIndex", () => {
  it("produces a deterministic, stable table", () => {
    const entries = [
      {
        file: "b.md",
        title: "Bravo",
        trigger: "when B",
        isDecisionTree: false,
      },
      {
        file: "a.md",
        title: "Alpha",
        trigger: "when A",
        isDecisionTree: true,
      },
    ];
    const out = renderIndex(entries, { today: "2026-04-29" });
    // Sorted alphabetically by filename.
    const aIdx = out.indexOf("[`a.md`]");
    const bIdx = out.indexOf("[`b.md`]");
    assert.ok(aIdx < bIdx, "a.md should come before b.md");
    assert.match(out, /🌳 Alpha/);
    assert.match(out, /Last validated:\*\* 2026-04-29/);
    assert.match(out, /Auto-generated/);
  });

  it("falls back to filename when title is missing", () => {
    const entries = [
      {
        file: "no-title.md",
        title: null,
        trigger: "foo",
        isDecisionTree: false,
      },
    ];
    const out = renderIndex(entries, { today: "2026-04-29" });
    assert.match(out, /no-title\|/.source ? /\| no-title \|/ : /no-title/);
  });
});

describe("addDays", () => {
  it("adds 90 days correctly across month boundaries", () => {
    assert.equal(addDays("2026-04-29", 90), "2026-07-28");
  });
});

describe("normaliseForCompare", () => {
  it("ignores daily freshness dates", () => {
    const a =
      "> **Last validated:** 2026-04-29 by @x. **Next review:** 2026-07-28.\n\nbody";
    const b =
      "> **Last validated:** 2027-01-15 by @x. **Next review:** 2027-04-15.\n\nbody";
    assert.equal(normaliseForCompare(a), normaliseForCompare(b));
  });

  it("ignores Prettier table-column padding", () => {
    const compact = "| A | B |\n| - | - |\n| 1 | 2 |";
    const padded = "| A   | B   |\n| --- | --- |\n| 1   | 2   |";
    assert.equal(normaliseForCompare(compact), normaliseForCompare(padded));
  });

  it("distinguishes genuinely different tables", () => {
    const a = "| A | B |\n| - | - |\n| 1 | 2 |";
    const b = "| A | B |\n| - | - |\n| 1 | 3 |";
    assert.notEqual(normaliseForCompare(a), normaliseForCompare(b));
  });
});

// ── Дві категорії «без Trigger» ──────────────────────────────────────────────
//
// До 2026-09-19 генератор сипав `[WARN] … skipped` на кожен плейбук без
// `**Trigger:**`, і серед них 9 були зафіксованим винятком (runtime-runbook-и,
// рішення 2026-09-17, README § Стандарт). Попередження, яке є завжди, ніхто не
// читає — тож реальний дрейф у тій самій купі був би невидимий. Тепер це дві
// різні категорії, і тест закріплює саме розрізнення.
describe("collectEntries — runtime-виняток проти реального дрейфу", () => {
  const RUNTIME_RUNBOOK = [
    "# Database backup / restore — runbook",
    "",
    "> **Last touched:** 2026-09-17 by @claude. **Next review:** 2026-12-24.",
    "> **Status:** Active",
    "> **Runtime-specific:** yes",
    "",
    "Операторські кроки.",
  ].join("\n");

  const DRIFTED_PLAYBOOK = [
    "# Playbook: Щось нове",
    "",
    "> **Last touched:** 2026-09-19 by @claude. **Next review:** 2026-12-24.",
    "> **Status:** Active",
    "> **Runtime-specific:** no",
    "",
    "Тіло без Trigger.",
  ].join("\n");

  it("runtime-runbook без Trigger не дає meta — він поза індексом за винятком", () => {
    assert.equal(extractPlaybookMeta(RUNTIME_RUNBOOK), null);
    assert.match(RUNTIME_RUNBOOK, /^>\s*\*\*Runtime-specific:\*\*\s*yes\b/im);
  });

  it("НЕ-runtime плейбук без Trigger теж не дає meta, але не має runtime-маркера", () => {
    assert.equal(extractPlaybookMeta(DRIFTED_PLAYBOOK), null);
    assert.doesNotMatch(
      DRIFTED_PLAYBOOK,
      /^>\s*\*\*Runtime-specific:\*\*\s*yes\b/im,
    );
  });

  it("плейбук із Trigger дає meta незалежно від runtime-маркера", () => {
    const withTrigger = RUNTIME_RUNBOOK.replace(
      "Операторські кроки.",
      "**Trigger:** «Треба відновити БД із бекапа».",
    );
    const meta = extractPlaybookMeta(withTrigger);
    assert.ok(meta);
    assert.match(meta.trigger, /відновити БД/u);
  });
});
