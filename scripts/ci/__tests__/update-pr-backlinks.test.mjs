/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Гейт проти повернення тихої дірки в Hard Rule #26: список файлів PR
 * мусить бути повним, інакше скрипт не має права вирішувати, що
 * канонічних доків «не торкались».
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertCompleteFileList,
  CANONICAL_DOC_ROOTS,
  entryKey,
  examinedKey,
  fetchPRMetadata,
  githubSource,
  hasNextLink,
  parseArgs,
  readGitHubToken,
} from "../update-pr-backlinks.mjs";

test("повний список проходить мовчки", () => {
  assert.doesNotThrow(() => assertCompleteFileList(956, 956, 1081));
  assert.doesNotThrow(() => assertCompleteFileList(0, 0, 1));
});

test("обрізаний список — помилка, а не тихий нуль", () => {
  assert.throws(
    () => assertCompleteFileList(100, 956, 1081),
    /fetched 100 changed file\(s\) but the API reports 956/,
  );
});

test("у тексті помилки є номер PR і згадка про стелю API", () => {
  try {
    assertCompleteFileList(3000, 4200, 777);
    assert.fail("мало кинути");
  } catch (err) {
    assert.match(err.message, /#777/);
    assert.match(err.message, /3000/);
  }
});

test("невідома кількість (поле відсутнє) не валить прогін", () => {
  // `changedFiles` може не приїхати зі старішого gh — тоді звіряти нічого,
  // і гейт не має падати на самій лише відсутності поля.
  assert.doesNotThrow(() => assertCompleteFileList(5, undefined, 1));
  assert.doesNotThrow(() => assertCompleteFileList(5, null, 1));
});

/**
 * Ключ запису. Номер PR сам по собі НЕ унікальний: Bitbucket почав нумерацію
 * заново з одиниці, а в реєстрі вже лежать номери 29..3665 із трьох GitHub-репо.
 * Коли Bitbucket дійде до #29, ключ по самому номеру почав би вважати два різні
 * PR одним і мовчки перезаписав би старіший запис.
 */
test("ключ розрізняє однакові номери з різних хостів", () => {
  const bb = entryKey({
    number: 29,
    host: "bitbucket",
    repo: "skords01/sergeant",
  });
  const gh = entryKey({ number: 29, repo: "zaebal-beep/sergeant" });
  assert.notEqual(bb, gh);
});

test("відсутній host читається як github, відсутній repo — як легасі", () => {
  assert.equal(
    entryKey({ number: 7 }),
    entryKey({ number: 7, host: "github" }),
  );
  assert.match(entryKey({ number: 7 }), /^github:/);
});

test("той самий PR дає той самий ключ", () => {
  const e = { number: 6, host: "bitbucket", repo: "skords01/sergeant" };
  assert.equal(entryKey(e), entryKey({ ...e, title: "інший заголовок" }));
});

/**
 * Третій можливий збій того самого реєстру — і єдиний, який ще не стався.
 *
 * Список канонічних тек живе у ДВОХ місцях: `CANONICAL_DOC_ROOTS` тут і
 * `paths:` у `.github/workflows/pr-backlinks.yml`. Вони мусять збігатися, бо
 * роблять різні половини однієї роботи: `paths:` вирішує, чи ЗАПУСТИТИ
 * воркфлоу, а `CANONICAL_DOC_ROOTS` — що саме записати. Розійдуться — і
 * реєстр замовкне так само тихо, як двічі до того:
 *
 *   • тека є в `paths:`, немає в коренях → воркфлоу біжить, `upsertPR`
 *     виходить на порожньому `touchedDocs`, запису немає;
 *   • тека є в коренях, немає в `paths:` → воркфлоу взагалі не стартує.
 *
 * В обох випадках жодного червоного сигналу: CI зелений, ledger просто не
 * росте. Саме так Hard Rule #26 не виконувалось на цьому форку ЖОДНОГО разу.
 */
function scriptRoots() {
  return CANONICAL_DOC_ROOTS.map((r) => r.rootDir).sort();
}

test("paths: у воркфлоу і CANONICAL_DOC_ROOTS не розходяться", () => {
  const yml = readFileSync(
    new URL("../../../.github/workflows/pr-backlinks.yml", import.meta.url),
    "utf8",
  );
  // Беремо рівно блок `paths:` під `pull_request_target`, не весь файл:
  // слово `paths` трапляється і в коментарях.
  const block = /\n {4}paths:\n((?: {6}- ".*"\n)+)/.exec(yml);
  assert.ok(block, "не знайшов блок `paths:` у воркфлоу");
  const fromWorkflow = [...block[1].matchAll(/- "(.+?)\/\*\*"/g)]
    .map((m) => m[1])
    .sort();
  const fromScript = scriptRoots();
  assert.deepEqual(
    fromWorkflow,
    fromScript,
    "додав теку в одне місце — додай і в друге, інакше ledger замовкне мовчки",
  );
});

/**
 * Четверта копія того самого списку — і найлегша для мовчазного дрейфу, бо
 * вона в JSON, а JSON ніхто не читає очима.
 *
 * `hard-rules.json` — машиночитаний реєстр Hard Rules, і його `scope` для
 * правила #26 перелічує ті самі теки, що й скрипт із воркфлоу. Розійдеться —
 * і правило почне ОПИСУВАТИ не те, що механізм РОБИТЬ: у реєстрі одне, в
 * гейті інше, а розбіжність помітна лише тому, хто відкриє обидва файли.
 *
 * (П'ята копія — прозова секція `## Scope` у тілі правила — навмисно поза
 * цим тестом: вона людська, з винятками в дужках і поясненнями, і зводити її
 * до масиву означало б або збіднити текст, або написати крихкий парсер.
 * Її тримає 3-way sync `pnpm lint:hard-rules-registry`.)
 */
test("scope у hard-rules.json збігається з CANONICAL_DOC_ROOTS", () => {
  const registry = JSON.parse(
    readFileSync(
      new URL(
        "../../../docs/governance/governance/hard-rules.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const rules = Array.isArray(registry) ? registry : registry.rules;
  const rule26 = rules.find((r) => r.id === 26);
  assert.ok(rule26, "правила #26 немає в реєстрі");
  const fromRegistry = rule26.scope
    .map((g) => g.replace(/\/\*\.md$/, ""))
    .sort();
  assert.deepEqual(
    fromRegistry,
    scriptRoots(),
    "скоуп правила #26 розійшовся з тим, що насправді сканує гейт",
  );
});

/**
 * GitHub-фетчер (з 2026-10-08). Мережі в тестах немає: `fetch` підмінено
 * таблицею «шлях → відповідь», і будь-який непередбачений запит валить тест,
 * а не йде в інтернет.
 */
const SLUG = "SkOrDs-02/sergeant";

function mockFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const path = url.replace(`https://api.github.com/repos/${SLUG}/`, "");
    if (!(path in routes)) throw new Error(`неочікуваний запит: ${url}`);
    const r = routes[path];
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => r.body,
      headers: { get: (h) => (h.toLowerCase() === "link" ? r.link : null) },
    };
  };
  return { fetchImpl, calls };
}

const NEXT = '<https://api.github.com/x?page=2>; rel="next"';
const ADR = "docs/governance/adr/0102-github-actions-ci-and-autodeploy.md";
const LIST = "pulls?state=closed&sort=updated&direction=desc&per_page=100";

const PR_1300 = {
  number: 1300,
  title: "docs(docs): оновити ADR",
  state: "closed",
  merged_at: "2026-10-02T10:11:12Z",
  merge_commit_sha: "abc123def4567890",
  html_url: `https://github.com/${SLUG}/pull/1300`,
  user: { login: "SkOrDs-02" },
  changed_files: 3,
};

test("githubSource.getPR: метадані, токен у заголовку, файли з усіх сторінок", async () => {
  const { fetchImpl, calls } = mockFetch({
    "pulls/1300": { body: PR_1300 },
    "pulls/1300/files?per_page=100&page=1": {
      body: [{ filename: ADR }, { filename: "apps/web/src/main.tsx" }],
      link: NEXT,
    },
    "pulls/1300/files?per_page=100&page=2": {
      body: [
        {
          filename: "docs/start/instructions/new.md",
          previous_filename: "docs/start/instructions/old.md",
        },
      ],
    },
  });
  const src = githubSource({ slug: SLUG, token: "t0k", fetchImpl });
  const pr = await src.getPR(1300);
  assert.deepEqual(pr, {
    number: 1300,
    title: "docs(docs): оновити ADR",
    merged_at: "2026-10-02T10:11:12Z",
    author: "@SkOrDs-02",
    merge_commit: "abc123def4567890",
    url: `https://github.com/${SLUG}/pull/1300`,
    paths: [ADR, "apps/web/src/main.tsx", "docs/start/instructions/new.md"],
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].init.headers.Authorization, "Bearer t0k");
});

test("githubSource.getPR: без токена заголовка Authorization немає", async () => {
  const { fetchImpl, calls } = mockFetch({
    "pulls/1300": { body: { ...PR_1300, changed_files: 0 } },
    "pulls/1300/files?per_page=100&page=1": { body: [] },
  });
  await githubSource({ slug: SLUG, token: null, fetchImpl }).getPR(1300);
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test("githubSource.getPR: обрізаний список файлів — помилка, а не тихий нуль", async () => {
  const { fetchImpl } = mockFetch({
    "pulls/1300": { body: { ...PR_1300, changed_files: 3500 } },
    "pulls/1300/files?per_page=100&page=1": { body: [{ filename: ADR }] },
  });
  await assert.rejects(
    githubSource({ slug: SLUG, token: "t", fetchImpl }).getPR(1300),
    /fetched 1 changed file\(s\) but the API reports 3500/,
  );
});

test("githubSource.getPR: незмерджений PR і HTTP-помилка падають уголос", async () => {
  const unmerged = mockFetch({
    "pulls/7": { body: { ...PR_1300, number: 7, merged_at: null } },
  });
  await assert.rejects(
    githubSource({
      slug: SLUG,
      token: "t",
      fetchImpl: unmerged.fetchImpl,
    }).getPR(7),
    /не змерджений/,
  );
  const denied = mockFetch({ "pulls/8": { status: 403, body: {} } });
  await assert.rejects(
    githubSource({
      slug: SLUG,
      token: "t",
      fetchImpl: denied.fetchImpl,
    }).getPR(8),
    /GitHub API 403 на pulls\/8/,
  );
});

test("fetchPRMetadata з GitHub дає запис реєстру тієї ж форми, що й Bitbucket", async () => {
  const { fetchImpl } = mockFetch({
    "pulls/1300": { body: PR_1300 },
    "pulls/1300/files?per_page=100&page=1": {
      body: [
        { filename: ADR },
        { filename: "docs/governance/adr/README.md" },
        { filename: "apps/web/src/main.tsx" },
      ],
    },
  });
  const entry = await fetchPRMetadata(
    1300,
    githubSource({ slug: SLUG, token: "t", fetchImpl }),
  );
  assert.deepEqual(entry, {
    number: 1300,
    title: "docs(docs): оновити ADR",
    merged_at: "2026-10-02T10:11:12Z",
    author: "@SkOrDs-02",
    host: "github",
    repo: SLUG,
    touchedDocs: [ADR],
  });
});

test("githubSource.listMerged: лише змерджені, зупинка на --since", async () => {
  const pr = (number, merged_at, updated_at) => ({
    number,
    merged_at,
    updated_at,
  });
  const { fetchImpl, calls } = mockFetch({
    [`${LIST}&page=1`]: {
      body: [
        pr(1400, "2026-10-07T09:00:00.000Z", "2026-10-07T09:00:00Z"),
        pr(1399, null, "2026-10-06T09:00:00Z"),
        // Оновлений після --since, але змерджений до нього — відсіюється.
        pr(1100, "2026-09-12T09:00:00Z", "2026-10-05T09:00:00Z"),
      ],
      link: NEXT,
    },
    [`${LIST}&page=2`]: {
      body: [
        pr(1250, "2026-09-30T20:00:00Z", "2026-09-30T20:00:00Z"),
        pr(1200, "2026-09-29T08:00:00Z", "2026-09-29T08:00:00Z"),
      ],
      link: NEXT,
    },
  });
  const src = githubSource({ slug: SLUG, token: "t", fetchImpl });
  const { prs, capped } = await src.listMerged(200, "2026-09-30");
  assert.deepEqual(prs, [
    { number: 1400, merged_at: "2026-10-07T09:00:00Z" },
    { number: 1250, merged_at: "2026-09-30T20:00:00Z" },
  ]);
  assert.equal(capped, false);
  // Третьої сторінки не просили: #1200 оновлено раніше за --since.
  assert.equal(calls.length, 2);
});

test("githubSource.listMerged: стеля скану позначається як capped", async () => {
  const body = [10, 9, 8].map((number) => ({
    number,
    merged_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  }));
  const { fetchImpl } = mockFetch({
    [`${LIST}&page=1`]: { body, link: NEXT },
  });
  const { prs, capped } = await githubSource({
    slug: SLUG,
    token: "t",
    fetchImpl,
  }).listMerged(2);
  assert.equal(prs.length, 2);
  assert.equal(capped, true);
});

test("hasNextLink і readGitHubToken", () => {
  assert.equal(hasNextLink(NEXT), true);
  assert.equal(hasNextLink('<https://x>; rel="last"'), false);
  assert.equal(hasNextLink(null), false);
  assert.equal(readGitHubToken({ GITHUB_TOKEN: "a", GH_TOKEN: "b" }), "a");
  assert.equal(readGitHubToken({ GH_TOKEN: "b" }), "b");
  assert.equal(readGitHubToken({}), null);
});

test("examined групується за репо для GitHub і лишається `bitbucket` для архіву", () => {
  assert.equal(examinedKey("bitbucket", "skords01/sergeant"), "bitbucket");
  assert.equal(examinedKey("github", SLUG), `github:${SLUG}`);
  assert.notEqual(
    examinedKey("github", SLUG),
    examinedKey("github", "zaebal-beep/sergeant"),
  );
});

test("parseArgs: типовий хост github, --host і --since валідуються", () => {
  assert.deepEqual(parseArgs(["--sync"]), {
    mode: "sync",
    prNumber: null,
    host: "github",
    since: null,
  });
  const a = parseArgs([
    "--sync",
    "--host",
    "bitbucket",
    "--since",
    "2026-09-30",
  ]);
  assert.equal(a.host, "bitbucket");
  assert.equal(a.since, "2026-09-30");
  assert.throws(() => parseArgs(["--host", "gitlab"]), /--host/);
  assert.throws(() => parseArgs(["--since", "30.09.2026"]), /--since/);
});
