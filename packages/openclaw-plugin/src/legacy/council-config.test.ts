/**
 * PR-E sanity gate: council orchestration config in
 * `ops/openclaw/openclaw.example.json` must stay aligned with the plugin-
 * side canonical sequence (`council.ts COUNCIL_DEFAULT_SEQUENCE`) and the
 * shipping `council-roundtable` SKILL.
 *
 * Coverage:
 *   - `council.skill` exists as `ops/openclaw/skills/<skill>/SKILL.md`
 *     with a `Status: Active (PR-E …)` marker + freshness header.
 *   - `council.defaultSequence` ≡ `COUNCIL_DEFAULT_SEQUENCE` (Locked
 *     decision #8: devops → eng → pm → growth → finance → cofounder).
 *   - `council.synthesisPersona` ≡ `COUNCIL_SYNTHESIS_PERSONA` (cofounder)
 *     and matches the last entry in `defaultSequence`.
 *   - Every persona in `defaultSequence` is registered in `agents.*` (so
 *     the runtime can resolve persona → skill → tool-allowlist).
 *   - `council.trigger` doesn't collide with `thinkPrefix`, persona
 *     aliases, or strategic-mode triggers.
 *   - `council.usdBudget` defaults to `${OPENCLAW_COUNCIL_USD_BUDGET:-2.0}`
 *     (Locked decision #4 — council cap $2.0).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  COUNCIL_DEFAULT_SEQUENCE,
  COUNCIL_SYNTHESIS_PERSONA,
} from "./council.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const OPENCLAW_JSON = resolve(REPO_ROOT, "ops/openclaw/openclaw.example.json");
const SKILLS_DIR = resolve(REPO_ROOT, "ops/openclaw/skills");

interface CouncilEntry {
  skill: string;
  defaultSequence: string[];
  synthesisPersona: string;
  model: string;
  usdBudget: string;
  trigger: string;
}

interface StrategicModeEntry {
  trigger: string;
}

interface OpenclawConfig {
  routing: {
    fullAgentTriggers: {
      thinkPrefix: string;
      councilPrefix: string;
    };
  };
  agents: Record<string, { aliases: string[] }>;
  council: CouncilEntry;
  strategicModes: Record<string, StrategicModeEntry | string>;
}

function loadConfig(): OpenclawConfig {
  const raw = readFileSync(OPENCLAW_JSON, "utf-8");
  return JSON.parse(raw) as OpenclawConfig;
}

describe("PR-E council-roundtable config", () => {
  const config = loadConfig();
  const council = config.council;

  it("declares skill + defaultSequence + synthesisPersona + model + usdBudget + trigger", () => {
    expect(council.skill).toBe("council-roundtable");
    expect(Array.isArray(council.defaultSequence)).toBe(true);
    expect(council.synthesisPersona).toBeTruthy();
    expect(council.model).toBeTruthy();
    expect(council.usdBudget).toBeTruthy();
    expect(council.trigger).toMatch(/^\/[a-z]+$/);
  });

  it("skill points to an existing SKILL.md with PR-E status header", () => {
    const skillFile = resolve(SKILLS_DIR, council.skill, "SKILL.md");
    expect(existsSync(skillFile)).toBe(true);
    const body = readFileSync(skillFile, "utf-8");
    expect(body).toMatch(/\*\*Status:\*\*\s+Active \(PR-E/);
    expect(body).toMatch(/\*\*Last validated:\*\*/);
  });

  it("defaultSequence matches plugin canonical COUNCIL_DEFAULT_SEQUENCE (Locked #8)", () => {
    expect(council.defaultSequence).toEqual([...COUNCIL_DEFAULT_SEQUENCE]);
  });

  it("synthesisPersona matches plugin canonical COUNCIL_SYNTHESIS_PERSONA (cofounder)", () => {
    expect(council.synthesisPersona).toBe(COUNCIL_SYNTHESIS_PERSONA);
    expect(council.defaultSequence[council.defaultSequence.length - 1]).toBe(
      council.synthesisPersona,
    );
  });

  it("every persona in defaultSequence is registered in agents.*", () => {
    const registered = new Set(Object.keys(config.agents));
    const missing = council.defaultSequence.filter((p) => !registered.has(p));
    expect(
      missing,
      `defaultSequence references unregistered personas: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("trigger does not collide with thinkPrefix or strategic-mode triggers", () => {
    const reservedTriggers = new Set<string>([
      config.routing.fullAgentTriggers.thinkPrefix,
    ]);
    for (const [key, entry] of Object.entries(config.strategicModes)) {
      if (key.startsWith("_")) continue;
      if (typeof entry === "object") {
        reservedTriggers.add((entry as StrategicModeEntry).trigger);
      }
    }
    expect(
      reservedTriggers.has(council.trigger),
      `council.trigger '${council.trigger}' collides with a reserved prefix`,
    ).toBe(false);
  });

  it("trigger does not collide with any persona alias", () => {
    const allAliases = Object.values(config.agents).flatMap((a) => a.aliases);
    expect(
      allAliases.includes(council.trigger),
      `council.trigger '${council.trigger}' collides with a persona alias`,
    ).toBe(false);
  });

  it("trigger matches routing.fullAgentTriggers.councilPrefix", () => {
    expect(council.trigger).toBe(
      config.routing.fullAgentTriggers.councilPrefix,
    );
  });

  it("usdBudget references OPENCLAW_COUNCIL_USD_BUDGET with $2.00 default (Locked #4)", () => {
    expect(council.usdBudget).toContain("OPENCLAW_COUNCIL_USD_BUDGET");
    expect(council.usdBudget).toMatch(/:-2(\.0+)?\}$/);
  });
});
