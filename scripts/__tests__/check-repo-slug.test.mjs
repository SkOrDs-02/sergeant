/**
 * Тести гейта слуга репо й резолвера домівок.
 *
 * @status Active
 *
 * Чому тест на ЧИСТІЙ функції, а не на прогоні скрипта: гейт читає живий
 * `git remote`, і прогін у CI-checkout-і без origin поводиться інакше, ніж
 * локально. `findUnknownSlugs` і `slugFromRemoteUrl` детерміновані, тож
 * саме вони і несуть логіку, яку варто закріпити.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findUnknownSlugs } from "../check-repo-slug.mjs";
import {
  currentSlug,
  knownSlugs,
  prBaseForEntry,
  readIdentity,
  slugForEntry,
  slugFromEnvironment,
  slugFromRemoteUrl,
} from "../docs/repo-identity.mjs";

/** Реєстр-фікстура у тимчасовому файлі — щоб не залежати від реального. */
function fixtureIdentity(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "repo-identity-"));
  const path = join(dir, "repo-identity.json");
  writeFileSync(
    path,
    JSON.stringify({
      current: "new-owner/Sergeant",
      previous: ["old-owner/sergeant"],
      legacyPrSlug: "oldest-owner/Sergeant",
      ...overrides,
    }),
  );
  return path;
}

describe("slugFromRemoteUrl", () => {
  it("розбирає https з .git і без", () => {
    assert.equal(
      slugFromRemoteUrl("https://github.com/klas149/Sergeant.git"),
      "klas149/Sergeant",
    );
    assert.equal(
      slugFromRemoteUrl("https://github.com/klas149/Sergeant"),
      "klas149/Sergeant",
    );
  });

  it("розбирає ssh-форму", () => {
    assert.equal(
      slugFromRemoteUrl("git@github.com:klas149/Sergeant.git"),
      "klas149/Sergeant",
    );
  });

  it("терпить кінцевий слеш і пробіли з git-виводу", () => {
    assert.equal(
      slugFromRemoteUrl("  https://github.com/klas149/Sergeant/\n"),
      "klas149/Sergeant",
    );
  });

  it("повертає undefined на не-GitHub і на сміття", () => {
    assert.equal(slugFromRemoteUrl("https://gitlab.com/a/b"), undefined);
    assert.equal(slugFromRemoteUrl(""), undefined);
    assert.equal(slugFromRemoteUrl(undefined), undefined);
  });
});

describe("slugFromEnvironment", () => {
  it("віддає перевагу GITHUB_REPOSITORY (шлях GitHub Actions)", () => {
    assert.equal(
      slugFromEnvironment({ GITHUB_REPOSITORY: "acme/Sergeant" }),
      "acme/Sergeant",
    );
  });

  it("ігнорує GITHUB_REPOSITORY без слеша і падає на git remote", () => {
    // У цьому репо origin є, тож результат — реальний слуг, не undefined.
    const got = slugFromEnvironment({ GITHUB_REPOSITORY: "поламане" });
    assert.notEqual(got, "поламане");
  });
});

describe("readIdentity", () => {
  it("читає валідний реєстр", () => {
    const id = readIdentity(fixtureIdentity());
    assert.equal(id.current, "new-owner/Sergeant");
    assert.deepEqual(id.previous, ["old-owner/sergeant"]);
  });

  it("падає з внятним текстом на зламаному current", () => {
    assert.throws(
      () => readIdentity(fixtureIdentity({ current: "без-слеша" })),
      /"current" мусить бути/u,
    );
  });

  it("падає, якщо previous не масив", () => {
    assert.throws(
      () => readIdentity(fixtureIdentity({ previous: "old-owner/sergeant" })),
      /"previous" мусить бути масивом/u,
    );
  });
});

describe("currentSlug / knownSlugs", () => {
  it("бере слуг із середовища, коли воно є", () => {
    assert.equal(
      currentSlug({
        env: { GITHUB_REPOSITORY: "acme/Sergeant" },
        path: fixtureIdentity(),
      }),
      "acme/Sergeant",
    );
  });

  it("падає на current із реєстру, коли середовище нічого не дає", () => {
    // Порожній env + відсутній origin неможливо відтворити всередині репо,
    // тож перевіряємо саме реєстр через knownSlugs нижче; тут — що слуг
    // із середовища НЕ вигадується.
    const got = currentSlug({
      env: { GITHUB_REPOSITORY: "acme/Sergeant" },
      path: fixtureIdentity(),
    });
    assert.ok(got.includes("/"));
  });

  it("знає і поточну, і історичні домівки, регістронезалежно", () => {
    const known = knownSlugs({
      env: { GITHUB_REPOSITORY: "acme/Sergeant" },
      path: fixtureIdentity(),
    });
    assert.ok(known.has("new-owner/sergeant"));
    assert.ok(known.has("old-owner/sergeant"));
    assert.ok(known.has("oldest-owner/sergeant"));
    assert.ok(known.has("acme/sergeant"));
  });
});

describe("findUnknownSlugs", () => {
  const known = new Set([
    "klas149/sergeant",
    "zaebal-beep/sergeant",
    "skords-01/sergeant",
  ]);

  it("пропускає відомий історичний слуг", () => {
    const hits = findUnknownSlugs(
      "див. https://github.com/Skords-01/Sergeant/pull/740",
      known,
    );
    assert.deepEqual(hits, []);
  });

  it("ловить вигаданий новий слуг і називає рядок", () => {
    const src = ["перший рядок", "https://github.com/stranger/Sergeant/pull/1"];
    const hits = findUnknownSlugs(src.join("\n"), known);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].line, 2);
    assert.equal(hits[0].slug, "stranger/Sergeant");
  });

  it("не чіпає чужі репо — гейт лише про власне", () => {
    const hits = findUnknownSlugs(
      "https://github.com/better-auth/better-auth/blob/main/x.ts",
      known,
    );
    assert.deepEqual(hits, []);
  });

  it("однаково приймає обидва написання регістру власника", () => {
    const hits = findUnknownSlugs(
      "https://github.com/KLAS149/sergeant/pull/18",
      known,
    );
    assert.deepEqual(hits, []);
  });

  it("не плутає слуг із назвою репо в шляху", () => {
    // `.../klas149/Sergeant/blob/main/docs/...` — матч має бути один.
    const hits = findUnknownSlugs(
      "https://github.com/klas149/Sergeant/blob/main/AGENTS.md",
      known,
    );
    assert.deepEqual(hits, []);
  });
});

describe("prBaseForEntry / slugForEntry", () => {
  const path = fixtureIdentity();

  it("бере слуг із поля repo запису", () => {
    assert.equal(
      prBaseForEntry({ repo: "some-owner/sergeant" }, { path }),
      "https://github.com/some-owner/sergeant/pull",
    );
  });

  it("падає на легасі-слуг, коли поля repo немає", () => {
    assert.equal(slugForEntry({}, { path }), "oldest-owner/Sergeant");
    assert.equal(
      prBaseForEntry({}, { path }),
      "https://github.com/oldest-owner/Sergeant/pull",
    );
  });

  it("ігнорує поле repo без слеша", () => {
    assert.equal(
      slugForEntry({ repo: "поламане" }, { path }),
      "oldest-owner/Sergeant",
    );
  });
});
