// scripts/docs/__tests__/generate-open-work.test.mjs
//
// Unit tests for the open-work dashboard generator.
// Run with: node --test scripts/docs/__tests__/generate-open-work.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  stripStatusPrefix,
  classifyStatus,
  extractPRNumbers,
  extractAgentReady,
  shouldSkipFile,
  collectOpenWork,
  truncateStatus,
  formatPRLinks,
  formatAgentReady,
  renderOpenWork,
  rewriteRelativeLinks,
  totalOpen,
  addDays,
  applySkillMapping,
  agentReadyRank,
  sortByAgentReady,
} from "../generate-open-work.mjs";

describe("stripStatusPrefix", () => {
  it("strips leading bold markers", () => {
    assert.equal(
      stripStatusPrefix("**Closed (2026-05-04)**"),
      "Closed (2026-05-04)**",
    );
  });
  it("strips leading whitespace", () => {
    assert.equal(stripStatusPrefix("   Active"), "Active");
  });
  it("strips italics", () => {
    assert.equal(stripStatusPrefix("_Active_"), "Active_");
  });
  it("returns input unchanged when no prefix", () => {
    assert.equal(stripStatusPrefix("Active"), "Active");
  });
});

describe("classifyStatus", () => {
  it("classifies common open statuses", () => {
    assert.equal(classifyStatus("Active"), "open");
    assert.equal(classifyStatus("Draft"), "open");
    assert.equal(classifyStatus("In progress"), "open");
    assert.equal(
      classifyStatus("In progress (Phase 1 done; Phase 2 pending)"),
      "open",
    );
    assert.equal(classifyStatus("Scaffolded"), "open");
    assert.equal(classifyStatus("Open"), "open");
    assert.equal(classifyStatus("Planned"), "open");
  });

  it("classifies multi-phase status as open", () => {
    assert.equal(classifyStatus("Phase 1 closed; Phase 2 pending"), "open");
    assert.equal(classifyStatus("Phase 1/2 shipped"), "open");
  });

  it("classifies closed statuses", () => {
    assert.equal(classifyStatus("Closed"), "closed");
    assert.equal(classifyStatus("Closed (2026-05-04)"), "closed");
    assert.equal(classifyStatus("Closed — merged [#1234]"), "closed");
    assert.equal(classifyStatus("Done"), "closed");
    assert.equal(classifyStatus("Archived"), "closed");
    assert.equal(classifyStatus("Implemented"), "closed");
  });

  it("classifies reference-only statuses", () => {
    assert.equal(classifyStatus("Frozen reference — see foo.md"), "reference");
    assert.equal(classifyStatus("Reference (no actions)"), "reference");
    assert.equal(classifyStatus("Superseded by ADR-0050"), "reference");
    assert.equal(classifyStatus("Аналіз, не потребує дій зараз."), "reference");
  });

  it("handles bold-wrapped status text", () => {
    // Real-world example from docs/security/hardening/I2-secret-scanning-push-protection.md
    assert.equal(classifyStatus("**Closed (2026-05-04)**"), "closed");
  });

  it("returns unknown for blank or unrecognised input", () => {
    assert.equal(classifyStatus(""), "unknown");
    assert.equal(classifyStatus("???"), "unknown");
    assert.equal(classifyStatus(null), "unknown");
  });
});

describe("extractPRNumbers", () => {
  it("extracts deduped sorted PR numbers", () => {
    const content =
      "See [#1500](url) and #1499 and #1500 again. Also /pull/2100 and PR #2099.";
    assert.deepEqual(extractPRNumbers(content), [1499, 1500, 2099, 2100]);
  });

  it("ignores numbers shorter than 3 digits", () => {
    const content = "See #5 and #12 — these are list items, not PRs.";
    assert.deepEqual(extractPRNumbers(content), []);
  });

  it("ignores 6-digit hex colors", () => {
    const content = "dark theme uses `#171412`; real PR #2816 remains linked.";
    assert.deepEqual(extractPRNumbers(content), [2816]);
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(extractPRNumbers(""), []);
    assert.deepEqual(extractPRNumbers(null), []);
  });

  it("captures `/pull/NNNN` URLs as PR mentions", () => {
    const content = "https://github.com/Skords-01/Sergeant/pull/2122";
    assert.deepEqual(extractPRNumbers(content), [2122]);
  });
});

