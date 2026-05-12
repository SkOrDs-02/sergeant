/**
 * Stage 5a gate-test — verify `ops/openclaw/openclaw.example.json`
 * matches the canonical `PERSONA_TOOL_ALLOWLIST` mapping AND uses the
 * real openclaw 5.7 runtime config shape (`agents.list[]` array, not
 * `agents.<persona>` keys; `recall_memory` baseline at root `tools.alsoAllow`,
 * not `agents.defaults.tools.alsoAllow`).
 *
 * Catches drift between three artifacts that MUST stay in sync:
 *   1. `ops/openclaw/skills/sergeant-<id>/SKILL.md` § Доступні tools
 *   2. `PERSONA_TOOL_ALLOWLIST` (allowlist.ts)
 *   3. `ops/openclaw/openclaw.example.json` `agents.list[]` entry per persona
 *
 * If you edit one, edit the other two.
 *
 * AI-CONTEXT: the prior shape (`agents.<persona>.tools` + `agents.defaults.tools`)
 * was rejected by openclaw 5.7 runtime schema with
 * `"Unrecognized key: tools"` under `agents.defaults` and
 * `"Unrecognized keys: cofounder, eng, ..."` under `agents` — see
 * `docs/notes/spikes/openclaw-sdk-5.7-real-api.md` § Per-persona allowlist.
 * The real shape is `AgentsConfig = { defaults?: AgentDefaultsConfig, list?: AgentConfig[] }`,
 * where each `AgentConfig` has `id: string` (required) + optional `tools: AgentToolsConfig`.
 * Shared baseline tools go at root-level `tools.alsoAllow`, not `agents.defaults.tools`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALL_TOOL_NAMES,
  PERSONA_IDS,
  PERSONA_TOOL_ALLOWLIST,
  type PersonaId,
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

interface AgentListEntry {
  readonly id: string;
  readonly tools?: AgentToolsBlock;
  readonly [extra: string]: unknown;
}

interface AgentsBlock {
  readonly defaults?: Record<string, unknown>;
  readonly list?: readonly AgentListEntry[];
  readonly [extra: string]: unknown;
}

interface OpenClawConfig {
  readonly tools?: {
    readonly profile?: string;
    readonly allow?: readonly string[];
    readonly alsoAllow?: readonly string[];
    readonly deny?: readonly string[];
  };
  readonly agents?: AgentsBlock;
}

function readConfig(): OpenClawConfig {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw) as OpenClawConfig;
}

function findAgent(
  cfg: OpenClawConfig,
  personaId: PersonaId,
): AgentListEntry | undefined {
  return cfg.agents?.list?.find((entry) => entry.id === personaId);
}

describe("ops/openclaw/openclaw.example.json — per-persona tool allowlist gate", () => {
  it("loads the config JSON without errors", () => {
    expect(() => readConfig()).not.toThrow();
  });

  it("uses the runtime `agents.list[]` shape (not `agents.<persona>` keys)", () => {
    const cfg = readConfig();
    expect(
      Array.isArray(cfg.agents?.list),
      "agents.list must be an array — `agents.<persona>` keys are rejected by openclaw 5.7 runtime schema",
    ).toBe(true);
    const recognisedAgentsKeys = new Set(["defaults", "list"]);
    const unknown = Object.keys(cfg.agents ?? {}).filter(
      (k) => !recognisedAgentsKeys.has(k),
    );
    expect(
      unknown,
      `agents.* has unrecognised keys: ${unknown.join(", ")}. ` +
        "Per-persona configs must live under agents.list[], not as top-level agents.<id> keys.",
    ).toEqual([]);
  });

  it("does NOT carry `tools` under `agents.defaults` (rejected by runtime schema)", () => {
    const cfg = readConfig();
    expect(
      cfg.agents?.defaults?.["tools"],
      "agents.defaults.tools is not a valid key in openclaw 5.7 AgentDefaultsConfig. " +
        "Move shared baseline to root-level `tools.alsoAllow`.",
    ).toBeUndefined();
  });

  it("declares root-level `tools.alsoAllow` baseline with at least `recall_memory`", () => {
    const cfg = readConfig();
    expect(
      cfg.tools?.alsoAllow,
      "root tools.alsoAllow should contain the shared baseline " +
        "(previously lived at agents.defaults.tools.alsoAllow)",
    ).toBeDefined();
    expect(new Set(cfg.tools?.alsoAllow ?? [])).toContain("recall_memory");
  });

  it("declares an `agents.list[]` entry for every persona", () => {
    const cfg = readConfig();
    for (const personaId of PERSONA_IDS) {
      const agent = findAgent(cfg, personaId);
      expect(
        agent,
        `agents.list[].id="${personaId}" entry should exist`,
      ).toBeDefined();
      expect(
        agent?.tools,
        `agents.list[].id="${personaId}".tools should exist`,
      ).toBeDefined();
    }
  });

  it("agents.list[].tools.alsoAllow matches canonical mapping (sorted)", () => {
    const cfg = readConfig();
    for (const personaId of PERSONA_IDS) {
      const fromJson = [
        ...(findAgent(cfg, personaId)?.tools?.alsoAllow ?? []),
      ].sort();
      const fromCanonical = [
        ...PERSONA_TOOL_ALLOWLIST[personaId].alsoAllow,
      ].sort();
      expect(fromJson, `mismatch for persona ${personaId}`).toEqual(
        fromCanonical,
      );
    }
  });

  it("agents.list[].tools.deny matches canonical mapping (sorted)", () => {
    const cfg = readConfig();
    for (const personaId of PERSONA_IDS) {
      const fromJson = [
        ...(findAgent(cfg, personaId)?.tools?.deny ?? []),
      ].sort();
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
      const tools = findAgent(cfg, personaId)?.tools;
      for (const tool of tools?.alsoAllow ?? []) {
        expect(
          registered.has(tool),
          `agents.list[].id="${personaId}".tools.alsoAllow has unknown tool ${tool}`,
        ).toBe(true);
      }
      for (const tool of tools?.deny ?? []) {
        expect(
          registered.has(tool),
          `agents.list[].id="${personaId}".tools.deny has unknown tool ${tool}`,
        ).toBe(true);
      }
    }
  });

  it("cofounder JSON block carries all 30 tools", () => {
    const cfg = readConfig();
    const cofounder = findAgent(cfg, "cofounder")?.tools;
    expect(new Set(cofounder?.alsoAllow ?? [])).toEqual(
      new Set(ALL_TOOL_NAMES),
    );
  });

  it("agents.list[] ids are unique (no duplicate persona entries)", () => {
    const cfg = readConfig();
    const ids = (cfg.agents?.list ?? []).map((e) => e.id);
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    expect(
      dupes,
      `duplicate ids in agents.list[]: ${dupes.join(", ")}`,
    ).toEqual([]);
  });
});
