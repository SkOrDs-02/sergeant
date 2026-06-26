#!/usr/bin/env node
/**
 * Imports a portable PostHog dashboard manifest (ops/posthog/dashboards/*.json)
 * into a PostHog project via the REST API — creating one saved insight per
 * `panels[]` entry and pinning them to an umbrella dashboard.
 *
 * Closes the "auto-import" TODO in `ops/posthog/README.md` (PR-11).
 *
 * Idempotent: re-running reuses the dashboard and any insight whose `name`
 * already exists (matched within the project) instead of duplicating.
 *
 * Usage:
 *   POSTHOG_API_KEY=phx_… node scripts/posthog/import-founder-pulse.mjs \
 *     [--project 167740] [--host https://eu.posthog.com] \
 *     [--manifest ops/posthog/dashboards/founder-pulse.json] [--dry-run]
 *
 * The API key is a PostHog **personal API key** (scope: project read+write).
 * Never hard-code it — pass via env.
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const DRY = args.includes("--dry-run");
const TOKEN = process.env.POSTHOG_API_KEY;
const PROJECT = opt("--project", "167740");
const HOST = opt("--host", "https://eu.posthog.com").replace(/\/$/, "");
const MANIFEST = opt("--manifest", "ops/posthog/dashboards/founder-pulse.json");

if (!TOKEN) {
  console.error("POSTHOG_API_KEY env var is required (personal API key).");
  process.exit(1);
}

const base = `${HOST}/api/projects/${PROJECT}`;
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

async function api(path, init = {}) {
  const res = await fetch(base + path, { ...init, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `${init.method || "GET"} ${path} → ${res.status}: ${JSON.stringify(body).slice(0, 400)}`,
    );
  }
  return body;
}

/** Map manifest breakdown → PostHog breakdownFilter. */
function mapBreakdown(bd) {
  if (!bd) return undefined;
  const breakdown_type = bd.type === "person_property" ? "person" : "event";
  return { breakdown_type, breakdown: bd.key };
}

/** Build the PostHog `query` object for one manifest panel. */
function buildQuery(panel) {
  // Any panel that ships a HogQLQuery string → SQL insight.
  if (panel.query?.kind === "HogQLQuery") {
    return {
      kind: "DataVisualizationNode",
      source: { kind: "HogQLQuery", query: panel.query.query },
    };
  }
  if (panel.type === "funnel") {
    const windowDays = Math.max(
      1,
      Math.round((panel.conversion_window?.hours ?? 168) / 24),
    );
    // Per-module funnel: break the whole funnel down by the event `module`
    // property (closest native equivalent to the manifest's step-3 split).
    const stepBreakdown = panel.steps.find((s) => s.breakdown);
    const bd = stepBreakdown
      ? { breakdown_type: "event", breakdown: "module" }
      : mapBreakdown(panel.breakdown);
    return {
      kind: "InsightVizNode",
      source: {
        kind: "FunnelsQuery",
        series: panel.steps.map((s) => ({
          kind: "EventsNode",
          event: s.event,
          name: s.event,
        })),
        dateRange: { date_from: "-28d" },
        funnelsFilter: {
          funnelWindowInterval: windowDays,
          funnelWindowIntervalUnit: "day",
        },
        ...(bd ? { breakdownFilter: bd } : {}),
      },
    };
  }
  if (panel.type === "retention") {
    return {
      kind: "InsightVizNode",
      source: {
        kind: "RetentionQuery",
        retentionFilter: {
          targetEntity: {
            id: panel.cohortizing_event,
            type: "events",
            name: panel.cohortizing_event,
          },
          // returning "$any_event" → null id = "All events"
          returningEntity: { id: null, type: "events", name: "All events" },
          period: "Day",
          totalIntervals: panel.total_intervals ?? 31,
          retentionType: "retention_first_time",
        },
        dateRange: { date_from: `-${panel.total_intervals ?? 31}d` },
        ...(mapBreakdown(panel.breakdown)
          ? { breakdownFilter: mapBreakdown(panel.breakdown) }
          : {}),
      },
    };
  }
  throw new Error(`Unsupported panel type for "${panel.key}": ${panel.type}`);
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const dashName = manifest.umbrella_dashboard?.name || manifest.name;
  console.log(
    `Manifest "${manifest.key}" → project ${PROJECT} @ ${HOST}${DRY ? " (DRY RUN)" : ""}`,
  );

  // 1. Dashboard — reuse by name or create.
  const dashList = await api(`/dashboards/?limit=200`);
  let dash = (dashList.results || []).find((d) => d.name === dashName);
  if (dash) {
    console.log(`  dashboard "${dashName}" exists → #${dash.id} (reuse)`);
  } else if (DRY) {
    console.log(`  would CREATE dashboard "${dashName}"`);
    dash = { id: "<new>" };
  } else {
    dash = await api(`/dashboards/`, {
      method: "POST",
      body: JSON.stringify({
        name: dashName,
        description: manifest.description?.slice(0, 400) || "",
      }),
    });
    console.log(`  created dashboard "${dashName}" → #${dash.id}`);
  }

  // 2. Insights — one per panel, reuse by name.
  const insList = await api(`/insights/?limit=300`);
  const byName = new Map(
    (insList.results || []).map((i) => [i.name || i.derived_name, i]),
  );

  for (const panel of manifest.panels) {
    const existing = byName.get(panel.name);
    if (existing) {
      console.log(
        `  insight "${panel.name}" exists → [${existing.short_id}] (skip)`,
      );
      continue;
    }
    if (DRY) {
      console.log(`  would CREATE insight "${panel.name}" (${panel.type})`);
      continue;
    }
    try {
      const query = buildQuery(panel);
      const created = await api(`/insights/`, {
        method: "POST",
        body: JSON.stringify({
          name: panel.name,
          description: `${panel.description}\n\n${panel.rationale}`.slice(
            0,
            400,
          ),
          query,
          dashboards: [dash.id],
          tags: ["founder-pulse", "managed-by-manifest"],
        }),
      });
      console.log(`  created insight "${panel.name}" → [${created.short_id}]`);
    } catch (err) {
      console.error(`  ✗ FAILED "${panel.name}": ${err.message}`);
    }
  }

  console.log(
    `\nDone. Dashboard: ${HOST}/project/${PROJECT}/dashboard/${dash.id}`,
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