describe("shouldSkipFile", () => {
  it("skips README, follow-ups, open-work files", () => {
    assert.equal(shouldSkipFile("docs/initiatives/README.md"), true);
    assert.equal(shouldSkipFile("docs/initiatives/follow-ups.md"), true);
    assert.equal(shouldSkipFile("docs/open-work.md"), true);
  });

  it("skips files in archive directories", () => {
    assert.equal(shouldSkipFile("docs/initiatives/archive/_0001-foo.md"), true);
    assert.equal(shouldSkipFile("docs/planning/archive/old-roadmap.md"), true);
  });

  it("skips completed-prefix files (_NNNN-…)", () => {
    assert.equal(
      shouldSkipFile("docs/initiatives/_0001-module-decomposition.md"),
      true,
    );
  });

  it("keeps regular tracker files", () => {
    assert.equal(shouldSkipFile("docs/initiatives/0002-mobile.md"), false);
    assert.equal(shouldSkipFile("docs/planning/storage-roadmap.md"), false);
  });
});

describe("truncateStatus", () => {
  it("returns short status untouched", () => {
    assert.equal(truncateStatus("Active"), "Active");
  });
  it("collapses newlines into spaces", () => {
    assert.equal(truncateStatus("Active\n— ongoing"), "Active — ongoing");
  });
  it("truncates with ellipsis when over limit", () => {
    const long = "x".repeat(200);
    const result = truncateStatus(long, 50);
    assert.equal(result.length, 50);
    assert.ok(result.endsWith("…"));
  });
});

