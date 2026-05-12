/**
 * Stage 6a — parity-харнес vitest suite під real `openclaw@2026.5.7` SDK.
 *
 * Цей файл реактивує parity-gate, яка раніше жила у
 * `src/legacy/parity/` (excluded з vitest run-у бо опиралась на
 * вгадані `sdk-types`). Тепер фікстури витягуються з реальних
 * каталогів (`ALL_SHORTCUTS`, `ALL_STRATEGIC_MODES`, `COUNCIL_*`) і
 * проганяються через `routeMessage()` — той самий 3-layer pipeline,
 * що його host hook-и викликають у runtime.
 *
 * Drift-gate-и (assert-fail = blocking PR check):
 *
 *   1. Кожна golden fixture (21 шт) claim-иться очікуваним layer-ом і
 *      slug-ом. Жодного silent fallthrough.
 *   2. Tool-call sequence shortcut-а exactly matches catalog
 *      `ShortcutDefinition.toolCalls.map(t => t.toolName)`.
 *   3. Фікстурний catalog покриває **всі 17 реальних shortcut-ів**
 *      (orphan / missing detection).
 *   4. Фікстурний catalog покриває **всі 3 реальних strategic mode-и**.
 *   5. Strategic-mode topic stripping робить точне розрізання slash-у
 *      + slug-у (case-insensitive, whitespace-tolerant).
 *   6. Council fixture's `expectedSequence` byte-for-byte matches
 *      `COUNCIL_DEFAULT_SEQUENCE` (Locked decision #8).
 *   7. **COUNCIL drift gate** — `COUNCIL_DEFAULT_SEQUENCE` matches
 *      `ops/openclaw/skills/council-roundtable/SKILL.md`'s «Default
 *      sequence» section. Recap §6 open follow-up — drift between
 *      code primer і prose SKILL — закриваємо тут.
 *   8. **Legacy routing parity matrix** — кожна fixture documents
 *      куди б її input пішов через legacy `parseCommand`. Список
 *      допустимих `legacyAgent`-ів — fixed set; гарантуємо що
 *      cutover playbook (Stage 7) має full coverage diff-у.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COUNCIL_DEFAULT_SEQUENCE,
  COUNCIL_SYNTHESIS_PERSONA,
  COUNCIL_TRIGGER,
} from "../council/index.js";
import { ALL_SHORTCUTS } from "../shortcuts/index.js";
import { ALL_STRATEGIC_MODES } from "../strategic-modes/index.js";

import {
  COUNCIL_GOLDEN_CONVERSATIONS,
  GOLDEN_CONVERSATIONS,
  SHORTCUT_GOLDEN_CONVERSATIONS,
  STRATEGIC_MODE_GOLDEN_CONVERSATIONS,
  getGoldenConversation,
  type LegacyAgent,
} from "./golden-conversations.js";
import { routeMessage } from "./runner.js";

const ALLOWED_LEGACY_AGENTS: ReadonlySet<LegacyAgent> = new Set([
  "dispatcher",
  "ops",
  "marketing",
  "help",
  "unknown",
]);

describe("Stage 6a parity harness — golden catalogue invariants", () => {
  it("contains exactly 21 fixtures (17 shortcuts + 3 modes + 1 council)", () => {
    expect(GOLDEN_CONVERSATIONS).toHaveLength(21);
    expect(SHORTCUT_GOLDEN_CONVERSATIONS).toHaveLength(17);
    expect(STRATEGIC_MODE_GOLDEN_CONVERSATIONS).toHaveLength(3);
    expect(COUNCIL_GOLDEN_CONVERSATIONS).toHaveLength(1);
  });

  it("has globally-unique fixture ids", () => {
    const ids = GOLDEN_CONVERSATIONS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every real shortcut slug in ALL_SHORTCUTS", () => {
    const realSlugs = new Set(ALL_SHORTCUTS.map((s) => s.slug));
    const fixtureSlugs = new Set(
      SHORTCUT_GOLDEN_CONVERSATIONS.map((f) => f.expectedSlug),
    );
    expect(realSlugs.size).toBe(17);
    expect(fixtureSlugs).toEqual(realSlugs);
  });

  it("covers every real strategic-mode slug", () => {
    const realSlugs = new Set(ALL_STRATEGIC_MODES.map((m) => m.slug));
    const fixtureSlugs = new Set(
      STRATEGIC_MODE_GOLDEN_CONVERSATIONS.map((f) => f.expectedSlug),
    );
    expect(realSlugs.size).toBe(3);
    expect(fixtureSlugs).toEqual(realSlugs);
  });

  it("documents every fixture's legacy console-bot routing decision", () => {
    for (const fixture of GOLDEN_CONVERSATIONS) {
      expect(ALLOWED_LEGACY_AGENTS.has(fixture.legacyAgent)).toBe(true);
    }
  });
});

describe("Stage 6a parity harness — Layer 0 shortcut fixtures", () => {
  for (const fixture of SHORTCUT_GOLDEN_CONVERSATIONS) {
    it(`${fixture.id} → claims shortcut layer with expected slug + tool order`, async () => {
      const result = await routeMessage(fixture.input);
      expect(result.layer).toBe("shortcut");
      if (result.layer !== "shortcut") return; // narrow for TS
      expect(result.slug).toBe(fixture.expectedSlug);
      expect(result.toolCalls).toEqual(fixture.expectedToolCalls);
      // Renderer must produce non-empty Markdown (sanity — empty
      // response would mean canned-template silently dropped).
      expect(result.response.length).toBeGreaterThan(0);
    });
  }
});

describe("Stage 6a parity harness — strategic-mode fixtures", () => {
  for (const fixture of STRATEGIC_MODE_GOLDEN_CONVERSATIONS) {
    it(`${fixture.id} → claims strategic-mode layer with expected slug + trigger + topic`, async () => {
      const result = await routeMessage(fixture.input);
      expect(result.layer).toBe("strategic-mode");
      if (result.layer !== "strategic-mode") return;
      expect(result.slug).toBe(fixture.expectedSlug);
      expect(result.trigger).toBe(fixture.expectedTrigger);
      expect(result.topic).toBe(fixture.expectedTopic);
      // Primer must be non-empty — drift sentinel for retired modes.
      expect(result.primer.length).toBeGreaterThan(0);
    });
  }
});

describe("Stage 6a parity harness — council fixture", () => {
  it("council.b2b-q3 → claims council layer with topic stripped", async () => {
    const fixture = getGoldenConversation("council.b2b-q3");
    const result = await routeMessage(fixture.input);
    expect(result.layer).toBe("council");
    if (result.layer !== "council") return;
    if (fixture.kind !== "council") return;
    expect(result.topic).toBe(fixture.expectedTopic);
    expect(result.primer.length).toBeGreaterThan(0);
  });

  it("council fixture expectedSequence matches COUNCIL_DEFAULT_SEQUENCE", () => {
    const fixture = getGoldenConversation("council.b2b-q3");
    if (fixture.kind !== "council") {
      throw new Error("fixture kind mismatch");
    }
    expect(fixture.expectedSequence).toEqual([...COUNCIL_DEFAULT_SEQUENCE]);
  });

  it("council trigger constant is the documented audit label", () => {
    expect(COUNCIL_TRIGGER).toBe("council");
  });

  it("synthesis persona is the last entry of the default sequence", () => {
    expect(COUNCIL_SYNTHESIS_PERSONA).toBe(
      COUNCIL_DEFAULT_SEQUENCE[COUNCIL_DEFAULT_SEQUENCE.length - 1],
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Drift gate: COUNCIL_DEFAULT_SEQUENCE ↔ SKILL.md
//
// Recap §6 open follow-up: «Drift gate COUNCIL_PRIMER (код у
// `src/council/index.ts`) ↔ `ops/openclaw/skills/council-roundtable/
// SKILL.md` — byte-for-byte gate не зашитий, як у /plan/analyze/okr».
// Тут закриваємо найважливіший шматок — sequence-of-personas. Якщо хтось
// у SKILL.md написав інший порядок (e.g. «pm → eng → devops → …») — тест
// валиться і ловить дрифт перед merge.
// ─────────────────────────────────────────────────────────────────────────

describe("Stage 6a parity harness — COUNCIL drift gate vs SKILL.md", () => {
  it("ops/openclaw/skills/council-roundtable/SKILL.md mirrors COUNCIL_DEFAULT_SEQUENCE", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    // packages/openclaw-plugin/src/parity → repo root → ops/...
    const skillPath = resolve(
      here,
      "../../../../ops/openclaw/skills/council-roundtable/SKILL.md",
    );
    const skill = readFileSync(skillPath, "utf8");
    // Skill зберігає sequence у блоці після `## Default sequence`. Витягуємо
    // перший рядок з `→` стрілками і парсимо persona-token-и.
    const headerIdx = skill.indexOf("## Default sequence");
    expect(headerIdx).toBeGreaterThan(-1);
    const after = skill.slice(headerIdx);
    const sequenceLineMatch = after.match(/(?:[a-z]+(?:\s*→\s*[a-z]+)+)/);
    expect(sequenceLineMatch).not.toBeNull();
    const tokens = sequenceLineMatch![0]
      .split("→")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    // SKILL.md ends the sequence with `cofounder (synthesis)` — but the
    // regex only captured tokens before the first non-arrow-followed
    // word. Normalise the captured cofounder token by stripping any
    // parenthetical suffix.
    const normalised = tokens.map((t) => t.replace(/\s*\(.*$/, "").trim());
    expect(normalised).toEqual([...COUNCIL_DEFAULT_SEQUENCE]);
  });
});

describe("Stage 6a parity harness — fallthrough behaviour", () => {
  it("returns fallthrough for free-form chat (no Layer 0 / mode / council match)", async () => {
    const result = await routeMessage(
      "Як думаєш, чи варто додавати B2B канал?",
    );
    expect(result.layer).toBe("fallthrough");
  });

  it("returns fallthrough for empty string", async () => {
    const result = await routeMessage("");
    expect(result.layer).toBe("fallthrough");
  });

  it("returns fallthrough for whitespace-only input", async () => {
    const result = await routeMessage("   \n\t   ");
    expect(result.layer).toBe("fallthrough");
  });

  it("no fixture input falls through (gate)", async () => {
    for (const fixture of GOLDEN_CONVERSATIONS) {
      const result = await routeMessage(fixture.input);
      expect(result.layer).not.toBe("fallthrough");
    }
  });
});
