/**
 * Stage 5a gate-test — verify `ops/openclaw/openclaw.example.json`
 * matches the canonical `PERSONA_TOOL_ALLOWLIST` mapping.
 *
 * Catches drift between three artifacts that MUST stay in sync:
 *   1. `ops/openclaw/skills/sergeant-<id>/SKILL.md` § Доступні tools
 *   2. `PERSONA_TOOL_ALLOWLIST` (allowlist.ts)
 *   3. `ops/openclaw/openclaw.example.json` `agents.<id>.tools` block
 *
 * If you edit one, edit the other two.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALL_TOOL_NAMES,
  PERSONA_IDS,
  PERSONA_TOOL_ALLOWLIST,
} from "./allowlist.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(
  __dirname,
  "../../../../ops/openclaw/openclaw.example.json",
);

interface AgentToolsBlock {
  readonly profile?: string;
  readonly allow?: readonly string[];
  readonly alsoAllow?: readonly string[];
  readonly deny?: readonly string[];
}

interface OpenClawConfig {
  readonly tools?: {
    readonly profile?: string;
    readonly allow?: readonly string[];
    readonly alsoAllow?: readonly string[];
    readonly deny?: readonly string[];
  };
  readonly agents?: Record<string, { readonly tools?: AgentToolsBlock }>;
}

function readConfig(): OpenClawConfig {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw) as OpenClawConfig;
}

describe("ops/openclaw/openclaw.example.json — per-persona tool allowlist gate", () => {
  it("loads the config JSON without errors", () => {
    expect(() => readConfig()).not.toThrow();
  });

  it("does NOT carry a flat root tools.alsoAllow (Stage 5a removes the catch-all)", () => {
    const cfg = readConfig();
    const rootAlsoAllow = cfg.tools?.alsoAllow;
    expect(
      rootAlsoAllow,
      "root tools.alsoAllow should be empty/absent — moved to agents.<id>.tools",
    ).toBeFalsy();
  });

  it("declares an `agents.<id>.tools` block for every persona", () => {
    const cfg = readConfig();
    for (const personaId of PERSONA_IDS) {
      const agent = cfg.agents?.[personaId];
      expect(
        agent?.tools,
        `agents.${personaId}.tools should exist`,
      ).toBeDefined();
    }
  });

  it("agents.<id>.tools.alsoAllow matches canonical mapping (sorted)", () => {
    const cfg = readConfig();
    for (const personaId of PERSONA_IDS) {
      const fromJson = [
        ...(cfg.agents?.[personaId]?.tools?.alsoAllow ?? []),
      ].sort();
      const fromCanonical = [
        ...PERSONA_TOOL_ALLOWLIST[personaId].alsoAllow,
      ].sort();
      expect(fromJson, `mismatch for persona ${personaId}`).toEqual(
        fromCanonical,
      );
    }
  });

  it("agents.<id>.tools.deny matches canonical mapping (sorted)", () => {
    const cfg = readConfig();
    for (const personaId of PERSONA_IDS) {
      const fromJson = [...(cfg.agents?.[personaId]?.tools?.deny ?? [])].sort();
      const fromCanonical = [...PERSONA_TOOL_ALLOWLIST[personaId].deny].sort();
      expect(fromJson, `mismatch for persona ${personaId} deny`).toEqual(
        fromCanonical,
      );
    }
  });

  it("every alsoAllow / deny entry is a registered tool name", () => {
    const cfg = readConfig();
    const registered = new Set(ALL_TOOL_NAMES);
    for (const personaId of PERSONA_IDS) {
      const tools = cfg.agents?.[personaId]?.tools;
      for (const tool of tools?.alsoAllow ?? []) {
        expect(
          registered.has(tool),
          `agents.${personaId}.tools.alsoAllow has unknown tool ${tool}`,
        ).toBe(true);
      }
      for (const tool of tools?.deny ?? []) {
        expect(
          registered.has(tool),
          `agents.${personaId}.tools.deny has unknown tool ${tool}`,
        ).toBe(true);
      }
    }
  });

  it("cofounder JSON block carries all 30 tools", () => {
    const cfg = readConfig();
    const cofounder = cfg.agents?.["cofounder"]?.tools;
    expect(new Set(cofounder?.alsoAllow ?? [])).toEqual(
      new Set(ALL_TOOL_NAMES),
    );
  });

  it("agents.defaults declares a shared `recall_memory` baseline", () => {
    const cfg = readConfig();
    const defaults = cfg.agents?.["defaults"]?.tools;
    expect(
      defaults?.alsoAllow,
      "agents.defaults.tools.alsoAllow should include recall_memory baseline",
    ).toBeDefined();
    expect(new Set(defaults?.alsoAllow ?? [])).toContain("recall_memory");
  });
});