describe("formatPRLinks", () => {
  it("renders an em-dash for empty list", () => {
    assert.equal(formatPRLinks([]), "—");
  });
  it("renders each PR as a markdown link to github.com/Skords-01/Sergeant", () => {
    const result = formatPRLinks([1500, 2100]);
    assert.match(
      result,
      /\[#1500\]\(https:\/\/github\.com\/Skords-01\/Sergeant\/pull\/1500\)/,
    );
    assert.match(
      result,
      /\[#2100\]\(https:\/\/github\.com\/Skords-01\/Sergeant\/pull\/2100\)/,
    );
  });
  it("truncates with `+N` overflow indicator after maxShown", () => {
    const prs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const result = formatPRLinks(prs, { maxShown: 3 });
    assert.match(result, /\+9$/);
  });
});

describe("parseDocument + listMarkdown + collectOpenWork (integration)", () => {
  it("scans a synthetic tracker tree end-to-end", () => {
    const tmp = mkdtempSync(join(tmpdir(), "open-work-test-"));
    try {
      // Build fixture: docs/myTracker/{a,b,c,_d,README,archive/old}.md
      const trackerDir = join(tmp, "docs/myTracker");
      mkdirSync(trackerDir, { recursive: true });
      mkdirSync(join(trackerDir, "archive"), { recursive: true });
      mkdirSync(join(trackerDir, "sub"), { recursive: true });

      writeFileSync(
        join(trackerDir, "active-thing.md"),
        [
          "# Active thing",
          "",
          "> **Last validated:** 2026-05-13 by @x. **Next review:** 2026-08-11.",
          "> **Status:** Active",
          "",
          "See [#1234](url) and #2099 for context.",
        ].join("\n"),
      );
      writeFileSync(
        join(trackerDir, "closed-thing.md"),
        [
          "# Closed thing",
          "",
          "> **Status:** Closed — merged [#1500](url)",
          "",
          "body",
        ].join("\n"),
      );
      writeFileSync(
        join(trackerDir, "reference-thing.md"),
        ["# Ref", "> **Status:** Frozen reference"].join("\n"),
      );
      writeFileSync(
        join(trackerDir, "_completed.md"),
        ["# Done", "> **Status:** Active"].join("\n"), // _ prefix → skipped
      );
      writeFileSync(
        join(trackerDir, "README.md"),
        ["# README", "> **Status:** Active"].join("\n"), // README → skipped
      );
      writeFileSync(
        join(trackerDir, "archive/old.md"),
        ["# Old", "> **Status:** Active"].join("\n"), // archive/ → skipped
      );
      writeFileSync(
        join(trackerDir, "sub/nested.md"),
        ["# Nested", "> **Status:** Draft"].join("\n"),
      );

      // Recursive=true should pick up `sub/nested.md` but skip
      // README/archive/_-prefix.
      const sections = collectOpenWork(tmp, [
        {
          id: "my",
          title: "My tracker",
          blurb: "test",
          rootDir: "docs/myTracker",
          recursive: true,
        },
      ]);

      assert.equal(sections.length, 1);
      const titles = sections[0].entries.map((e) => e.title).sort();
      assert.deepEqual(titles, ["Active thing", "Nested"]);

      // PR extraction propagates from doc body
      const active = sections[0].entries.find(
        (e) => e.title === "Active thing",
      );
      assert.deepEqual(active.prs, [1234, 2099]);
      assert.equal(active.status, "open");
      assert.equal(active.relToRootDir, "active-thing.md");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("recursive=false ignores subdirectories", () => {
    const tmp = mkdtempSync(join(tmpdir(), "open-work-test-"));
    try {
      const trackerDir = join(tmp, "docs/flat");
      mkdirSync(trackerDir, { recursive: true });
      mkdirSync(join(trackerDir, "sub"), { recursive: true });

      writeFileSync(
        join(trackerDir, "top.md"),
        ["# Top", "> **Status:** Active"].join("\n"),
      );
      writeFileSync(
        join(trackerDir, "sub/nested.md"),
        ["# Nested", "> **Status:** Active"].join("\n"),
      );

      const sections = collectOpenWork(tmp, [
        {
          id: "flat",
          title: "Flat",
          blurb: "",
          rootDir: "docs/flat",
          recursive: false,
        },
      ]);

      const titles = sections[0].entries.map((e) => e.title);
      assert.deepEqual(titles, ["Top"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("renderOpenWork", () => {
  it("renders empty trackers with `Жодного відкритого документа.`", () => {
    const sections = [
      {
        tracker: { id: "t1", title: "T1", blurb: "blurb1" },
        entries: [],
      },
    ];
    const md = renderOpenWork(sections, { today: "2026-05-13" });
    assert.match(md, /## T1 \(0\)/);
    assert.match(md, /Жодного відкритого документа/);
  });

  it("renders a section with one entry as a markdown table", () => {
    const sections = [
      {
        tracker: { id: "t1", title: "T1", blurb: "blurb1" },
        entries: [
          {
            relPath: "docs/t1/foo.md",
            linkPath: "t1/foo.md",
            relToRootDir: "foo.md",
            title: "Foo",
            rawStatus: "Active — ongoing",
            status: "open",
            prs: [1500],
          },
        ],
      },
    ];
    const md = renderOpenWork(sections, { today: "2026-05-13" });
    assert.match(md, /\| Документ \| Статус \| PR-згадки \|/);
    assert.match(md, /\[`foo\.md`\]\(\.\/t1\/foo\.md\)/);
    assert.match(md, /Active — ongoing/);
    assert.match(md, /\[#1500\]/);
  });

  it("includes the Last validated header with the canonical handle", () => {
    const md = renderOpenWork([], { today: "2026-05-13" });
    assert.match(
      md,
      /> \*\*Last validated:\*\* 2026-05-13 by @codex\. \*\*Next review:\*\* 2026-08-11\./,
    );
    assert.match(md, /> \*\*Status:\*\* Active/);
  });

  it("includes the summary line with per-tracker counts", () => {
    const sections = [
      {
        tracker: { id: "t1", title: "T1", blurb: "" },
        entries: [
          {
            relPath: "x",
            linkPath: "x",
            relToRootDir: "x.md",
            title: "X",
            rawStatus: "Active",
            status: "open",
            prs: [],
          },
        ],
      },
      {
        tracker: { id: "t2", title: "T2", blurb: "" },
        entries: [],
      },
    ];
    const md = renderOpenWork(sections, { today: "2026-05-13" });
    assert.match(
      md,
      /\*\*Усього відкритих документів:\*\* \*\*1\*\* — T1: \*\*1\*\* · T2: \*\*0\*\*\./,
    );
  });

  it("flags unknown statuses with the ❓ marker", () => {
    const sections = [
      {
        tracker: { id: "t1", title: "T1", blurb: "" },
        entries: [
          {
            relPath: "x",
            linkPath: "x",
            relToRootDir: "x.md",
            title: "X",
            rawStatus: "Mystery status text",
            status: "unknown",
            prs: [],
          },
        ],
      },
    ];
    const md = renderOpenWork(sections, { today: "2026-05-13" });
    assert.match(md, /Mystery status text ❓/);
  });
});

describe("totalOpen", () => {
  it("sums entries across sections", () => {
    const sections = [
      { tracker: {}, entries: [{}, {}, {}] },
      { tracker: {}, entries: [] },
      { tracker: {}, entries: [{}, {}] },
    ];
    assert.equal(totalOpen(sections), 5);
  });
});

describe("addDays", () => {
  it("adds calendar days correctly", () => {
    assert.equal(addDays("2026-05-13", 90), "2026-08-11");
    assert.equal(addDays("2026-01-01", 0), "2026-01-01");
  });
});

describe("rewriteRelativeLinks", () => {
  it("rewrites a sibling-file link to be relative to the new file", () => {
    const out = rewriteRelativeLinks(
      "see [tracker](./ftux-master-tracker.md#3-4) for details",
      "docs/launch/product-os/paywall-implementation-plan.md",
      "docs/open-work.md",
    );
    assert.match(
      out,
      /\[tracker\]\(\.\/launch\/product-os\/ftux-master-tracker\.md#3-4\)/,
    );
  });

  it("preserves protocol URLs unchanged", () => {
    const input =
      "see [issue](https://github.com/foo/bar/issues/1) for details";
    assert.equal(
      rewriteRelativeLinks(input, "docs/a/b.md", "docs/open-work.md"),
      input,
    );
  });

  it("preserves pure anchor links unchanged", () => {
    const input = "see [section](#some-anchor) for details";
    assert.equal(
      rewriteRelativeLinks(input, "docs/a/b.md", "docs/open-work.md"),
      input,
    );
  });

  it("preserves root-relative links unchanged", () => {
    const input = "see [doc](/docs/foo.md)";
    assert.equal(
      rewriteRelativeLinks(input, "docs/a/b.md", "docs/open-work.md"),
      input,
    );
  });

  it("rewrites parent-directory references", () => {
    const out = rewriteRelativeLinks(
      "see [config](../../adr/0050.md)",
      "docs/initiatives/stack-pulse-2026-05/pr-05.md",
      "docs/open-work.md",
    );
    assert.match(out, /\[config\]\(\.\/adr\/0050\.md\)/);
  });

  it("returns input unchanged when no links are present", () => {
    assert.equal(
      rewriteRelativeLinks(
        "Active — no links here",
        "docs/a.md",
        "docs/open-work.md",
      ),
      "Active — no links here",
    );
  });

  it("handles null / undefined gracefully", () => {
    assert.equal(rewriteRelativeLinks(null, "a", "b"), null);
    assert.equal(rewriteRelativeLinks("text", null, "b"), "text");
  });
});

// ── Phase 2 (Initiative 0015): agent-dispatch metadata ──────────────────────

describe("extractAgentReady", () => {
  it("reads the three allowed values from the quote-block header", () => {
    assert.equal(extractAgentReady("> **Agent-ready:** yes"), "yes");
    assert.equal(
      extractAgentReady("> **Agent-ready:** needs-decision"),
      "needs-decision",
    );
    assert.equal(extractAgentReady("> **Agent-ready:** blocked"), "blocked");
  });

  it("tolerates backticks and trailing prose", () => {
    assert.equal(
      extractAgentReady("> **Agent-ready:** `yes` — unblocked"),
      "yes",
    );
  });

  it("returns null when absent or invalid", () => {
    assert.equal(extractAgentReady("> **Status:** Active"), null);
    assert.equal(extractAgentReady("> **Agent-ready:** maybe"), null);
    assert.equal(extractAgentReady(""), null);
  });
});

describe("agentReadyRank / sortByAgentReady", () => {
  it("ranks yes < needs-decision < blocked < unknown", () => {
    assert.ok(agentReadyRank("yes") < agentReadyRank("needs-decision"));
    assert.ok(agentReadyRank("needs-decision") < agentReadyRank("blocked"));
    assert.ok(agentReadyRank("blocked") < agentReadyRank(null));
  });

  it("sorts entries yes → needs-decision → blocked, stable on ties", () => {
    const entries = [
      { id: "b1", agentReady: "blocked" },
      { id: "y1", agentReady: "yes" },
      { id: "n1", agentReady: "needs-decision" },
      { id: "b2", agentReady: "blocked" },
      { id: "x1", agentReady: null },
    ];
    sortByAgentReady(entries);
    assert.deepEqual(
      entries.map((e) => e.id),
      ["y1", "n1", "b1", "b2", "x1"],
    );
  });
});

describe("formatAgentReady", () => {
  it("maps each value to a coloured marker, others to em-dash", () => {
    assert.equal(formatAgentReady("yes"), "🟢 yes");
    assert.equal(formatAgentReady("needs-decision"), "🟡 needs-decision");
    assert.equal(formatAgentReady("blocked"), "🔴 blocked");
    assert.equal(formatAgentReady(null), "—");
    assert.equal(formatAgentReady("whatever"), "—");
  });
});

describe("applySkillMapping", () => {
  const mapping = {
    fallbackSkill: "sergeant-start-here",
    skillRules: [
      {
        skill: "sergeant-data-and-migrations",
        globs: ["**/*.sql"],
        keywords: ["migration"],
      },
      {
        skill: "sergeant-web-ui",
        globs: ["apps/web/**", "**/*.tsx"],
        keywords: ["frontend"],
      },
    ],
    playbookRules: [
      { playbook: "add-sql-migration.md", keywords: ["migration"] },
      { playbook: "add-new-page-route.md", keywords: ["new page"] },
    ],
  };

  it("falls back when nothing matches", () => {
    assert.deepEqual(applySkillMapping(mapping, { paths: [], text: "" }), {
      skill: "sergeant-start-here",
      playbook: null,
    });
  });

  it("picks the highest-scoring rule, not the first that matches", () => {
    // One stray `.sql` mention vs many web paths → web wins on score.
    const { skill } = applySkillMapping(mapping, {
      paths: [
        "apps/web/src/a.tsx",
        "apps/web/src/b.tsx",
        "apps/web/vite.config.ts",
        "scripts/legacy.sql",
      ],
      text: "frontend routing",
    });
    assert.equal(skill, "sergeant-web-ui");
  });

  it("earlier (more-specific) rule wins on a score tie", () => {
    const { skill } = applySkillMapping(mapping, {
      paths: ["x.sql", "apps/web/a.tsx"],
      text: "",
    });
    assert.equal(skill, "sergeant-data-and-migrations");
  });

  it("matches playbook by keyword", () => {
    const { playbook } = applySkillMapping(mapping, {
      paths: [],
      text: "we need a new page route",
    });
    assert.equal(playbook, "add-new-page-route.md");
  });
});

describe("renderOpenWork — enriched initiatives", () => {
  it("renders the extra Agent-ready / Skill / Playbook columns", () => {
    const sections = [
      {
        tracker: {
          id: "initiatives",
          title: "Ініціативи",
          blurb: "",
          enrich: true,
        },
        entries: [
          {
            relPath: "docs/initiatives/0001-x.md",
            linkPath: "initiatives/0001-x.md",
            relToRootDir: "0001-x.md",
            title: "X",
            rawStatus: "In progress",
            status: "open",
            prs: [],
            agentReady: "yes",
            skill: "sergeant-web-ui",
            playbook: "add-new-page-route.md",
          },
        ],
      },
    ];
    const md = renderOpenWork(sections, { today: "2026-05-13" });
    assert.match(
      md,
      /\| Документ \| Статус \| PR-згадки \| Agent-ready \| Skill \| Playbook \|/,
    );
    assert.match(md, /🟢 yes/);
    assert.match(md, /`sergeant-web-ui`/);
    assert.match(md, /`add-new-page-route\.md`/);
  });
});
