/**
 * PR-C3 sanity gate: strategic modes in `ops/openclaw/openclaw.example.json`.
 *
 * Strategic modes (`/plan`, `/analyze`, `/okr`) — opt-in per Locked decision #6,
 * orthogonal to personas. Each mode references a `sergeant-mode-*` skill
 * directory under `ops/openclaw/skills/`.
 *
 * Coverage:
 *   - Exactly 3 strategic modes (plan / analyze / okr) per roadmap §Phase 3.
 *   - Each mode has `skill`, `trigger`, `defaultPersona`, `auditTrigger`.
 *   - Each mode's `skill` points to an existing `ops/openclaw/skills/<skill>/SKILL.md`.
 *   - Each `defaultPersona` is registered in `agents.*` (so the orthogonal
 *     composition makes sense — persona-allowlist gates tool access).
 *   - Each `trigger` is unique and distinct from persona aliases / council /
 *     thinkPrefix.
 *   - Each SKILL.md carries `Status: Active (PR-C3, opt-in …)` + freshness header.
 *   - Reverse coverage: every `sergeant-mode-*` directory is wired in
 *     `strategicModes.*`.
 *   - `auditTrigger` values match the `STRATEGIC_MODE_TRIGGERS` map in
 *     `tools/console/src/agents/strategic-modes.ts` (single source for the
 *     audit-log `openclaw_invocations.trigger` column).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const OPENCLAW_JSON = resolve(REPO_ROOT, "ops/openclaw/openclaw.example.json");
const SKILLS_DIR = resolve(REPO_ROOT, "ops/openclaw/skills");

interface StrategicModeEntry {
  skill: string;
  trigger: string;
  defaultPersona: string;
  auditTrigger: string;
}

interface OpenclawConfig {
  routing: {
    fullAgentTriggers: {
      thinkPrefix: string;
      councilPrefix: string;
    };
  };
  agents: Record<string, { aliases: string[] }>;
  council: { trigger: string };
  strategicModes: Record<string, StrategicModeEntry | string>;
}

function loadConfig(): OpenclawConfig {
  const raw = readFileSync(OPENCLAW_JSON, "utf-8");
  return JSON.parse(raw) as OpenclawConfig;
}

const EXPECTED_AUDIT_TRIGGERS: Record<string, string> = {
  plan: "strategic_plan",
  analyze: "strategic_analyze",
  okr: "strategic_okr",
};

describe("PR-C3 strategic modes", () => {
  const config = loadConfig();
  const modeKeys = Object.keys(config.strategicModes)
    .filter((k) => !k.startsWith("_"))
    .sort();

  it("exposes exactly 3 strategic modes (plan / analyze / okr)", () => {
    expect(modeKeys).toEqual(["analyze", "okr", "plan"]);
  });

  it.each(modeKeys)(
    "mode %s declares skill + trigger + defaultPersona + auditTrigger",
    (modeName) => {
      const entry = config.strategicModes[modeName] as StrategicModeEntry;
      expect(entry.skill).toMatch(/^sergeant-mode-/);
      expect(entry.trigger).toMatch(/^\/[a-z]+$/);
      expect(entry.defaultPersona).toBeTruthy();
      expect(entry.auditTrigger).toBe(EXPECTED_AUDIT_TRIGGERS[modeName]);
    },
  );

  it.each(modeKeys)(
    "mode %s skill points to an existing SKILL.md with PR-C3 status",
    (modeName) => {
      const entry = config.strategicModes[modeName] as StrategicModeEntry;
      const skillFile = resolve(SKILLS_DIR, entry.skill, "SKILL.md");
      expect(existsSync(skillFile)).toBe(true);
      const body = readFileSync(skillFile, "utf-8");
      expect(body).toMatch(/\*\*Status:\*\*\s+Active \(PR-C3/);
      expect(body).toMatch(/\*\*Last validated:\*\*/);
    },
  );

  it.each(modeKeys)(
    "mode %s defaultPersona is registered in agents",
    (modeName) => {
      const entry = config.strategicModes[modeName] as StrategicModeEntry;
      expect(Object.keys(config.agents)).toContain(entry.defaultPersona);
    },
  );

  it("mode triggers are unique and distinct from council / thinkPrefix", () => {
    const modeTriggers = modeKeys.map(
      (k) => (config.strategicModes[k] as StrategicModeEntry).trigger,
    );
    const uniqueModeTriggers = new Set(modeTriggers);
    expect(uniqueModeTriggers.size).toBe(modeTriggers.length);

    const reservedTriggers = new Set([
      config.routing.fullAgentTriggers.thinkPrefix,
      config.routing.fullAgentTriggers.councilPrefix,
      config.council.trigger,
    ]);
    for (const trigger of modeTriggers) {
      expect(
        reservedTriggers.has(trigger),
        `mode trigger '${trigger}' collides with reserved prefix`,
      ).toBe(false);
    }
  });

  it("mode triggers do not collide with any persona alias", () => {
    const modeTriggers = new Set(
      modeKeys.map(
        (k) => (config.strategicModes[k] as StrategicModeEntry).trigger,
      ),
    );
    const allAliases = Object.values(config.agents).flatMap((a) => a.aliases);
    for (const alias of allAliases) {
      expect(
        modeTriggers.has(alias),
        `persona alias '${alias}' collides with a strategic-mode trigger`,
      ).toBe(false);
    }
  });

  it("every shipped sergeant-mode-* skill directory is wired in strategicModes.*", () => {
    const modeSkillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith("sergeant-mode-"))
      .map((d) => d.name)
      .sort();
    const wired = modeKeys
      .map((k) => (config.strategicModes[k] as StrategicModeEntry).skill)
      .sort();
    expect(modeSkillDirs).toEqual(wired);
  });
});
