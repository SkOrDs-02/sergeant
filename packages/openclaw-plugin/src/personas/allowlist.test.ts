/**
 * Stage 5a — unit tests for `PERSONA_TOOL_ALLOWLIST` canonical mapping.
 *
 * These tests pin the invariants of the mapping itself; gate-test
 * (`config-gate.test.ts`) separately verifies the live JSON matches.
 */

import { describe, expect, it } from "vitest";

import { WRITE_TOOLS } from "../hooks/write-approval.js";

import {
  ALL_TOOL_NAMES,
  PERSONA_IDS,
  PERSONA_TOOL_ALLOWLIST,
  READ_TOOLS,
  type PersonaId,
} from "./allowlist.js";

const READ_ONLY_PERSONAS = new Set<PersonaId>(["finance", "data", "seo"]);

describe("PERSONA_TOOL_ALLOWLIST", () => {
  it("declares allowlist for every persona", () => {
    for (const personaId of PERSONA_IDS) {
      expect(PERSONA_TOOL_ALLOWLIST[personaId]).toBeDefined();
    }
  });

  it("references only registered tool names in alsoAllow", () => {
    const registered = new Set(ALL_TOOL_NAMES);
    for (const personaId of PERSONA_IDS) {
      const { alsoAllow } = PERSONA_TOOL_ALLOWLIST[personaId];
      for (const tool of alsoAllow) {
        expect(
          registered.has(tool),
          `persona ${personaId} alsoAllow references unknown tool ${tool}`,
        ).toBe(true);
      }
    }
  });

  it("denies only write-tools (deny on read-tools is a smell)", () => {
    for (const personaId of PERSONA_IDS) {
      const { deny } = PERSONA_TOOL_ALLOWLIST[personaId];
      for (const tool of deny) {
        expect(
          WRITE_TOOLS.has(tool),
          `persona ${personaId} denies non-write tool ${tool}`,
        ).toBe(true);
      }
    }
  });

  it("never both allows and denies the same tool", () => {
    for (const personaId of PERSONA_IDS) {
      const { alsoAllow, deny } = PERSONA_TOOL_ALLOWLIST[personaId];
      const allow = new Set(alsoAllow);
      for (const tool of deny) {
        expect(
          allow.has(tool),
          `persona ${personaId} both allows and denies ${tool}`,
        ).toBe(false);
      }
    }
  });

  it("gives cofounder the full tool-set (all 30)", () => {
    const cofounder = PERSONA_TOOL_ALLOWLIST.cofounder;
    expect(new Set(cofounder.alsoAllow)).toEqual(new Set(ALL_TOOL_NAMES));
    expect(cofounder.deny).toEqual([]);
  });

  it("read-only personas (finance, data, seo) carry NO write-tools in alsoAllow", () => {
    for (const personaId of READ_ONLY_PERSONAS) {
      const allow = new Set(PERSONA_TOOL_ALLOWLIST[personaId].alsoAllow);
      const writeOverlap = Array.from(WRITE_TOOLS).filter((t) => allow.has(t));
      expect(
        writeOverlap,
        `persona ${personaId} should be read-only but allows write-tools ${writeOverlap.join(", ")}`,
      ).toEqual([]);
    }
  });

  it("read-only personas deny ALL 5 write-tools (defence-in-depth)", () => {
    for (const personaId of READ_ONLY_PERSONAS) {
      const deny = new Set(PERSONA_TOOL_ALLOWLIST[personaId].deny);
      expect(deny).toEqual(WRITE_TOOLS);
    }
  });

  it("eng has no n8n_*, seo_*, or stripe tools (out of CTO territory)", () => {
    const allow = new Set(PERSONA_TOOL_ALLOWLIST.eng.alsoAllow);
    expect(allow.has("n8n_trigger")).toBe(false);
    expect(allow.has("n8n_activate")).toBe(false);
    expect(allow.has("seo_gsc_query")).toBe(false);
    expect(allow.has("seo_psi_audit")).toBe(false);
    expect(allow.has("seo_serp_lookup")).toBe(false);
    expect(allow.has("get_stripe_metrics")).toBe(false);
  });

  it("devops has n8n_trigger + n8n_activate (only persona besides cofounder)", () => {
    const writers = (["n8n_trigger", "n8n_activate"] as const).flatMap(
      (tool) => {
        const personas = PERSONA_IDS.filter((id) =>
          PERSONA_TOOL_ALLOWLIST[id].alsoAllow.includes(tool),
        );
        return [{ tool, personas }];
      },
    );

    for (const { tool, personas } of writers) {
      expect(
        new Set(personas),
        `${tool} should be allowed only for cofounder + devops`,
      ).toEqual(new Set(["cofounder", "devops"]));
    }
  });

  it("growth/cs/content have post_to_topic but NOT create_github_issue", () => {
    for (const personaId of ["growth", "cs", "content"] as const) {
      const allow = new Set(PERSONA_TOOL_ALLOWLIST[personaId].alsoAllow);
      expect(
        allow.has("post_to_topic"),
        `${personaId} should allow post_to_topic`,
      ).toBe(true);
      expect(
        allow.has("create_github_issue"),
        `${personaId} should NOT allow create_github_issue`,
      ).toBe(false);
    }
  });

  it("pm + content can commit_to_strategy_doc (only writers besides cofounder)", () => {
    const writers = PERSONA_IDS.filter((id) =>
      PERSONA_TOOL_ALLOWLIST[id].alsoAllow.includes("commit_to_strategy_doc"),
    );
    expect(new Set(writers)).toEqual(new Set(["cofounder", "pm", "content"]));
  });

  it("eng + pm + cofounder are the only personas that can create_github_issue", () => {
    const writers = PERSONA_IDS.filter((id) =>
      PERSONA_TOOL_ALLOWLIST[id].alsoAllow.includes("create_github_issue"),
    );
    expect(new Set(writers)).toEqual(new Set(["cofounder", "eng", "pm"]));
  });

  it("READ_TOOLS has 25 entries; ALL_TOOL_NAMES has 31 unique entries (25 read + 5 write + 1 host)", () => {
    expect(READ_TOOLS).toHaveLength(25);
    expect(new Set(READ_TOOLS).size).toBe(25);
    expect(ALL_TOOL_NAMES).toHaveLength(31);
    expect(new Set(ALL_TOOL_NAMES).size).toBe(31);
  });
});
