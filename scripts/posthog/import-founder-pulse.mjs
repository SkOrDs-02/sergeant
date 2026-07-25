#!/usr/bin/env node
/**
 * Imports a portable PostHog dashboard manifest (ops/posthog/dashboards/*.json)
 * into a PostHog project via the REST API — creating one saved insight per
 * `panels[]` entry and pinning them to an umbrella dashboard.
 *
 * Closes the "auto-import" TODO in `ops/posthog/README.md` (PR-11).
 *
 * Idempotent: re-running reuses the dashboard and any insight already owned by
 * this manifest (matched by tag, then by name) instead of duplicating.
 *
 * The tag-namespace is derived from `manifest.key`, so a second manifest can be
 * imported into the same project without stomping the first one — see
 * `tagPrefix` / `panelTags` / `buildInsightIndex` below.
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
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

/**
 * Legacy per-panel tag prefixes that predate the derived namespace. Kept so a
 * re-import of an already-live manifest PATCHes its existing insights instead
 * of creating duplicates. `founder-pulse` shipped 2026-06-26 with `fp:` tags on
 * seven live insights (short_id list in the runbook §1) — never drop this entry.
 */
export const LEGACY_TAG_PREFIXES = Object.freeze({
  "founder-pulse": ["fp"],
});

/**
 * Manifests whose insights predate `managed-by-manifest` tagging and therefore
 * still need the (project-wide) name fallback. New manifests deliberately do
 * NOT get it: a project-wide name match is what lets one manifest silently
 * PATCH another manifest's insight.
 */
export const LEGACY_GLOBAL_NAME_FALLBACK = Object.freeze(["founder-pulse"]);

/**
 * Derive the per-panel tag prefix from a manifest key: initials of the
 * kebab-segments. `founder-pulse` → `fp` (matches the live tags), `value-loops`
 * → `vl`, `hub-tab-perf` → `htp`. Prefix collisions between manifests are
 * caught by `pnpm lint:posthog-manifests`.
 */
export function tagPrefix(manifestKey) {
  const initials = String(manifestKey)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((word) => word[0].toLowerCase())
    .join("");
  return initials || String(manifestKey);
}

/** All tag prefixes an insight of this manifest may legitimately carry. */
export function tagPrefixes(manifestKey) {
  const derived = tagPrefix(manifestKey);
  const legacy = LEGACY_TAG_PREFIXES[manifestKey] ?? [];
  return [derived, ...legacy.filter((p) => p !== derived)];
}

/** Tags written onto an insight owned by `manifestKey` / `panelKey`. */
export function panelTags(manifestKey, panelKey) {
  return [
    manifestKey,
    "managed-by-manifest",
    `${tagPrefix(manifestKey)}:${panelKey}`,
  ];
}

/** True when `insight` is owned by this manifest (by manifest tag or prefix). */
export function isOwnedBy(insight, manifestKey) {
  const tags = insight?.tags ?? [];
  if (tags.includes(manifestKey)) return true;
  const prefixes = tagPrefixes(manifestKey);
  return tags.some((t) =>
    prefixes.some((p) => typeof t === "string" && t.startsWith(`${p}:`)),
  );
}

/** Tags written onto the umbrella dashboard owned by `manifestKey`. */
export function dashboardTags(manifestKey) {
  return [manifestKey, "managed-by-manifest"];
}

/**
 * Pick the dashboard to PATCH, scoped to this manifest.
 *
 * Same hazard as insights, and it was left unscoped: a project-wide
 * `name === dashName` match lets a second manifest that happens to reuse an
 * `umbrella_dashboard.name` PATCH the FIRST manifest's dashboard and overwrite
 * its description. So ownership wins, and the bare name match survives only for
 * `LEGACY_GLOBAL_NAME_FALLBACK` manifests, whose dashboards were created before
 * this script wrote any tags.
 */
