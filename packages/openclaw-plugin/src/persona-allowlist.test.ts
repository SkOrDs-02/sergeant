/**
 * PR-C2 sanity gate: persona tool allowlists in `ops/openclaw/openclaw.example.json`
 * must reference only tools that are actually registered by the plugin entry
 * (post-C1 24-tool registry). Catches typos, stale aspirational names, and
 * drift between the persona config and the plugin tool surface.
 *
 * Coverage:
 *   - Every `agents.<persona>.tools[]` entry must appear in the live registry.
 *   - Every persona must have `skill`, `displayName`, `aliases`, model tiers.
 *   - Every persona's `skill` must point to an existing `ops/openclaw/skills/<skill>/SKILL.md`.
 *   - Reverse coverage: every shipped persona skill directory must be wired in `agents.*`.
 *
 * Future write tools (PR-D) are NOT yet in registry; they're documented per-skill
 * as "Future write tools (PR-D)" sections, but excluded from the allowlist itself.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createOpenClawPlugin } from "./index.js";
import type {
  PluginApi,
  ToolDefinition,
  HookHandler,
  HookName,
} from "./sdk-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const OPENCLAW_JSON = resolve(REPO_ROOT, "ops/openclaw/openclaw.example.json");
const SKILLS_DIR = resolve(REPO_ROOT, "ops/openclaw/skills");

const VALID_API_KEY = "x".repeat(32);
const PLUGIN_CONFIG = JSON.stringify({
  serverInternalUrl: "http://localhost:3000",
  internalApiKey: VALID_API_KEY,
  founderUserId: "user_test",
  maxPerCallUsd: 0.5,
});

function makeStubApi(): PluginApi & {
  registeredTools: ToolDefinition<unknown>[];
} {
  const tools: ToolDefinition<unknown>[] = [];
  const hooks = new Map<HookName, HookHandler<HookName>[]>();
  return {
    registeredTools: tools,
    registerTool: <TParams>(tool: ToolDefinition<TParams>) => {
      tools.push(tool as unknown as ToolDefinition<unknown>);
    },
    registerHook: <H extends HookName>(name: H, handler: HookHandler<H>) => {
      const list = hooks.get(name) ?? [];
      list.push(handler as HookHandler<HookName>);
      hooks.set(name, list);
    },
    services: {
      messaging: {
        send: async () => ({ messageId: "stub" }),
        waitForCallback: async () => ({ callbackData: "approve:stub" }),
      },
      runtime: {
        now: () => 0,
        log: () => undefined,
      },
    },
  };
}

interface AgentEntry {
  skill: string;
  displayName: string;
  aliases: string[];
  model_default: string;
  model_for_thinking: string;
  tools: string[];
}

interface OpenclawConfig {
  agents: Record<string, AgentEntry>;
}

function loadConfig(): OpenclawConfig {
  const raw = readFileSync(OPENCLAW_JSON, "utf-8");
  return JSON.parse(raw) as OpenclawConfig;
}

function loadRegisteredToolNames(): Set<string> {
  const api = makeStubApi();
  createOpenClawPlugin(api, PLUGIN_CONFIG);
  return new Set(api.registeredTools.map((t) => t.name));
}

describe("PR-C2 persona allowlist", () => {
  const config = loadConfig();
  const registered = loadRegisteredToolNames();
  const personas = Object.keys(config.agents).sort();

  it("exposes exactly 10 personas (Phase 2 roster)", () => {
    expect(personas).toEqual([
      "cofounder",
      "content",
      "cs",
      "data",
      "devops",
      "eng",
      "finance",
      "growth",
      "pm",
      "seo",
    ]);
  });

  it.each(personas)(
    "persona %s declares skill + displayName + aliases + model tiers",
    (persona) => {
      const entry = config.agents[persona]!;
      expect(entry.skill).toMatch(/^sergeant-/);
      expect(entry.displayName).toBeTruthy();
      expect(entry.aliases.length).toBeGreaterThan(0);
      expect(entry.model_default).toBeTruthy();
      expect(entry.model_for_thinking).toBeTruthy();
      expect(Array.isArray(entry.tools)).toBe(true);
    },
  );

  it.each(personas)(
    "persona %s has a SKILL.md file with status marker",
    (persona) => {
      const entry = config.agents[persona]!;
      const skillFile = resolve(SKILLS_DIR, entry.skill, "SKILL.md");
      expect(existsSync(skillFile)).toBe(true);
      const body = readFileSync(skillFile, "utf-8");
      expect(body).toMatch(/\*\*Status:\*\*\s+Active \(PR-C2\)/);
      expect(body).toMatch(/\*\*Last validated:\*\*/);
    },
  );

  it.each(personas)(
    "persona %s allowlist contains only registered tools",
    (persona) => {
      const entry = config.agents[persona]!;
      const unknown = entry.tools.filter((t) => !registered.has(t));
      expect(
        unknown,
        `unknown tools for ${persona}: ${unknown.join(", ")}`,
      ).toEqual([]);
    },
  );

  it("cofounder has the broadest allowlist (full-set persona)", () => {
    const cofounderTools = new Set(config.agents["cofounder"]!.tools);
    for (const persona of personas) {
      if (persona === "cofounder") continue;
      const personaTools = config.agents[persona]!.tools;
      const exclusive = personaTools.filter((t) => !cofounderTools.has(t));
      expect(
        exclusive,
        `${persona} has tools not in cofounder set: ${exclusive.join(", ")}`,
      ).toEqual([]);
    }
  });

  it("every shipped persona skill directory is wired in agents.*", () => {
    const skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith("sergeant-"))
      .map((d) => d.name)
      .sort();
    const wired = Object.values(config.agents)
      .map((a) => a.skill)
      .sort();
    expect(skillDirs).toEqual(wired);
  });
});
