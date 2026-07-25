import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

import { checkReferentialIntegrity } from "../lint-manifests.mjs";
import {
  LEGACY_GLOBAL_NAME_FALLBACK,
  LEGACY_TAG_PREFIXES,
  buildInsightIndex,
  findExistingInsight,
  isOwnedBy,
  panelTags,
  tagPrefix,
  tagPrefixes,
} from "../import-founder-pulse.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const readJson = (rel) =>
  JSON.parse(readFileSync(join(REPO_ROOT, rel), "utf8"));

const schema = readJson("ops/posthog/schema/dashboard.schema.json");
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

const founderPulse = readJson("ops/posthog/dashboards/founder-pulse.json");
const hubTabPerf = readJson("ops/posthog/dashboards/hub-tab-perf.json");
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------------------
// Schema — must validate BOTH shipped manifests unchanged (Stage 1 is a gap fix,
// not a re-authoring of the manifests).
// ---------------------------------------------------------------------------

test("schema validates the shipped founder-pulse manifest as-is", () => {
  assert.ok(validate(founderPulse), JSON.stringify(validate.errors, null, 2));
});

test("schema validates the shipped hub-tab-perf manifest as-is", () => {
  assert.ok(validate(hubTabPerf), JSON.stringify(validate.errors, null, 2));
});

test("both manifests point $schema at the file that now exists", () => {
  for (const m of [founderPulse, hubTabPerf]) {
    assert.equal(m.$schema, "../schema/dashboard.schema.json");
  }
});

test("schema rejects a panel the importer's buildQuery() cannot render", () => {
  const bad = clone(founderPulse);
  delete bad.panels[0].query; // type "trends", no query, no steps, no cohort
  assert.equal(validate(bad), false);
});

test("schema rejects a funnel panel without steps", () => {
  const bad = clone(founderPulse);
  const funnel = bad.panels.find((p) => p.type === "funnel");
  delete funnel.steps;
  assert.equal(validate(bad), false);
});

test("schema rejects a retention panel without cohortizing_event", () => {
  const bad = clone(founderPulse);
  const retention = bad.panels.find((p) => p.type === "retention");
  delete retention.cohortizing_event;
  assert.equal(validate(bad), false);
});

test("schema rejects a panel without targets", () => {
  const bad = clone(hubTabPerf);
  delete bad.panels[0].targets;
  assert.equal(validate(bad), false);
});

test("schema pins timezone to the Europe/Kyiv domain invariant", () => {
  const bad = clone(hubTabPerf);
  bad.timezone = "UTC";
  assert.equal(validate(bad), false);
});

test("schema rejects an unknown top-level key (drift guard)", () => {
  const bad = clone(hubTabPerf);
  bad.panelz = [];
  assert.equal(validate(bad), false);
});

test("schema rejects an events_contract entry without fired_by", () => {
  const bad = clone(hubTabPerf);
  delete bad.events_contract.hub_tab_switch_perf.fired_by;
  assert.equal(validate(bad), false);
});

// ---------------------------------------------------------------------------
// Referential integrity — what JSON Schema cannot express.
// ---------------------------------------------------------------------------

test("shipped manifests pass referential integrity", () => {
  assert.deepEqual(
    checkReferentialIntegrity(founderPulse, "founder-pulse.json"),
    [],
  );
  assert.deepEqual(
    checkReferentialIntegrity(hubTabPerf, "hub-tab-perf.json"),
    [],
  );
});

test("alert pointing at an unknown panel is reported", () => {
  const bad = clone(founderPulse);
  bad.alerts[0].panel = "no-such-panel";
  const errors = checkReferentialIntegrity(bad, "founder-pulse.json");
  assert.ok(errors.some((e) => e.includes("no-such-panel")));
});

test("panel missing from umbrella_dashboard.tiles is reported", () => {
  const bad = clone(hubTabPerf);
  bad.umbrella_dashboard.tiles = bad.umbrella_dashboard.tiles.slice(1);
  const errors = checkReferentialIntegrity(bad, "hub-tab-perf.json");
  assert.ok(errors.some((e) => e.includes("not pinned")));
});

test("duplicate panel keys are reported", () => {
  const bad = clone(hubTabPerf);
  bad.panels.push(clone(bad.panels[0]));
  const errors = checkReferentialIntegrity(bad, "hub-tab-perf.json");
  assert.ok(errors.some((e) => e.includes("duplicate")));
});

test("manifest key must match the file name", () => {
  const errors = checkReferentialIntegrity(hubTabPerf, "hub-perf.json");
  assert.ok(errors.some((e) => e.includes("does not match file name")));
});

// ---------------------------------------------------------------------------
// Tag namespace.
// ---------------------------------------------------------------------------

test("tagPrefix derives kebab-segment initials", () => {
  assert.equal(tagPrefix("founder-pulse"), "fp");
  assert.equal(tagPrefix("hub-tab-perf"), "htp");
  assert.equal(tagPrefix("value-loops"), "vl");
});

