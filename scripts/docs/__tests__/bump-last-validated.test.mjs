// scripts/docs/__tests__/bump-last-validated.test.mjs
//
// Unit tests for bump-last-validated.mjs (PR-12.C).
// Run with: node --test scripts/docs/__tests__/bump-last-validated.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  todayISO,
  addDays,
  resolveHandle,
  hashedEmailKey,
  mergeAuthorMap,
  loadAuthorMap,
  findHeaderLine,
  bumpHeader,
  bumpFiles,
} from "../bump-last-validated.mjs";

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { DEFAULT_CONFIG } from "../freshness-config.mjs";

const AUTHOR_MAP_PATH = fileURLToPath(
  new URL("../author-map.json", import.meta.url),
);

// ── Date helpers ─────────────────────────────────────────────────────────────

describe("todayISO", () => {
  it("returns YYYY-MM-DD UTC", () => {
    const d = new Date("2026-04-30T17:00:00Z");
    assert.equal(todayISO(d), "2026-04-30");
  });

  it("uses UTC, not local", () => {
    // 23:30 in some +14h timezone is still the previous UTC day.
    const d = new Date("2026-04-30T23:30:00Z");
    assert.equal(todayISO(d), "2026-04-30");
  });
});

describe("addDays", () => {
  it("90-day default cadence", () => {
    assert.equal(addDays("2026-04-30", 90), "2026-07-29");
  });

  it("crosses year boundary", () => {
    assert.equal(addDays("2026-12-15", 60), "2027-02-13");
  });
});

// ── resolveHandle ────────────────────────────────────────────────────────────

describe("resolveHandle", () => {
  const map = {
    "someone@users.noreply.github.com": "Skords-01",
    "158243933+devin-ai-integration[bot]@users.noreply.github.com": "devin-ai",
  };

  it("returns the mapped handle (case-insensitive email)", () => {
    assert.equal(
      resolveHandle(map, "SomeOne@users.noreply.github.com"),
      "Skords-01",
    );
  });

  it("resolves a personal address stored only as a sha256 hash", () => {
    const hex = createHash("sha256").update("person@example.org").digest("hex");
    const merged = mergeAuthorMap({ emailSha256ToHandle: { [hex]: "owner" } });
    assert.equal(hashedEmailKey("Person@Example.org"), `sha256:${hex}`);
    assert.equal(resolveHandle(merged, "Person@Example.org"), "owner");
  });

  it("falls back to local-part when unmapped", () => {
    assert.equal(resolveHandle(map, "alice@example.com"), "alice");
  });

  it("strips numeric `123+` bot prefix in fallback", () => {
    assert.equal(
      resolveHandle({}, "9999+somebot@users.noreply.github.com"),
      "somebot",
    );
  });

  it("returns null on null/empty email", () => {
    assert.equal(resolveHandle(map, null), null);
    assert.equal(resolveHandle(map, ""), null);
  });
});

// ── author-map.json (public repo, sec-53) ───────────────────────────────────

