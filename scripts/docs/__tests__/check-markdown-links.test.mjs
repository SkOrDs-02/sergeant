// scripts/docs/__tests__/check-markdown-links.test.mjs
//
// Unit tests for the markdown-link checker's pure extraction and classification.
// Run with: node --test scripts/docs/__tests__/check-markdown-links.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import {
  extractLinks,
  classifyTarget,
  resolveInternal,
  shouldSkipFile,
  walkMarkdown,
  loadCache,
  saveCache,
  loadAllowlist,
  isAllowlisted,
  headingSlug,
  renderHeadingText,
  collectAnchors,
  nearestAnchor,
  splitAnchor,
} from "../check-markdown-links.mjs";

describe("extractLinks", () => {
  it("extracts plain [text](target) links", () => {
    const c = "See [docs](./README.md) and [home](https://example.com).";
    const links = extractLinks(c);
    assert.equal(links.length, 2);
    assert.equal(links[0].target, "./README.md");
    assert.equal(links[1].target, "https://example.com");
  });

  it("ignores links inside fenced code blocks", () => {
    const c = [
      "Outside: [a](./a.md)",
      "```",
      "Inside: [b](./b.md)",
      "```",
      "Outside again: [c](./c.md)",
    ].join("\n");
    const links = extractLinks(c);
    assert.deepEqual(
      links.map((l) => l.target),
      ["./a.md", "./c.md"],
    );
  });

  it("ignores shorter nested fences inside longer fenced blocks", () => {
    const c = [
      "Outside: [a](./a.md)",
      "````",
      "```diff",
      "+Inside: [b](./b.md)",
      "```",
      "Still inside: [c](./c.md)",
      "````",
      "Outside again: [d](./d.md)",
    ].join("\n");
    const links = extractLinks(c);
    assert.deepEqual(
      links.map((l) => l.target),
      ["./a.md", "./d.md"],
    );
  });

  it("ignores links inside inline backticks", () => {
    const c = "See `[foo](./bar.md)` and [real](./real.md).";
    const links = extractLinks(c);
    assert.deepEqual(
      links.map((l) => l.target),
      ["./real.md"],
    );
  });

  it("captures 1-based line numbers", () => {
    const c = ["line 1", "line 2 [x](./x.md)", "line 3"].join("\n");
    const links = extractLinks(c);
    assert.equal(links[0].line, 2);
  });
});

describe("classifyTarget", () => {
  it("classifies http(s) as external", () => {
    assert.equal(classifyTarget("https://example.com"), "external");
    assert.equal(classifyTarget("http://example.com"), "external");
  });

  it("classifies relative paths as internal", () => {
    assert.equal(classifyTarget("./foo.md"), "internal");
    assert.equal(classifyTarget("../foo.md"), "internal");
    assert.equal(classifyTarget("foo.md"), "internal");
  });

  it("skips pure anchors", () => {
    assert.equal(classifyTarget("#section-a"), "skip");
  });

  it("skips mailto/tel/javascript/data", () => {
    assert.equal(classifyTarget("mailto:x@y.z"), "skip");
    assert.equal(classifyTarget("tel:+1234"), "skip");
    assert.equal(classifyTarget("javascript:void(0)"), "skip");
    assert.equal(classifyTarget("data:image/png;base64,xxx"), "skip");
  });

  it("skips the placeholder patterns", () => {
    assert.equal(classifyTarget("undefined"), "skip");
    assert.equal(classifyTarget("<placeholder>.md"), "skip");
    assert.equal(classifyTarget("./{{var}}.md"), "skip");
  });
});

describe("shouldSkipFile", () => {
  it("skips .agents/skills/**", () => {
    assert.equal(shouldSkipFile(".agents/skills/foo/AGENTS.md"), true);
  });

  it("skips .agents\\skills\\** on Windows-style relative paths", () => {
    assert.equal(shouldSkipFile(".agents\\skills\\foo\\AGENTS.md"), true);
  });

  it("skips _TEMPLATE-*.md files", () => {
    assert.equal(
      shouldSkipFile("docs/start/instructions/_TEMPLATE-decision-tree.md"),
      true,
    );
  });

  it("does not skip regular docs", () => {
    assert.equal(shouldSkipFile("docs/governance/adr/0001-foo.md"), false);
    assert.equal(shouldSkipFile("README.md"), false);
  });
});