test("founder-pulse keeps its live `fp:` namespace and tag triple", () => {
  // Regression guard: these are the exact tags the 2026-06-26 import wrote onto
  // the seven live insights. Changing them means a re-import creates duplicates.
  assert.deepEqual(panelTags("founder-pulse", "active-users"), [
    "founder-pulse",
    "managed-by-manifest",
    "fp:active-users",
  ]);
  assert.deepEqual(tagPrefixes("founder-pulse"), ["fp"]);
  assert.ok(LEGACY_TAG_PREFIXES["founder-pulse"].includes("fp"));
  assert.ok(LEGACY_GLOBAL_NAME_FALLBACK.includes("founder-pulse"));
});

test("a new manifest gets its own namespace and tags", () => {
  assert.deepEqual(panelTags("value-loops", "advice-to-action"), [
    "value-loops",
    "managed-by-manifest",
    "vl:advice-to-action",
  ]);
});

test("isOwnedBy matches on manifest tag or namespace prefix", () => {
  assert.ok(isOwnedBy({ tags: ["founder-pulse"] }, "founder-pulse"));
  assert.ok(isOwnedBy({ tags: ["fp:active-users"] }, "founder-pulse"));
  assert.ok(!isOwnedBy({ tags: ["fp:active-users"] }, "value-loops"));
  assert.ok(!isOwnedBy({ tags: [] }, "founder-pulse"));
  assert.ok(!isOwnedBy({}, "founder-pulse"));
});

// ---------------------------------------------------------------------------
// Idempotency — offline stand-in for the dev-project dry-run.
// ---------------------------------------------------------------------------

/** Simulate the insights the 2026-06-26 founder-pulse import left in PostHog. */
function liveFounderPulseInsights() {
  const shortIds = [
    "XBRWeTrn",
    "9T025rBs",
    "WPf62Cq6",
    "bC6ZbB3v",
    "7SSCvzEA",
    "k0pjSfoY",
    "vMEk4MKL",
  ];
  return founderPulse.panels.map((panel, i) => ({
    id: 1000 + i,
    short_id: shortIds[i],
    name: panel.name_uk ?? panel.name,
    tags: ["founder-pulse", "managed-by-manifest", `fp:${panel.key}`],
  }));
}

test("re-import of founder-pulse resolves every panel to UPDATE, never CREATE", () => {
  const index = buildInsightIndex(liveFounderPulseInsights(), "founder-pulse");
  for (const panel of founderPulse.panels) {
    const existing = findExistingInsight(index, "founder-pulse", panel);
    assert.ok(existing, `panel "${panel.key}" would CREATE a duplicate`);
    assert.equal(existing.tags.includes(`fp:${panel.key}`), true);
  }
});

test("founder-pulse still matches pre-tag insights by project-wide name", () => {
  const legacy = [
    {
      id: 1,
      short_id: "OLD00001",
      name: founderPulse.panels[0].name,
      tags: [],
    },
  ];
  const index = buildInsightIndex(legacy, "founder-pulse");
  const hit = findExistingInsight(
    index,
    "founder-pulse",
    founderPulse.panels[0],
  );
  assert.equal(hit?.short_id, "OLD00001");
});

test("a second manifest cannot PATCH founder-pulse insights via key collision", () => {
  // THE regression this stage exists to prevent: same panel key, same display
  // name, different manifest → must CREATE its own insight, not hijack one.
  const index = buildInsightIndex(liveFounderPulseInsights(), "value-loops");
  const collidingPanel = {
    key: founderPulse.panels[0].key,
    name: founderPulse.panels[0].name,
    name_uk: founderPulse.panels[0].name_uk,
  };
  assert.equal(
    findExistingInsight(index, "value-loops", collidingPanel),
    undefined,
  );
});

test("a second manifest gets no project-wide name fallback", () => {
  const foreign = [
    {
      id: 7,
      short_id: "FOREIGN1",
      name: "Active users — DAU / WAU / MAU",
      tags: [],
    },
  ];
  const index = buildInsightIndex(foreign, "value-loops");
  assert.equal(index.globalByName.size, 0);
  assert.equal(
    findExistingInsight(index, "value-loops", {
      key: "active-users",
      name: "Active users — DAU / WAU / MAU",
    }),
    undefined,
  );
});

test("a manifest only ever sees insights it owns", () => {
  const mixed = [
    ...liveFounderPulseInsights(),
    {
      id: 90,
      short_id: "VL000001",
      name: "Петля: порада → дія",
      tags: ["value-loops", "managed-by-manifest", "vl:advice-to-action"],
    },
  ];
  const vlIndex = buildInsightIndex(mixed, "value-loops");
  assert.equal(vlIndex.byTag.size, 1);
  assert.equal(
    findExistingInsight(vlIndex, "value-loops", {
      key: "advice-to-action",
      name: "Петля: порада → дія",
    })?.short_id,
    "VL000001",
  );

  const fpIndex = buildInsightIndex(mixed, "founder-pulse");
  assert.equal(fpIndex.byTag.size, founderPulse.panels.length);
});
