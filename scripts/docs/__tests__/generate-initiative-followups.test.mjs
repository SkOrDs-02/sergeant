// scripts/docs/__tests__/generate-initiative-followups.test.mjs
//
// Unit tests for the initiative follow-ups index generator.
// Run with: node --test scripts/docs/__tests__/generate-initiative-followups.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  sliceCarryOverBlock,
  parseCarryOverBullets,
  classifyBullet,
  compareCadence,
  renderFollowUps,
  addDays,
} from "../generate-initiative-followups.mjs";

describe("sliceCarryOverBlock", () => {
  it("returns the block body when heading is present", () => {
    const content = [
      "# Title",
      "",
      "## Some section",
      "",
      "body",
      "",
      "### Carry-over → successor",
      "",
      "- [ ] Item one",
      "- [ ] Item two",
      "",
    ].join("\n");
    const block = sliceCarryOverBlock(content);
    assert.match(block, /Item one/);
    assert.match(block, /Item two/);
  });

  it("stops at the next heading", () => {
    const content = [
      "### Carry-over → successor",
      "- [ ] keep",
      "",
      "## Next section",
      "should-not-be-here",
    ].join("\n");
    const block = sliceCarryOverBlock(content);
    assert.match(block, /keep/);
    assert.doesNotMatch(block, /should-not-be-here/);
  });

  it("returns null when no Carry-over heading", () => {
    assert.equal(sliceCarryOverBlock("# Title\n\nbody"), null);
  });

  it("supports both ## and ### levels", () => {
    const at2 = sliceCarryOverBlock("## Carry-over → successor\n\n- [ ] x\n");
    const at3 = sliceCarryOverBlock("### Carry-over → successor\n\n- [ ] x\n");
    assert.match(at2, /- \[ \] x/);
    assert.match(at3, /- \[ \] x/);
  });
});

describe("classifyBullet", () => {
  it("recognises an ISO-date prefix", () => {
    const out = classifyBullet(
      "**2026-05-12:** перевірити cache-hit-rate ≥60%",
    );
    assert.equal(out.kind, "one-shot-dated");
    assert.equal(out.key, "2026-05-12");
    assert.equal(out.description, "перевірити cache-hit-rate ≥60%");
  });

  it("recognises an ISO-date prefix with parenthetical hint", () => {
    const out = classifyBullet(
      "**2026-05-12 (≈ +тиждень):** перевірити hit-rate",
    );
    assert.equal(out.kind, "one-shot-dated");
    assert.equal(out.key, "2026-05-12");
    assert.equal(out.description, "перевірити hit-rate");
  });

  it("recognises a Recurring prefix and lowercases the cadence key", () => {
    const out = classifyBullet("**Recurring (Weekly):** sweep stale flags");
    assert.equal(out.kind, "recurring");
    assert.equal(out.key, "weekly");
    assert.equal(out.description, "sweep stale flags");
  });

  it("treats other **bold:** prefixes as trigger-based", () => {
    const out = classifyBullet(
      "**Після baseline-week:** cost-based alert threshold",
    );
    assert.equal(out.kind, "trigger");
    assert.equal(out.key, "Після baseline-week");
    assert.equal(out.description, "cost-based alert threshold");
  });

  it("falls through to TBD when no bold prefix", () => {
    const out = classifyBullet(
      "Per-route hit-rate breakdown — додати endpoint label",
    );
    assert.equal(out.kind, "tbd");
    assert.equal(out.key, "");
    assert.equal(
      out.description,
      "Per-route hit-rate breakdown — додати endpoint label",
    );
  });
});