export function findExistingDashboard(dashboards, manifestKey, dashName) {
  const list = dashboards ?? [];
  const owned = list.find(
    (d) => ownsDashboard(d, manifestKey) && d?.name === dashName,
  );
  if (owned) return owned;
  if (!LEGACY_GLOBAL_NAME_FALLBACK.includes(manifestKey)) return undefined;
  // Legacy-фолбек — ЛИШЕ для повністю невідтеґованих дашбордів. Будь-який тег
  // виду `<prefix>:` означає, що дашборд комусь належить, і чіпати його по
  // самому лише збігу імені не можна.
  return list.find((d) => d?.name === dashName && isUntagged(d));
}

/**
 * Точна власність дашборда: обидва теги, які пише `dashboardTags`.
 *
 * НЕ `isOwnedBy`: той приймає будь-який тег `<prefix>:…`, і для інсайтів це
 * правильно (вони саме так теґуються по панелях), але для дашборда завузько —
 * чужий дашборд із тим самим іменем і панель-подібним тегом `htp:custom`
 * порахувався б «нашим», і PATCH затер би його опис.
 */
function ownsDashboard(dashboard, manifestKey) {
  const tags = dashboard?.tags ?? [];
  return tags.includes(manifestKey) && tags.includes("managed-by-manifest");
}

/** True коли на сутності немає ЖОДНОГО маркера власності. */
function isUntagged(entity) {
  const tags = entity?.tags ?? [];
  if (tags.includes("managed-by-manifest")) return false;
  return !tags.some((t) => typeof t === "string" && /^[a-z0-9]+:/i.test(t));
}

/**
 * Build the lookup tables used to decide UPDATE-vs-CREATE for each panel.
 *
 * Scoping is the whole point: `byTag` and `byName` only ever see insights this
 * manifest owns, so a key/name collision with another manifest can no longer
 * PATCH a foreign insight. `globalByName` is populated only for the manifests
 * listed in `LEGACY_GLOBAL_NAME_FALLBACK`, preserving the pre-existing
 * project-wide fallback for founder-pulse (whose oldest insights may not carry
 * the tags this script now writes).
 */
export function buildInsightIndex(insights, manifestKey) {
  const byTag = new Map();
  const byName = new Map();
  const globalByName = new Map();
  const allowGlobal = LEGACY_GLOBAL_NAME_FALLBACK.includes(manifestKey);
  const prefixes = tagPrefixes(manifestKey);

  for (const insight of insights ?? []) {
    if (allowGlobal && insight.name) globalByName.set(insight.name, insight);
    if (!isOwnedBy(insight, manifestKey)) continue;
    if (insight.name) byName.set(insight.name, insight);
    for (const t of insight.tags ?? []) {
      if (
        typeof t === "string" &&
        prefixes.some((p) => t.startsWith(`${p}:`)) &&
        !byTag.has(t)
      ) {
        byTag.set(t, insight);
      }
    }
  }
  return { byTag, byName, globalByName, prefixes };
}

