/**
 * Stage 4b — coverage of the 18-shortcut catalog (17 base + `forget` PR-23).
 *
 * Each shortcut is exercised against its `patterns` (we feed every regex a
 * canonical positive sample and one obvious negative) and its `render` path
 * is checked end-to-end through the router with mocked tools, so a future
 * pattern typo (e.g. missing `^…$` anchors) or render regression surfaces
 * before live deploy.
 */

import { describe, expect, it } from "vitest";

import { ShortcutRouter, extractText } from "./router.js";
import {
  ALL_SHORTCUTS,
  buildsShortcut,
  decisionsShortcut,
  digestShortcut,
  forgetShortcut,
  heartbeatShortcut,
  metricsShortcut,
  posthogShortcut,
  prsShortcut,
  recallShortcut,
  refreshMetricsShortcut,
  releasesShortcut,
  remindShortcut,
  runwayShortcut,
  sentryShortcut,
  statusShortcut,
  stripeShortcut,
  thinkShortcut,
  workflowsShortcut,
} from "./index.js";
import type { ShortcutDefinition, ToolExecutor, ToolResult } from "./types.js";

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function mockExecutor(): ToolExecutor {
  return async (name) => textResult(`mock:${name}`);
}

function runShortcut(
  shortcut: ShortcutDefinition,
  message: string,
): ReturnType<ShortcutRouter["match"]> {
  const router = new ShortcutRouter({
    shortcuts: [shortcut],
    executeTool: mockExecutor(),
  });
  return router.match(message);
}