describe("resolveInternal", () => {
  it("resolves relative target from the source file's directory", () => {
    const repo = resolve(tmpdir(), "repo-mdlinks");
    const abs = resolveInternal(
      join(repo, "docs", "playbooks", "add-foo.md"),
      "./bar.md",
      repo,
    );
    assert.equal(abs, join(repo, "docs", "playbooks", "bar.md"));
  });

  it("strips the anchor before resolving", () => {
    const repo = resolve(tmpdir(), "repo-mdlinks");
    const abs = resolveInternal(
      join(repo, "docs", "a.md"),
      "./b.md#section",
      repo,
    );
    assert.equal(abs, join(repo, "docs", "b.md"));
  });

  it("resolves absolute-style paths against the repo root", () => {
    const repo = resolve(tmpdir(), "repo-mdlinks");
    const abs = resolveInternal(
      join(repo, "docs", "deep", "a.md"),
      "/README.md",
      repo,
    );
    assert.equal(abs, join(repo, "README.md"));
  });
});

describe("walkMarkdown", () => {
  it("finds markdown files, skipping node_modules", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdlinks-"));
    try {
      mkdirSync(join(dir, "sub"), { recursive: true });
      mkdirSync(join(dir, "node_modules/foo"), { recursive: true });
      writeFileSync(join(dir, "a.md"), "# a");
      writeFileSync(join(dir, "sub/b.md"), "# b");
      writeFileSync(join(dir, "node_modules/foo/ignored.md"), "# ignored");
      writeFileSync(join(dir, "not-md.txt"), "nope");
      const files = walkMarkdown(dir);
      const rels = files
        .map((f) => relative(dir, f).replace(/\\/g, "/"))
        .sort();
      assert.deepEqual(rels, ["a.md", "sub/b.md"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("loadCache / saveCache", () => {
  it("round-trips entries and drops expired ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdlinks-cache-"));
    try {
      const file = join(dir, "links.json");
      const now = Date.now();
      saveCache(
        {
          "https://fresh.example": { ok: true, status: 200, at: now },
          "https://stale.example": {
            ok: true,
            status: 200,
            at: now - 100 * 24 * 60 * 60 * 1000,
          },
        },
        file,
      );
      const loaded = loadCache(file, { now, ttl: 7 * 24 * 60 * 60 * 1000 });
      assert.ok(loaded["https://fresh.example"]);
      assert.equal(loaded["https://stale.example"], undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns {} when cache file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdlinks-cache-"));
    try {
      const out = loadCache(join(dir, "nope.json"));
      assert.deepEqual(out, {});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("external-link allowlist", () => {
  it("loadAllowlist returns [] for missing file", () => {
    const out = loadAllowlist("/no/such/path/allowlist.json");
    assert.deepEqual(out, []);
  });

  it("loadAllowlist parses valid entries with regex + reason", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdlinks-allow-"));
    try {
      const file = join(dir, "allow.json");
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          entries: [
            {
              pattern: "^https?://localhost(:\\d+)?",
              reason: "localhost is dev-only and unreachable from CI runners",
            },
          ],
        }),
      );
      const out = loadAllowlist(file);
      assert.equal(out.length, 1);
      assert.ok(out[0].regex.test("http://localhost:3000/"));
      assert.equal(
        out[0].reason,
        "localhost is dev-only and unreachable from CI runners",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loadAllowlist throws on missing pattern", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdlinks-allow-"));
    try {
      const file = join(dir, "allow.json");
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          entries: [{ reason: "some reason without a pattern field" }],
        }),
      );
      assert.throws(() => loadAllowlist(file), /pattern/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loadAllowlist throws on trivial reason (forces auditability)", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdlinks-allow-"));
    try {
      const file = join(dir, "allow.json");
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          entries: [{ pattern: "^x", reason: "nah" }],
        }),
      );
      assert.throws(() => loadAllowlist(file), /reason/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loadAllowlist throws on malformed top-level shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdlinks-allow-"));
    try {
      const file = join(dir, "allow.json");
      writeFileSync(file, JSON.stringify({ version: 1, entries: "oops" }));
      assert.throws(() => loadAllowlist(file), /malformed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("isAllowlisted matches any entry", () => {
    const allow = [
      { pattern: "^https?://a", regex: /^https?:\/\/a/, reason: "x test 1" },
      {
        pattern: "^https?://b\\.example",
        regex: /^https?:\/\/b\.example/,
        reason: "y test 2",
      },
    ];
    assert.equal(isAllowlisted("http://a/", allow), true);
    assert.equal(isAllowlisted("https://b.example/path", allow), true);
    assert.equal(isAllowlisted("https://c.example/", allow), false);
  });

  it("isAllowlisted with empty allowlist returns false", () => {
    assert.equal(isAllowlisted("https://x.example/", []), false);
  });
});

// ── Anchor verification (added 2026-09-11) ──────────────────────────────────
//
// A one-off sweep found 55 broken anchors that the file-existence check could
// never see. Each `headingSlug` case below is one of the four edges that made
// the class invisible; break any of them and the gate either goes silent or
// starts crying wolf on links that work.

describe("headingSlug", () => {
  it("keeps `_` inside a code span — it is not emphasis there", () => {
    // `## 12. Vite / фронтенд (`VITE_*`)` → the live anchor really does end
    // in `_`. Stripping backticks before emphasis-handling ate it and marked
    // a working link broken.
    assert.equal(
      headingSlug("12. Vite / фронтенд (`VITE_*`)"),
      "12-vite--фронтенд-vite_",
    );
    assert.equal(
      headingSlug("`METRICS_TOKEN` _(optional)_"),
      "metrics_token-optional",
    );
  });

  it("strips `_` used as an emphasis delimiter", () => {
    assert.equal(headingSlug("_Draft_ notes"), "draft-notes");
  });

  it("leaves a leading hyphen for an emoji-prefixed heading", () => {
    // GitHub drops the emoji but keeps the space after it, so the slug starts
    // with `-`. Four live links in the repo depend on this exact behaviour.
    assert.equal(
      headingSlug("\u{1F310} 1. Web / PWA — `apps/web`"),
      "-1-web--pwa--appsweb",
    );
  });

  it("collapses a dropped character into a double hyphen, not a single one", () => {
    assert.equal(headingSlug("Web / PWA"), "web--pwa");
  });

  it("drops U+2019 but keeps U+02BC — the two apostrophes are not the same", () => {
    // The heading in 04-launch-readiness.md uses U+2019 (punctuation, dropped);
    // five links pointed at it with U+02BC (a modifier LETTER, kept). That one
    // codepoint was the whole bug.
    assert.equal(
      headingSlug("1.1 Обов’язкові документи"),
      "11-обовязкові-документи",
    );
    assert.equal(
      headingSlug("1.1 Обовʼязкові документи"),
      "11-обовʼязкові-документи",
    );
  });

  it("tracks the number when a section is renumbered", () => {
    // `#9-повна-monthly-cost-projection` kept resolving as a file link long
    // after the target became §6 under a new title.
    assert.equal(
      headingSlug("6. Прогноз місячних витрат"),
      "6-прогноз-місячних-витрат",
    );
    assert.notEqual(
      headingSlug("6. Прогноз місячних витрат"),
      headingSlug("9. Повна monthly cost projection"),
    );
  });

  it("does not mistake a bare number in a heading for a code-span placeholder", () => {
    assert.equal(headingSlug("Крок 3 — далі"), "крок-3--далі");
    assert.equal(headingSlug("Крок `3` — далі"), "крок-3--далі");
  });

  it("unwraps links and drops images", () => {
    assert.equal(
      headingSlug("See [the plan](./plan.md) now"),
      "see-the-plan-now",
    );
    // An image is removed from the markdown *source*, so the space it left
    // behind is trimmed away — no leading hyphen. An emoji is still a real
    // character at trim time and only disappears in the character filter
    // afterwards, which is exactly why it *does* leave one. Same-looking
    // inputs, opposite slugs; both shapes exist in the tree.
    assert.equal(headingSlug("![logo](./l.png) Title"), "title");
    assert.equal(headingSlug("\u{1F310} Title"), "-title");
  });

  it("renderHeadingText leaves code-span content verbatim", () => {
    assert.equal(renderHeadingText("a `B_c*d` e"), "a B_c*d e");
  });
});

describe("collectAnchors", () => {
  it("suffixes repeated headings the way GitHub does", () => {
    const anchors = collectAnchors("# Notes\n## Notes\n### Notes\n").map(
      (a) => a.anchor,
    );
    assert.deepEqual(anchors, ["notes", "notes-1", "notes-2"]);
  });

  it("ignores `#` lines inside fenced code blocks", () => {
    const md = [
      "# Real",
      "```bash",
      "# not a heading",
      "```",
      "## Also real",
    ].join("\n");
    assert.deepEqual(
      collectAnchors(md).map((a) => a.anchor),
      ["real", "also-real"],
    );
  });

  it("picks up explicit <a id> / <a name> anchors", () => {
    const md = '# T\n\n<a id="Manual-Target"></a>\n<a name="second"></a>\n';
    const anchors = collectAnchors(md).map((a) => a.anchor);
    assert.ok(anchors.includes("manual-target"));
    assert.ok(anchors.includes("second"));
  });

  it("keeps the raw heading so an error message can quote it", () => {
    const [entry] = collectAnchors("## 4. Метрики готовності\n");
    assert.equal(entry.anchor, "4-метрики-готовності");
    assert.equal(entry.heading, "4. Метрики готовності");
  });
});

describe("splitAnchor", () => {
  it("splits path and anchor, lowercasing the anchor", () => {
    assert.deepEqual(splitAnchor("./a.md#Section-One"), {
      path: "./a.md",
      anchor: "section-one",
    });
  });

  it("percent-decodes so an encoded Cyrillic anchor compares equal", () => {
    assert.equal(splitAnchor("./a.md#%D1%81%D1%82%D0%B0%D0%BD").anchor, "стан");
  });

  it("returns a null anchor for a bare path or an empty fragment", () => {
    assert.equal(splitAnchor("./a.md").anchor, null);
    assert.equal(splitAnchor("./a.md#").anchor, null);
    assert.equal(splitAnchor("./a.md#").path, "./a.md");
  });

  it("survives a malformed percent escape instead of throwing", () => {
    assert.equal(splitAnchor("./a.md#%zz").anchor, "%zz");
  });
});

describe("nearestAnchor", () => {
  const anchors = collectAnchors(
    "## 4. Metrics readiness\n## Something else entirely\n",
  );

  it("names the near miss so the reader does not have to hunt", () => {
    const hit = nearestAnchor("4-metrics-success", anchors);
    assert.equal(hit.anchor, "4-metrics-readiness");
    assert.equal(hit.heading, "4. Metrics readiness");
  });

  it("returns null when nothing is close — a wrong hint costs more than none", () => {
    assert.equal(nearestAnchor("totally-absent", anchors), null);
  });

  it("returns null against an empty heading list", () => {
    assert.equal(nearestAnchor("anything", []), null);
  });
});

describe("anchor verification end-to-end", () => {
  it("accepts a live anchor and rejects a stale one in the same file", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdlinks-anchor-"));
    try {
      writeFileSync(
        join(dir, "target.md"),
        "# T\n\n## 🌐 1. Web / PWA — `apps/web`\n\n## 4. Метрики готовності\n",
      );
      const source = [
        "# S",
        "",
        "[ok](./target.md#-1-web--pwa--appsweb)",
        "[ok2](./target.md#4-метрики-готовності)",
        "[stale](./target.md#4-метрики-успіху)",
      ].join("\n");
      const anchors = collectAnchors(
        readFileSync(join(dir, "target.md"), "utf8"),
      );
      const verdicts = extractLinks(source).map((link) => {
        const { anchor } = splitAnchor(link.target);
        return anchors.some((e) => e.anchor === anchor);
      });
      assert.deepEqual(verdicts, [true, true, false]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