/** Resolve the existing insight for one panel, or `undefined` to create it. */
export function findExistingInsight(index, manifestKey, panel) {
  for (const prefix of index.prefixes) {
    const hit = index.byTag.get(`${prefix}:${panel.key}`);
    if (hit) return hit;
  }
  return (
    index.byName.get(panel.name) ??
    index.byName.get(panel.name_uk ?? panel.name) ??
    index.globalByName.get(panel.name)
  );
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
          // `$any_event` (і відсутнє поле) → null id, тобто "All events".
          // Будь-яка інша подія проходить наскрізь: доти цей рядок був
          // захардкоджений, тож маніфест, що просив конкретну returning-подію,
          // МОВЧКИ отримував "All events" — розбіжність, помітна лише як
          // дивні числа на дашборді.
          returningEntity:
            panel.returning_event && panel.returning_event !== "$any_event"
              ? {
                  id: panel.returning_event,
                  type: "events",
                  name: panel.returning_event,
                }
              : { id: null, type: "events", name: "All events" },
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
  if (!TOKEN) {
    console.error("POSTHOG_API_KEY env var is required (personal API key).");
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const dashName = manifest.umbrella_dashboard?.name || manifest.name;
  console.log(
    `Manifest "${manifest.key}" → project ${PROJECT} @ ${HOST}${DRY ? " (DRY RUN)" : ""}`,
  );

  // 1. Dashboard — reuse only a dashboard THIS manifest owns (see
  // `findExistingDashboard`), else create it tagged; sync description (UA
  // preferred).
  const dashDescription = (
    manifest.description_uk ??
    manifest.description ??
    ""
  ).slice(0, 400);
  const dashList = await api(`/dashboards/?limit=200`);
  const dashTags = dashboardTags(manifest.key);
  let dash = findExistingDashboard(
    dashList.results || [],
    manifest.key,
    dashName,
  );
  if (dash) {
    console.log(`  dashboard "${dashName}" exists → #${dash.id} (reuse)`);
    if (!DRY) {
      // Теги дописуються і при reuse: інакше legacy-дашборд назавжди
      // лишається невідтеґованим і кожен наступний прогін знову покладається
      // на глобальний name-fallback.
      await api(`/dashboards/${dash.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          description: dashDescription,
          tags: [...new Set([...(dash.tags ?? []), ...dashTags])],
        }),
      });
    }
  } else if (DRY) {
    console.log(`  would CREATE dashboard "${dashName}"`);
    dash = { id: "<new>" };
  } else {
    dash = await api(`/dashboards/`, {
      method: "POST",
      body: JSON.stringify({
        name: dashName,
        description: dashDescription,
        tags: dashTags,
      }),
    });
    console.log(`  created dashboard "${dashName}" → #${dash.id}`);
  }

  // 2. Insights — one per panel. Matched by a stable per-panel tag
  // (`<prefix>:<key>`, prefix derived from `manifest.key`) so renames /
  // UA-description updates PATCH in place instead of creating duplicates.
  // The lookup is SCOPED to insights this manifest owns, so importing a second
  // manifest into the same project cannot PATCH a foreign insight through a
  // panel-key or name collision. Legacy manifests keep the project-wide name
  // fallback for insights created before `managed-by-manifest` tagging.
  const insList = await api(`/insights/?limit=300`);
  const index = buildInsightIndex(insList.results || [], manifest.key);
  console.log(
    `  tag-namespace "${index.prefixes.map((p) => `${p}:`).join('", "')}" → ` +
      `${index.byTag.size} tagged / ${index.byName.size} named insight(s) owned by this manifest`,
  );

  for (const panel of manifest.panels) {
    const name = panel.name_uk ?? panel.name;
    const description = (
      panel.description_uk ?? `${panel.description}\n\n${panel.rationale}`
    ).slice(0, 400);
    const tags = panelTags(manifest.key, panel.key);
    const existing = findExistingInsight(index, manifest.key, panel);

    if (DRY) {
      console.log(
        `  would ${existing ? "UPDATE" : "CREATE"} insight "${name}" (${panel.type})`,
      );
      continue;
    }
    try {
      const query = buildQuery(panel);
      if (existing) {
        await api(`/insights/${existing.id}/`, {
          method: "PATCH",
          body: JSON.stringify({ name, description, query, tags }),
        });
        console.log(`  updated insight "${name}" → [${existing.short_id}]`);
      } else {
        const created = await api(`/insights/`, {
          method: "POST",
          body: JSON.stringify({
            name,
            description,
            query,
            dashboards: [dash.id],
            tags,
          }),
        });
        console.log(`  created insight "${name}" → [${created.short_id}]`);
      }
    } catch (err) {
      console.error(`  ✗ FAILED "${name}": ${err.message}`);
    }
  }

  console.log(
    `\nDone. Dashboard: ${HOST}/project/${PROJECT}/dashboard/${dash.id}`,
  );
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
