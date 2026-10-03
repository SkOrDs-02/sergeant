import { describe, expect, it } from "vitest";
import { tokenize } from "@sergeant/insights";
import { PROFILE_INDEX, searchProfile } from "./searchProfile";

/**
 * PR-S5 (аудит 2026-09-13 хвиля 5): «пароль», «сесії», «PIN», «вага»,
 * «вийти», «видалити акаунт» давали нуль результатів у глобальному
 * пошуку — Профіль не мав власного джерела. `tokenize()` (не сирий
 * запит) — `searchProfile(tokens)` документує контракт як приймаючий
 * уже нормалізовані токени, той самий контракт, що й `searchSettings`.
 */
describe("searchProfile", () => {
  it("finds every entry the audit named as unreachable", () => {
    const casesByQuery: Record<string, string> = {
      пароль: "password",
      сесії: "sessions",
      pin: "applock",
      вага: "biometrics",
      вийти: "logout",
      "видалити акаунт": "danger",
    };
    for (const [query, id] of Object.entries(casesByQuery)) {
      const results = searchProfile(tokenize(query));
      expect(
        results.some(
          (r) => r.target.kind === "profile" && r.id === `profile_${id}`,
        ),
      ).toBe(true);
    }
  });

  it("routes every hit to the profile tab target, without a section id", () => {
    const results = searchProfile(tokenize("пароль"));
    expect(results[0]?.target).toEqual({ kind: "profile" });
  });

  it("strips the keyword-soup subtitle after scoring, like SETTINGS_INDEX", () => {
    const results = searchProfile(tokenize("вага"));
    const hit = results.find((r) => r.id === "profile_biometrics");
    expect(hit?.subtitle).toBe(
      PROFILE_INDEX.find((e) => e.id === "biometrics")?.description,
    );
    expect(hit?.subtitle).not.toContain("·");
  });

  it("caps at 5 results, mirroring the settings source", () => {
    // Empty tokens score every entry 0 (`scoreMatch` matches vacuously),
    // so all 7 catalog entries would qualify — the cap must still hold.
    expect(PROFILE_INDEX.length).toBeGreaterThan(5);
    expect(searchProfile([])).toHaveLength(5);
  });
});