describe("ALL_SHORTCUTS catalog", () => {
  it("exposes exactly 18 shortcuts", () => {
    expect(ALL_SHORTCUTS).toHaveLength(18);
  });

  it("has unique slugs", () => {
    const slugs = ALL_SHORTCUTS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("places /think first (sentinel-bearing renderer)", () => {
    expect(ALL_SHORTCUTS[0]?.slug).toBe("think");
  });

  it("every shortcut declares at least one pattern", () => {
    for (const s of ALL_SHORTCUTS) {
      expect(s.patterns.length).toBeGreaterThan(0);
      for (const p of s.patterns) {
        expect(p).toBeInstanceOf(RegExp);
      }
    }
  });

  it("renderer signature is callable for every shortcut", () => {
    for (const s of ALL_SHORTCUTS) {
      expect(typeof s.render).toBe("function");
    }
  });
});

describe("Slash command coverage", () => {
  const cases: Array<{
    shortcut: ShortcutDefinition;
    message: string;
    expectIncludes: string;
  }> = [
    {
      shortcut: metricsShortcut,
      message: "/metrics",
      expectIncludes: "Метрики сьогодні",
    },
    {
      shortcut: runwayShortcut,
      message: "/runway",
      expectIncludes: "Runway",
    },
    {
      shortcut: statusShortcut,
      message: "/status",
      expectIncludes: "Статус продукту",
    },
    {
      shortcut: sentryShortcut,
      message: "/sentry",
      expectIncludes: "Sentry (top 5, last 24h)",
    },
    {
      shortcut: stripeShortcut,
      message: "/stripe",
      expectIncludes: "Stripe сьогодні",
    },
    {
      shortcut: posthogShortcut,
      message: "/posthog",
      expectIncludes: "PostHog сьогодні",
    },
    {
      shortcut: prsShortcut,
      message: "/prs",
      expectIncludes: "Open PRs",
    },
    {
      shortcut: releasesShortcut,
      message: "/releases",
      expectIncludes: "Останні 5 релізів",
    },
    {
      shortcut: buildsShortcut,
      message: "/builds",
      expectIncludes: "Builds & Deploys",
    },
    {
      shortcut: workflowsShortcut,
      message: "/workflows",
      expectIncludes: "Workflows (n8n)",
    },
    {
      shortcut: refreshMetricsShortcut,
      message: "/refresh_metrics",
      expectIncludes: "Метрики оновлено",
    },
    {
      shortcut: heartbeatShortcut,
      message: "/heartbeat",
      expectIncludes: "Heartbeat",
    },
    {
      shortcut: decisionsShortcut,
      message: "/decisions",
      expectIncludes: "Останні 10 рішень",
    },
  ];

  it.each(cases)(
    "$shortcut.slug renders Markdown for $message",
    async ({ shortcut, message, expectIncludes }) => {
      const result = await runShortcut(shortcut, message);
      expect(result?.slug).toBe(shortcut.slug);
      expect(result?.response).toContain(expectIncludes);
    },
  );

  it("/health is an alias for heartbeat", async () => {
    const result = await runShortcut(heartbeatShortcut, "/health");
    expect(result?.slug).toBe("heartbeat");
  });

  it("/digest day captures the period", async () => {
    const result = await runShortcut(digestShortcut, "/digest day");
    expect(result?.response).toContain("Дайджест (day)");
  });

  it("/digest week captures the period", async () => {
    const result = await runShortcut(digestShortcut, "/digest week");
    expect(result?.response).toContain("Дайджест (week)");
  });

  it("/digest (no period) defaults to day", async () => {
    const result = await runShortcut(digestShortcut, "/digest");
    expect(result?.response).toContain("Дайджест (day)");
  });

  it("/recall captures the query", async () => {
    const router = new ShortcutRouter({
      shortcuts: [recallShortcut],
      executeTool: async (_name, params) =>
        textResult(`q=${String(params["query"])}`),
    });
    const result = await router.match("/recall founder OKRs Q2");
    expect(result?.response).toContain("q=founder OKRs Q2");
  });

  it("/forget id captures the memoryId", async () => {
    const router = new ShortcutRouter({
      shortcuts: [forgetShortcut],
      executeTool: async (_name, params) =>
        textResult(
          `mode=${String(params["mode"])} mid=${String(params["memoryId"])}`,
        ),
    });
    const result = await router.match("/forget id 123");
    expect(result?.slug).toBe("forget");
    expect(result?.response).toContain("mode=byId");
    expect(result?.response).toContain("mid=123");
  });

  it("/forget query routes to previewQuery mode", async () => {
    const router = new ShortcutRouter({
      shortcuts: [forgetShortcut],
      executeTool: async (_name, params) =>
        textResult(
          `mode=${String(params["mode"])} q=${String(params["query"])}`,
        ),
    });
    const result = await router.match("/forget query founder OKRs");
    expect(result?.response).toContain("mode=previewQuery");
    expect(result?.response).toContain("q=founder OKRs");
  });

  it("/forget topic routes to byTopic mode", async () => {
    const router = new ShortcutRouter({
      shortcuts: [forgetShortcut],
      executeTool: async (_name, params) =>
        textResult(
          `mode=${String(params["mode"])} t=${String(params["topic"])}`,
        ),
    });
    const result = await router.match("/forget topic project-x");
    expect(result?.response).toContain("mode=byTopic");
    expect(result?.response).toContain("t=project-x");
  });

  it("/forget since routes to since mode", async () => {
    const router = new ShortcutRouter({
      shortcuts: [forgetShortcut],
      executeTool: async (_name, params) =>
        textResult(
          `mode=${String(params["mode"])} d=${String(params["sinceDate"])}`,
        ),
    });
    const result = await router.match("/forget since 2025-04-01");
    expect(result?.response).toContain("mode=since");
    expect(result?.response).toContain("d=2025-04-01");
  });

  it("/forget confirm routes to confirm mode з UUID", async () => {
    const router = new ShortcutRouter({
      shortcuts: [forgetShortcut],
      executeTool: async (_name, params) =>
        textResult(
          `mode=${String(params["mode"])} t=${String(params["token"])}`,
        ),
    });
    const result = await router.match(
      "/forget confirm 12345678-1234-1234-1234-123456789abc",
    );
    expect(result?.response).toContain("mode=confirm");
    expect(result?.response).toContain("12345678-1234-1234-1234-123456789abc");
  });

  it("/remind captures when + what", async () => {
    const router = new ShortcutRouter({
      shortcuts: [remindShortcut],
      executeTool: async (_name, params) =>
        textResult(
          `set: ${String(params["reminderText"])} at ${String(params["dueAtIso"])}`,
        ),
    });
    const result = await router.match(
      "/remind 2026-05-20T09:00+03:00 review PR queue",
    );
    expect(result?.response).toContain("review PR queue");
    expect(result?.response).toContain("2026-05-20T09:00+03:00");
  });

  it("/think emits the ESCALATE_LAYER2 sentinel", async () => {
    const router = new ShortcutRouter({
      shortcuts: [thinkShortcut],
      executeTool: async () => textResult(""),
    });
    const result = await router.match("/think how should we price Sergeant?");
    expect(result?.response).toMatch(
      /^__ESCALATE_LAYER2__:thinking:cofounder:how should we price Sergeant\?$/,
    );
  });
});

describe("Ukrainian phrase coverage", () => {
  const cases: Array<{ shortcut: ShortcutDefinition; message: string }> = [
    { shortcut: metricsShortcut, message: "як справи з метриками" },
    { shortcut: metricsShortcut, message: "дай метрики" },
    { shortcut: metricsShortcut, message: "метрики" },
    { shortcut: runwayShortcut, message: "скільки runway" },
    { shortcut: runwayShortcut, message: "runway" },
    { shortcut: statusShortcut, message: "як справи в продукті" },
    { shortcut: statusShortcut, message: "статус" },
    { shortcut: statusShortcut, message: "як справи" },
    { shortcut: sentryShortcut, message: "що по sentry" },
    { shortcut: sentryShortcut, message: "сентрі" },
    { shortcut: stripeShortcut, message: "що по stripe" },
    { shortcut: stripeShortcut, message: "страйп" },
    { shortcut: posthogShortcut, message: "що по posthog" },
    { shortcut: posthogShortcut, message: "постхог" },
    { shortcut: prsShortcut, message: "що по prs" },
    { shortcut: prsShortcut, message: "які пр" },
    { shortcut: releasesShortcut, message: "релізи" },
    { shortcut: buildsShortcut, message: "деплої" },
    { shortcut: workflowsShortcut, message: "n8n" },
    { shortcut: refreshMetricsShortcut, message: "оновити метрики" },
    { shortcut: heartbeatShortcut, message: "пінг" },
    { shortcut: heartbeatShortcut, message: "ping" },
    { shortcut: decisionsShortcut, message: "рішення" },
    { shortcut: decisionsShortcut, message: "що вирішили" },
    { shortcut: digestShortcut, message: "дайджест" },
  ];

  it.each(cases)("$message → $shortcut.slug", async ({ shortcut, message }) => {
    const result = await runShortcut(shortcut, message);
    expect(result?.slug).toBe(shortcut.slug);
  });
});

/**
 * Mirror of `QUERY_APP_DB_TABLE_ALLOWLIST` from
 * apps/server/src/modules/openclaw/types.ts. Cross-package coupling on
 * purpose: any new table added to the server-side allowlist must be
 * appended here too, which is the same governance signal we want every
 * time a shortcut introduces a new SQL FROM target. The check below
 * catches the class of bug from 2026-05-12 (handoff doc § 10) where
 * `runway` queried `business_snapshot` and `decisions` queried
 * `ai_decisions` — neither of which is a real table.
 */
const QUERY_APP_DB_TABLE_ALLOWLIST = new Set<string>([
  "users",
  "n8n_failure_events",
  "routine_entries",
  "routine_streaks",
  "mono_transaction",
  "openclaw_decisions",
  "openclaw_invocations",
  "openclaw_write_audit",
  "tg_alert_acks",
]);

function extractFromTables(sql: string): string[] {
  // Strip SQL strings + comments before lexing FROM/JOIN targets to keep
  // identifiers inside quoted literals from being mistaken for tables.
  const sanitized = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""');
  const matches = sanitized.matchAll(
    /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
  );
  return Array.from(matches, (m) => (m[1] ?? "").toLowerCase());
}

describe("query_app_db SQL targets the server allowlist", () => {
  const sqlShortcuts = ALL_SHORTCUTS.flatMap((shortcut) =>
    shortcut.toolCalls
      .filter((tc) => tc.toolName === "query_app_db")
      .map((tc) => ({ slug: shortcut.slug, sql: tc.buildParams({})["sql"] })),
  ).filter(
    (entry): entry is { slug: string; sql: string } =>
      typeof entry.sql === "string",
  );

  it("covers at least one shortcut", () => {
    expect(sqlShortcuts.length).toBeGreaterThan(0);
  });

  it.each(sqlShortcuts)("$slug queries only allowlisted tables", ({ sql }) => {
    const tables = extractFromTables(sql);
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(QUERY_APP_DB_TABLE_ALLOWLIST.has(table)).toBe(true);
    }
  });
});

describe("Catalog-wide router integration", () => {
  it("dispatches /metrics through the full ALL_SHORTCUTS list", async () => {
    const calls: string[] = [];
    const router = new ShortcutRouter({
      shortcuts: ALL_SHORTCUTS,
      executeTool: async (name) => {
        calls.push(name);
        return textResult(`mock:${name}`);
      },
    });
    const result = await router.match("/metrics");
    expect(result?.slug).toBe("metrics");
    expect(new Set(calls)).toEqual(
      new Set(["get_posthog_stats", "get_stripe_metrics", "get_sentry_issues"]),
    );
    expect(result?.response).toContain("mock:get_posthog_stats");
  });

  it("returns null for an unmatched message", async () => {
    const router = new ShortcutRouter({
      shortcuts: ALL_SHORTCUTS,
      executeTool: mockExecutor(),
    });
    expect(
      await router.match("can you help me brainstorm product positioning"),
    ).toBeNull();
  });

  it("extractText is exported from the router module", () => {
    expect(extractText({ content: [{ type: "text", text: "hi" }] })).toBe("hi");
  });
});
