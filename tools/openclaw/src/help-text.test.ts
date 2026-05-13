/**
 * Snapshot tests for `tools/openclaw/src/index.ts` HELP_TEXT (M16).
 *
 * The console bot's `/start` and `/help` send `HELP_TEXT` with
 * `parse_mode: "MarkdownV2"`. MarkdownV2 fails loudly on any
 * unescaped special character, so an accidental edit (e.g. dropping
 * an escape) would crash the bot at the next `/help`. The snapshot
 * locks the rendered output so any regression shows up in the diff.
 */
import { describe, expect, it } from "vitest";
import { HELP_TEXT } from "./help-text.js";

describe("console HELP_TEXT (MarkdownV2, M16)", () => {
  it("renders to the locked MarkdownV2 string", () => {
    expect(HELP_TEXT).toMatchInlineSnapshot(`
      "*Sergeant Console* \\- Telegram control surface for ops, marketing, and AI agents

      */ops* <question\\> \\- ask the Ops agent
      */content* <topic\\> \\- ask the Marketing agent

      */status* <scope\\> \\- read\\-only agent/system status
      */plan* <task\\> \\- ask n8n to prepare a specialist\\-agent plan
      */assign* <specialist\\> <task\\> \\- request agent work; risky work needs approval
      */review* <target\\> \\- review PR, issue, CI, or workflow state
      */run* <check\\> \\- request a controlled check or automation
      */approve* <task\\-id\\|command\\> \\- approve a risky dispatcher action
      */cancel* <task\\-id\\> \\- cancel a queued dispatcher task
      */logs* <target\\> \\- fetch read\\-only logs or summaries

      Free text still routes to ops or marketing by context\\.

      _Version: Telegram control plane \\+ n8n dispatcher_"
    `);
  });

  it("escapes every MarkdownV2 special char outside formatting markers", () => {
    // Verifies the invariant that — except for the bold (`*`) and
    // italic (`_`) markers we author intentionally — every MarkdownV2
    // special char that appears in HELP_TEXT is preceded by `\`.
    const SPECIAL_OUTSIDE_MARKERS = /[`>#+\-=|{}.!()[\]~]/g;
    const offending: Array<{ char: string; offset: number }> = [];
    for (const m of HELP_TEXT.matchAll(SPECIAL_OUTSIDE_MARKERS)) {
      const offset = m.index ?? 0;
      const prev = HELP_TEXT[offset - 1];
      if (prev !== "\\") {
        offending.push({ char: m[0], offset });
      }
    }
    expect(offending).toEqual([]);
  });

  it("opens and closes every bold/italic marker in pairs", () => {
    // Counts unescaped `*` and `_`. A drop in the count = a renderer
    // regression that would cause Telegram to 400 on send.
    function countUnescaped(haystack: string, needle: string): number {
      let count = 0;
      for (let i = 0; i < haystack.length; i++) {
        if (haystack[i] !== needle) continue;
        if (haystack[i - 1] === "\\") continue;
        count += 1;
      }
      return count;
    }
    const stars = countUnescaped(HELP_TEXT, "*");
    const underscores = countUnescaped(HELP_TEXT, "_");
    // Bold pieces: 11 (Sergeant Console + 10 commands) → 22 stars.
    expect(stars % 2).toBe(0);
    expect(stars).toBe(22);
    // Italic pieces: 1 (Version line) → 2 underscores.
    expect(underscores % 2).toBe(0);
    expect(underscores).toBe(2);
  });
});