describe("author-map.json", () => {
  // Репо публічне: відкритим текстом дозволені лише noreply/бот-адреси,
  // особисті пошти зберігаються тільки як sha256 (sec-53).
  const PUBLIC_EMAIL =
    /^[^@\s]+@(users\.noreply\.github\.com|anthropic\.com|cognition\.ai)$/;

  it("keeps only public noreply/bot addresses in plain text", () => {
    const raw = JSON.parse(readFileSync(AUTHOR_MAP_PATH, "utf8"));
    const leaked = Object.keys(raw.emailToHandle || {}).filter(
      (e) => !PUBLIC_EMAIL.test(e.toLowerCase()),
    );
    assert.deepEqual(leaked, []);
  });

  it("contains no email address anywhere outside emailToHandle keys", () => {
    const raw = JSON.parse(readFileSync(AUTHOR_MAP_PATH, "utf8"));
    const rest = JSON.stringify({ ...raw, emailToHandle: undefined });
    assert.doesNotMatch(rest, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
  });

  it("stores hashed keys as 64-char lowercase sha256 hex", () => {
    const raw = JSON.parse(readFileSync(AUTHOR_MAP_PATH, "utf8"));
    for (const k of Object.keys(raw.emailSha256ToHandle || {})) {
      assert.match(k, /^[0-9a-f]{64}$/);
    }
  });

  it("still maps the owner's commits to @Skords-01", () => {
    const merged = loadAuthorMap(AUTHOR_MAP_PATH);
    const owners = Object.entries(merged).filter(
      ([k, v]) => k.startsWith("sha256:") && v === "Skords-01",
    );
    assert.ok(owners.length >= 1);
  });
});

// ── findHeaderLine ───────────────────────────────────────────────────────────

describe("findHeaderLine", () => {
  it("matches the canonical line", () => {
    const md =
      "# Doc\n\n> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.\n\nbody\n";
    const found = findHeaderLine(md);
    assert.ok(found);
    assert.equal(found.lastValidated, "2026-04-27");
    assert.equal(found.handle, "Skords-01");
    assert.equal(found.nextReview, "2026-07-26");
  });

  it("returns null when no canonical line is present", () => {
    const md = "# Doc\n\n> Last reviewed: 2026-04-27. Reviewer: @x\n";
    assert.equal(findHeaderLine(md), null);
  });

  it("ignores headers beyond the line limit", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i}`);
    lines[20] =
      "> **Last validated:** 2026-04-27 by @x. **Next review:** 2026-07-26.";
    assert.equal(findHeaderLine(lines.join("\n")), null);
  });

  it("tolerates trailing whitespace / no period", () => {
    const md =
      "# Doc\n\n> **Last validated:** 2026-04-27 by @x. **Next review:** 2026-07-26\n";
    const found = findHeaderLine(md);
    assert.ok(found);
    assert.equal(found.suffix, "");
  });
});

// ── bumpHeader ───────────────────────────────────────────────────────────────

describe("bumpHeader", () => {
  const baseMd =
    "# Doc\n\n> **Last validated:** 2026-01-01 by @old. **Next review:** 2026-04-01.\n\nbody\n";

  it("bumps date, handle, and next-review", () => {
    const { content, changed } = bumpHeader({
      content: baseMd,
      today: "2026-04-30",
      handle: "new",
      cadenceDays: 90,
    });
    assert.equal(changed, true);
    // Legacy `Last validated:` input migrates to the honest `Last touched:`.
    assert.match(
      content,
      /\*\*Last touched:\*\* 2026-04-30 by @new\. \*\*Next review:\*\* 2026-07-29\./,
    );
  });

  it("falls back to existing handle when handle arg is null", () => {
    const { content, changed } = bumpHeader({
      content: baseMd,
      today: "2026-04-30",
      handle: null,
      cadenceDays: 90,
    });
    assert.equal(changed, true);
    assert.match(content, /by @old\./);
  });

  it("is no-op when date and handle already match", () => {
    const md =
      "# Doc\n\n> **Last validated:** 2026-04-30 by @new. **Next review:** 2026-07-29.\n";
    const { content, changed } = bumpHeader({
      content: md,
      today: "2026-04-30",
      handle: "new",
      cadenceDays: 90,
    });
    assert.equal(changed, false);
    assert.equal(content, md);
  });

  it("updates handle without resetting next-review when same day", () => {
    // Same day, different committer (e.g. co-author / pair commit) — we bump
    // the handle for credit but don't slide the review window.
    const md =
      "# Doc\n\n> **Last validated:** 2026-04-30 by @alice. **Next review:** 2026-07-29.\n";
    const { content, changed } = bumpHeader({
      content: md,
      today: "2026-04-30",
      handle: "bob",
      cadenceDays: 90,
    });
    assert.equal(changed, true);
    assert.match(
      content,
      /\*\*Last touched:\*\* 2026-04-30 by @bob\. \*\*Next review:\*\* 2026-07-29\./,
    );
  });

  it("migrates a legacy label and preserves an already-canonical one", () => {
    const legacy =
      "# Doc\n\n> **Last validated:** 2026-01-01 by @old. **Next review:** 2026-04-01.\n";
    const migrated = bumpHeader({
      content: legacy,
      today: "2026-04-30",
      handle: "new",
      cadenceDays: 90,
    });
    assert.match(migrated.content, /\*\*Last touched:\*\*/);
    assert.doesNotMatch(migrated.content, /\*\*Last validated:\*\*/);

    const canonical =
      "# Doc\n\n> **Last touched:** 2026-01-01 by @old. **Next review:** 2026-04-01.\n";
    const bumped = bumpHeader({
      content: canonical,
      today: "2026-04-30",
      handle: "new",
      cadenceDays: 90,
    });
    assert.equal(bumped.changed, true);
    assert.match(bumped.content, /\*\*Last touched:\*\* 2026-04-30/);
  });

  it("returns unchanged when no header is found", () => {
    const md = "# Doc\n\nNo header here.\n";
    const { content, changed } = bumpHeader({
      content: md,
      today: "2026-04-30",
      handle: "x",
      cadenceDays: 90,
    });
    assert.equal(changed, false);
    assert.equal(content, md);
  });

  it("respects cadenceDays per file (60 / 180 / 365)", () => {
    for (const cadence of [60, 180, 365]) {
      const { content } = bumpHeader({
        content: baseMd,
        today: "2026-04-30",
        handle: "x",
        cadenceDays: cadence,
      });
      const expected = addDays("2026-04-30", cadence);
      assert.match(
        content,
        new RegExp(`\\*\\*Next review:\\*\\* ${expected}\\.`),
      );
    }
  });
});

// ── bumpFiles (in-memory side-effect via fakeFs) ─────────────────────────────

describe("bumpFiles", () => {
  // Skipped here — `bumpFiles` reads / writes via `node:fs` directly, so it's
  // exercised by the integration test `bumpFiles-integration.test.mjs` which
  // uses a tmpdir. Keeping the export pure for the unit-tested helpers above.
  it("is exported", () => {
    assert.equal(typeof bumpFiles, "function");
  });
});

// ── exclude-globs integration via DEFAULT_CONFIG ─────────────────────────────

describe("DEFAULT_CONFIG (sanity)", () => {
  it("excludes ADR by default", () => {
    assert.ok(DEFAULT_CONFIG.excludeGlobs.includes("docs/governance/adr/**"));
  });
});