describe("parseCarryOverBullets", () => {
  it("returns top-level unchecked bullets only", () => {
    const block = [
      "",
      "- [ ] **2026-05-12:** alpha",
      "- [x] historical (should be ignored)",
      "- [ ] beta",
      "",
    ].join("\n");
    const bullets = parseCarryOverBullets(block);
    assert.equal(bullets.length, 2);
    assert.equal(bullets[0].description, "alpha");
    assert.equal(bullets[1].description, "beta");
  });

  it("folds nested bullets into the parent description", () => {
    const block = [
      "- [ ] **2026-05-12:** parent",
      "    - sub one",
      "    - sub two",
      "- [ ] solo",
    ].join("\n");
    const bullets = parseCarryOverBullets(block);
    assert.equal(bullets.length, 2);
    assert.match(bullets[0].description, /parent/);
    assert.match(bullets[0].description, /sub one/);
    assert.match(bullets[0].description, /sub two/);
    assert.equal(bullets[1].description, "solo");
  });

  it("returns [] for null/empty input", () => {
    assert.deepEqual(parseCarryOverBullets(null), []);
    assert.deepEqual(parseCarryOverBullets(""), []);
  });
});

describe("compareCadence", () => {
  it("orders known cadences by frequency (faster first)", () => {
    assert.ok(compareCadence("daily", "weekly") < 0);
    assert.ok(compareCadence("weekly", "monthly") < 0);
    assert.ok(compareCadence("monthly", "quarterly") < 0);
  });

  it("places unknown cadences after known ones", () => {
    assert.ok(compareCadence("weekly", "fortnightly-on-fridays") < 0);
    assert.ok(compareCadence("zzz", "weekly") > 0);
  });

  it("is alphabetical between two unknown cadences", () => {
    assert.ok(compareCadence("alpha", "beta") < 0);
  });
});

describe("renderFollowUps", () => {
  const sample = [
    {
      file: "0005-ai-cost.md",
      title: "AI cost",
      kind: "one-shot-dated",
      key: "2026-05-12",
      description: "перевірити cache-hit-rate",
    },
    {
      file: "0005-ai-cost.md",
      title: "AI cost",
      kind: "trigger",
      key: "Після baseline-week",
      description: "cost-based alert",
    },
    {
      file: "0004-server-obs.md",
      title: "Server obs",
      kind: "tbd",
      key: "",
      description: "RED-deltas → span attributes",
    },
    {
      file: "0008-platform.md",
      title: "Platform hardening",
      kind: "recurring",
      key: "weekly",
      description: "review stale audit-exceptions",
    },
  ];

  it("emits two top-level sections in fixed order", () => {
    const out = renderFollowUps(sample, { today: "2026-05-05" });
    const oneShotIdx = out.indexOf("## One-shot");
    const recurringIdx = out.indexOf("## Recurring");
    assert.ok(oneShotIdx > 0);
    assert.ok(recurringIdx > oneShotIdx);
  });

  it("places dated items before trigger before TBD inside One-shot", () => {
    const out = renderFollowUps(sample, { today: "2026-05-05" });
    const datedIdx = out.indexOf("2026-05-12");
    const triggerIdx = out.indexOf("Після baseline-week");
    const tbdIdx = out.indexOf("RED-deltas");
    assert.ok(datedIdx < triggerIdx, "dated must precede trigger");
    assert.ok(triggerIdx < tbdIdx, "trigger must precede TBD");
  });

  it("flags overdue dated items", () => {
    const out = renderFollowUps(sample, { today: "2026-06-01" });
    assert.match(out, /2026-05-12.*⚠ overdue/);
  });

  it("does NOT flag dated items that are still in the future", () => {
    const out = renderFollowUps(sample, { today: "2026-05-05" });
    assert.doesNotMatch(out, /2026-05-12.*⚠ overdue/);
  });

  it("renders an empty-section placeholder when no items match", () => {
    const out = renderFollowUps([], { today: "2026-05-05" });
    assert.match(out, /Жодного відкритого one-shot/);
    assert.match(out, /Жодного recurring-чека/);
  });

  it("includes the freshness header with addDays(+90)", () => {
    const out = renderFollowUps(sample, { today: "2026-05-05" });
    assert.match(out, /Last validated:\*\* 2026-05-05/);
    assert.match(out, /Next review:\*\* 2026-08-03/);
  });
});

describe("addDays", () => {
  it("adds 90 days correctly across month/quarter boundaries", () => {
    assert.equal(addDays("2026-05-05", 90), "2026-08-03");
    assert.equal(addDays("2026-01-01", 365), "2027-01-01");
  });
});
