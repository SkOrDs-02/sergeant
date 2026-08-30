import { describe, expect, it, vi } from "vitest";
import { tokenize } from "@sergeant/insights";
import { SETTINGS_INDEX, searchSettings } from "./searchSettings";

/**
 * L-13 (audit 2026-08-08): `SETTINGS_INDEX` used to be a hand-copied
 * duplicate of `HubSettingsPage`'s section list and had drifted — it
 * carried two ids with no matching Settings section ("general",
 * "assistant") and was missing four real ones ("plan", "privacy",
 * "feedback", "capabilities"), making those sections unreachable from the
 * ⌘K palette. Both now derive from `SETTINGS_SECTIONS_CATALOG`.
 *
 * Audit finding #7 (2026-08-08): the three former parity tests here
 * ("every SETTINGS_INDEX id exists in the catalog", "every catalog id is
 * searchable", "id sets match exactly") checked an invariant that can no
 * longer break BY CONSTRUCTION — `SETTINGS_INDEX` is a straight `.map()`
 * over the catalog, so `Array.prototype.map` guarantees 1:1 id parity on
 * its own. They were pinning a tautology, not a regression. Removed; the
 * two tests below check things that actually depend on catalog CONTENT
 * (which can still drift) rather than the `.map()` shape.
 */
describe("SETTINGS_INDEX ↔ SETTINGS_SECTIONS_CATALOG parity", () => {
  it("previously-orphaned ids ('general', 'assistant') are gone", () => {
    // Locks in the specific regression: these two ids were hardcoded into
    // the old SETTINGS_INDEX and never matched a real HubSettingsPage
    // section (the standalone «Загальні» section merged into
    // «Можливості»/capabilities on 2026-08-03; «assistant» never existed
    // as a Settings section — the real id is «capabilities»). Meaningful
    // even post-L-13: it fails if the CATALOG itself ever grows one of
    // these ghost ids back, not just if the old duplicate array does.
    const ids = SETTINGS_INDEX.map((s) => s.id);
    expect(ids).not.toContain("general");
    expect(ids).not.toContain("assistant");
  });

  // Audit finding #7 (2026-08-08): the test name used to promise four
  // sections ('plan', 'privacy', 'feedback', 'capabilities') but the body
  // only ever queried 'plan'. Exercise all four. `tokenize()` (not the raw
  // query string) — `searchSettings(tokens)` documents its contract as
  // taking already-normalized tokens (the production caller, `performSearch`,
  // always tokenizes first); a raw Cyrillic query containing "й" (e.g.
  // "конфіденційність") would otherwise fail to match its own NFKD-folded
  // haystack (`normalize()` decomposes "й" → "и" + combining breve, which
  // only the haystack side gets without `tokenize()` on the query too).
  it("previously-missing sections ('plan', 'privacy', 'feedback', 'capabilities') are now searchable", () => {
    const casesByQuery: Record<string, string> = {
      план: "plan",
      конфіденційність: "privacy",
      фідбек: "feedback",
      можливості: "capabilities",
    };
    for (const [query, sectionId] of Object.entries(casesByQuery)) {
      const results = searchSettings(tokenize(query));
      expect(
        results.some(
          (r) =>
            r.target.kind === "settings" && r.target.sectionId === sectionId,
        ),
      ).toBe(true);
    }
  });
});

describe("SETTINGS_PRESENTATION fallback (audit finding #10)", () => {
  it("does not leak the raw keyword-soup subtitle for a section with a genuinely empty description", async () => {
    // `SETTINGS_PRESENTATION` in `searchSettings.ts` falls back to
    // `{ description: "", icon: "settings" }` for any catalog id it has
    // no entry for. Mock the catalog with exactly such an id (no real
    // catalog entry hits this path today — all 14 have a presentation
    // record) and re-import `searchSettings` fresh so it builds
    // `SETTINGS_INDEX` from the mocked catalog instead of the real one.
    vi.resetModules();
    const mysterySection = {
      id: "mystery-no-presentation",
      title: "Загадкова секція",
      keywords: "загадкова mystery",
    };
    vi.doMock("../settingsSectionsCatalog", () => ({
      SETTINGS_SECTIONS_CATALOG: [mysterySection],
      // `searchSettings` builds its index from the beta-filtered list; the
      // mystery section is not beta-hidden, so both views are identical here.
      VISIBLE_SETTINGS_SECTIONS: [mysterySection],
    }));
    const { searchSettings: searchWithMockedCatalog } =
      await import("./searchSettings");

    const results = searchWithMockedCatalog(["загадкова"]);

    expect(results).toHaveLength(1);
    // Before the fix (`||` instead of `??`), an empty-but-FOUND
    // description ("" is falsy) fell all the way back to the raw
    // pre-strip subtitle (`"" · "загадкова mystery"`) — a leading " · "
    // followed by the section's own keywords, exactly the "заплутана
    // мішанина тегів" that post-processing step exists to strip.
    expect(results[0]?.subtitle).toBe("");

    vi.doUnmock("../settingsSectionsCatalog");
    vi.resetModules();
  });
});
