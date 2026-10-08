#!/usr/bin/env node
// scripts/ci/update-pr-backlinks.mjs
//
// Update `docs/governance/pr-ledger/index.json` and the in-doc PR-BACKLINKS block
// at the end of each canonical doc (ADR / initiative / playbook / hard-rule).
//
// AI-CONTEXT: до 2026-09-23 писача запускав `.github/workflows/pr-backlinks.yml`
// після кожного мержу, а метадані брались через `gh pr view`. Переїзд на
// Bitbucket забрав обидві половини одразу: воркфлоу не виконується, `gh` з
// Bitbucket не працює. Реєстр тихо став на 2026-09-17, і жоден гейт цього не
// показав, бо `--check` звіряє лише реєстр ↔ блоки ↔ схему, тобто ФОРМУ, а не
// ПОВНОТУ (аудит DG-3). 2026-09-23..29 джерелом був Bitbucket API.
//
// З 2026-09-29 код знову на GitHub (ADR-0101), і з 2026-10-08 основне
// джерело метаданих — GitHub REST API через `fetch` (токен `GITHUB_TOKEN` /
// `GH_TOKEN` із середовища). Тригер — знову `pr-backlinks.yml` після мержу,
// за змінною репо `PR_LEDGER_ON_GITHUB`. Bitbucket лишається архівним
// джерелом за `--host bitbucket`.
//
// Modes:
//   --sync                  — дочитати всі змерджені PR, яких ще немає в
//                             реєстрі, і перебудувати блоки. Бекфіл:
//                             `--sync --since YYYY-MM-DD`.
//   --pr <NUMBER>           — те саме для одного PR (так кличе воркфлоу).
//   --stale                 — нічого не пише: рахує, скількох змерджених PR
//                             бракує в реєстрі. Exit 0 завжди, число у stdout.
//   --rebuild-blocks        — перерендерити блоки з поточного реєстру
//                             (без мережі). Після ручної правки реєстру.
//   --check                 — як `--rebuild-blocks`, але нічого не пише;
//                             exit 1 на розбіжності блоків або порушенні
//                             схеми. Це крок `pnpm lint`.
//
// Опції мережевих режимів: `--host github|bitbucket` (типово github),
// `--since YYYY-MM-DD` (лише PR, змерджені від дати; для --sync/--stale).
//
// Phase 5 of Initiative 0014. See ADR-0061 for the storage strategy.

import {
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  currentSlug as currentRepoSlug,
  prBaseForEntry as prBaseFor,
} from "../docs/repo-identity.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

const LEDGER_PATH = resolve(REPO_ROOT, "docs/governance/pr-ledger/index.json");
const SCHEMA_VERSION = 1;
const TOP_N_IN_DOC = 5;

// Стеля скану змерджених PR за один прогін. Реально їх дванадцять, тож запас
// великий; сама стеля існує, щоб `--sync` не перетворився на нескінченний обхід
// історії, якщо реєстр колись обнулять. Спрацювання не мовчазне: викликач
// друкує, що скан обрізано.
const SYNC_LIMIT = 200;

const BLOCK_START = "<!-- AUTO-GENERATED: PR-BACKLINKS-START -->";
const BLOCK_END = "<!-- AUTO-GENERATED: PR-BACKLINKS-END -->";

// Marker detection regexes anchor to line boundaries so the literal
// strings can safely appear inside backticks, code fences, or prose
// (e.g. inside ADR-0061 itself, which documents the format). Only a
// marker that sits on its own line — optionally indented — counts.
const RE_BLOCK_START =
  /^[ \t]*<!-- AUTO-GENERATED: PR-BACKLINKS-START -->[ \t]*$/m;
const RE_BLOCK_END = /^[ \t]*<!-- AUTO-GENERATED: PR-BACKLINKS-END -->[ \t]*$/m;

// База посилання на PR.
//
// `legacyPrSlug` у реєстрі — старе репо `Skords-01/Sergeant`, звідки прийшли 20 із 37
// записів леджера. Їхні номери (2876, 3611, …) у поточному репо не існують,
// тож переписати всі посилання на новий хост означало б наробити 544 битих
// лінки замість робочих.
//
// `CURRENT_PR_BASE` — теперішнє репо. Використовується для записів, які явно
// несуть `"repo": "SkOrDs-02/sergeant"`; без поля запис вважається легасі.
// Поле опційне саме тому: так 37 наявних записів лишаються байт-у-байт, а
// нові перестають генерувати мертве посилання.
//
// Знайдено при ручному записі PR #1134 (аудит 2026-09-13): згенерований
// блок у свіжому ADR-0094 вів на `Skords-01/Sergeant/pull/1134` — сторінку,
// якої немає. Автоматика цього не показала б, бо вона не відкриває PR-и з
// 2026-08-28 (див. § Backfill у правилі 26).
//
// 2026-09-17: репо переїхало втретє (`zaebal-beep/Sergeant`), і зашитий
// «поточний» слуг знову дав мертві лінки — цього разу на 22 дозаповнені
// записи. Тому база тепер береться з самого поля `repo` (яке репо записано,
// на те й лінк), а зашитим лишається лише легасі-фолбек для записів без поля.
//
// 2026-09-19: переїзд ЧЕТВЕРТИЙ (`klas149/Sergeant`), і стало видно, що
// зашитий легасі-слуг тут — одна з ТРЬОХ незалежних копій тієї самої
// величини (друга — у `scripts/docs/generate-status.mjs`, третя — поле
// `repo` кожного запису леджера). Копії розійшлись, і 93 посилання стали
// мертвими. Слуг тепер живе в `scripts/docs/repo-identity.mjs` + реєстрі
// `docs/governance/governance/repo-identity.json`, а розбіжність реєстру з
// фактичним `origin` ловить `pnpm lint:repo-slug`.

// ── Canonical doc whitelist ─────────────────────────────────────────────────

/**
 * Path patterns that should receive in-doc PR-backlink blocks. Each entry
 * is { rootDir, recursive, excludes? }. Files matching `excludes`
 * (filename match against basename) are skipped.
 */
export const CANONICAL_DOC_ROOTS = [
  {
    rootDir: "docs/governance/adr",
    recursive: false,
    excludes: ["TEMPLATE.md", "README.md"],
  },
  {
    rootDir: "docs/work/specs/initiatives",
    recursive: false,
    excludes: ["README.md", "follow-ups.md"],
  },
  {
    rootDir: "docs/start/instructions",
    recursive: false,
    excludes: ["README.md", "INDEX.md"],
    excludePrefix: "_",
  },
  {
    rootDir: "docs/governance/governance/rules",
    recursive: false,
    excludes: ["README.md"],
  },
  // Додано 2026-09-15. Первісне рішення виключало аудити як «snapshot-natured»;
  // практика його спростувала — реєстр наскрізного огляду правився шість разів
  // за день, і чотири рази розходився з кодом. Розбір — у тілі правила
  // `docs/governance/governance/rules/26-pr-ledger-update-on-merge.md`.
  {
    rootDir: "docs/work/specs/audits",
    recursive: false,
    excludes: ["README.md"],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function relPath(abs) {
  return relative(REPO_ROOT, abs).split(sep).join("/");
}

function readSafe(abs) {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return "";
  }
}

function readJSON(abs) {
  try {
    return JSON.parse(readSafe(abs));
  } catch {
    return null;
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function listCanonicalDocs() {
  const out = [];
  for (const cfg of CANONICAL_DOC_ROOTS) {
    const rootAbs = resolve(REPO_ROOT, cfg.rootDir);
    let entries;
    try {
      entries = readdirSync(rootAbs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (!cfg.recursive) continue;
        if (ent.name === "archive") continue;
      }
      if (!ent.isFile()) continue;
      if (!ent.name.endsWith(".md")) continue;
      if (cfg.excludes?.includes(ent.name)) continue;
      if (cfg.excludePrefix && ent.name.startsWith(cfg.excludePrefix)) continue;
      out.push(join(rootAbs, ent.name));
    }
  }
  return out.sort();
}

function isCanonicalDocPath(repoRelPath) {
  for (const cfg of CANONICAL_DOC_ROOTS) {
    const prefix = cfg.rootDir.endsWith("/") ? cfg.rootDir : cfg.rootDir + "/";
    if (!repoRelPath.startsWith(prefix)) continue;
    const remainder = repoRelPath.slice(prefix.length);
    if (remainder.includes("/")) continue; // sub-directories not allowed
    const base = remainder;
    if (cfg.excludes?.includes(base)) continue;
    if (cfg.excludePrefix && base.startsWith(cfg.excludePrefix)) continue;
    if (!base.endsWith(".md")) continue;
    return true;
  }
  return false;
}

// ── Ledger I/O + minimal schema validation ──────────────────────────────────

function loadLedger() {
  const data = readJSON(LEDGER_PATH);
  if (!data) {
    return {
      $schema: "../governance/schemas/pr-ledger.schema.json",
      version: SCHEMA_VERSION,
      generated_at: todayISO(),
      prs: [],
    };
  }
  return data;
}

/**
 * Ключ запису — трійка host+repo+number, а не самий номер.
 *
 * Номер унікальний лише в межах одного репо одного хоста, і це не теорія:
 * Bitbucket почав нумерацію заново з одиниці, тоді як у реєстрі вже лежать
 * номери 29..3665 із трьох різних GitHub-репо. Щойно Bitbucket дійде до #29,
 * ключ по самому номеру почав би вважати два різні PR одним і перезаписувати
 * старіший запис - тихо, бо `upsert` на це не скаржиться.
 *
 * Відсутній `host` читається як `github`, відсутній `repo` - як легасі-репо,
 * тими самими правилами, що й у `repo-identity.mjs`. Так 60 наявних записів
 * лишаються валідними без переписування.
 */
export function entryKey(entry) {
  const host = entry?.host ?? "github";
  const repo = entry?.repo ?? "(legacy)";
  return `${host}:${repo}#${entry?.number}`;
}

const KNOWN_HOSTS = new Set(["github", "bitbucket"]);

function validateLedger(ledger) {
  const errors = [];
  if (ledger.version !== SCHEMA_VERSION)
    errors.push(`version: expected ${SCHEMA_VERSION}, got ${ledger.version}`);
  if (typeof ledger.generated_at !== "string")
    errors.push(`generated_at: not a string`);
  if (!Array.isArray(ledger.prs)) {
    errors.push(`prs: not an array`);
    return errors;
  }
  const seen = new Set();
  for (const pr of ledger.prs) {
    const key = entryKey(pr);
    if (typeof pr.number !== "number" || pr.number < 1)
      errors.push(`pr ${JSON.stringify(pr.number)}: invalid number`);
    if (seen.has(key)) errors.push(`pr ${key}: duplicate entry`);
    seen.add(key);
    if (pr.host !== undefined && !KNOWN_HOSTS.has(pr.host))
      errors.push(`pr ${key}: unknown host ${JSON.stringify(pr.host)}`);
    if (!pr.title) errors.push(`pr ${key}: missing title`);
    if (!pr.merged_at) errors.push(`pr ${key}: missing merged_at`);
    if (!pr.author) errors.push(`pr ${key}: missing author`);
    if (!Array.isArray(pr.touchedDocs) || pr.touchedDocs.length === 0)
      errors.push(`pr ${key}: empty touchedDocs`);
  }
  return errors;
}

function writeLedger(ledger) {
  const dir = dirname(LEDGER_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n");
}

// ── In-doc block rendering ──────────────────────────────────────────────────

/**
 * Render the PR-BACKLINKS block for `docRelPath`, or return `null` when
 * the ledger has no PRs touching this doc. Returning `null` keeps the
 * `applyBlock` caller from synthesizing empty placeholders inside every
 * canonical doc — blocks appear only after a PR actually touches the
 * file, matching the «no PR-noise until merge» principle.
 */
function renderBlock(docRelPath, ledger) {
  const entries = ledger.prs
    .filter((pr) => pr.touchedDocs.includes(docRelPath))
    .sort((a, b) => (b.merged_at || "").localeCompare(a.merged_at || ""))
    .slice(0, TOP_N_IN_DOC);

  if (entries.length === 0) return null;

  const rows = entries
    .map((pr) => {
      const dateOnly = pr.merged_at.slice(0, 10);
      const title = pr.title.replace(/\|/g, "\\|");
      return `| [#${pr.number}](${prBaseFor(pr)}/${pr.number}) | ${title} | ${dateOnly} |`;
    })
    .join("\n");

  return [
    BLOCK_START,
    "## Recent PRs",
    "",
    "| PR | Title | Merged |",
    "| --- | --- | --- |",
    rows,
    "",
    `_Auto-derived from \`docs/governance/pr-ledger/index.json\`. Top ${entries.length} most recent PRs touching this file._`,
    BLOCK_END,
  ].join("\n");
}

/**
 * Replace, append, or remove the PR-BACKLINKS block in `docContent`.
 * Idempotent. Returns the new content.
 *
 *   blockText == null and no existing block → no change.
 *   blockText != null and no existing block → append block.
 *   blockText != null and existing block    → replace block.
 *   blockText == null and existing block    → remove block (ledger was
 *     edited to drop the only entries that touched this doc; we leave
 *     the doc clean rather than leaving an orphan block).
 */
export function applyBlock(docContent, blockText) {
  const startMatch = RE_BLOCK_START.exec(docContent);
  // Search for the end marker strictly AFTER the start marker so that
  // back-to-back blocks can't fool the detection.
  let endMatch = null;
  if (startMatch) {
    const after = docContent.slice(startMatch.index + startMatch[0].length);
    const m = RE_BLOCK_END.exec(after);
    if (m) {
      endMatch = {
        index: startMatch.index + startMatch[0].length + m.index,
        length: m[0].length,
      };
    }
  }
  const startIdx = startMatch ? startMatch.index : -1;
  const endIdx = endMatch ? endMatch.index : -1;
  const endMarkerLen = endMatch ? endMatch.length : BLOCK_END.length;
  const hasExistingBlock = startIdx >= 0 && endIdx > startIdx;

  if (!hasExistingBlock && blockText == null) {
    return docContent;
  }

  if (hasExistingBlock && blockText == null) {
    const before = docContent.slice(0, startIdx).replace(/\s+$/, "");
    const after = docContent.slice(endIdx + endMarkerLen).replace(/^\s+/, "");
    return before + (after ? "\n\n" + after : "\n");
  }

  if (hasExistingBlock) {
    const before = docContent.slice(0, startIdx).replace(/\s+$/, "");
    const after = docContent.slice(endIdx + endMarkerLen).replace(/^\s+/, "");
    const tail = after ? "\n\n" + after : "\n";
    return before + "\n\n" + blockText + tail;
  }

  // No block yet — append. Ensure exactly one trailing newline before block.
  const trimmed = docContent.replace(/\s+$/, "");
  return trimmed + "\n\n" + blockText + "\n";
}

// ── Block regen (for --rebuild-blocks and --check) ──────────────────────────

/**
 * Format `content` with the repo Prettier config so the generated block is
 * byte-identical to what the Husky `prettier --write` pre-commit hook produces
 * for `*.md`. Without this, the generator emitted compact GFM tables
 * (`| PR |`) while Prettier reflows them to column-padded tables — any commit
 * touching a backlinked doc would then re-pad the table and break
 * `docs:check-pr-ledger`. Formatting here makes the generator output and the
 * hook output agree (padded). Lazy-import keeps unit tests node_modules-free.
 */
async function formatMarkdown(content, filepath) {
  const { default: prettier } = await import("prettier");
  const opts = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(content, { ...opts, parser: "markdown", filepath });
}

async function rebuildAllBlocks(ledger, { write = true } = {}) {
  const docs = listCanonicalDocs();
  const diffs = [];
  for (const docAbs of docs) {
    const docRel = relPath(docAbs);
    const current = readSafe(docAbs);
    const block = renderBlock(docRel, ledger);
    let next = applyBlock(current, block);
    // Normalise through Prettier so the on-disk result matches the pre-commit
    // hook exactly (padded tables); only when a block is present/changed.
    if (next !== current) next = await formatMarkdown(next, docAbs);
    if (current === next) continue;
    diffs.push({ path: docRel, current, next });
    if (write) writeFileSync(docAbs, next);
  }
  return diffs;
}

// ── PR sources ──────────────────────────────────────────────────────────────
//
// Джерело метаданих — обʼєкт з однаковим контрактом для обох хостів:
//
//   { host, slug,
//     getPR(n)                 → { number, title, merged_at, author,
//                                  merge_commit, url, paths },
//     listMerged(limit, since) → { prs: [{ number, merged_at }], capped } }
//
// `paths` — ПОВНИЙ список змінених файлів (звірений `assertCompleteFileList`),
// `merged_at` — ISO без мілісекунд. Писач далі не знає, звідки прийшли дані.
// `merge_commit` і `url` у реєстр не пишуться (схема `prEntry` їх не має,
// посилання будується з host+repo), але джерело їх віддає для логу.
//
// Основний хост з 2026-09-29 — GitHub (ADR-0101). Bitbucket лишається
// архівним джерелом за прапорцем `--host bitbucket`: PR #1..#105 жили там.

const GH_API = "https://api.github.com";

/**
 * Токен GitHub з середовища: `GITHUB_TOKEN` (Actions) або `GH_TOKEN`
 * (локально: `GH_TOKEN=$(gh auth token)`). Не аргументом: у командному рядку
 * токена бути не повинно. `null`, якщо немає — репо публічне, тож анонімні
 * запити працюють, але з лімітом 60 на годину.
 */
export function readGitHubToken(env = process.env) {
  return env["GITHUB_TOKEN"] || env["GH_TOKEN"] || null;
}

/** Чи є в заголовку `Link` посилання `rel="next"`. */
export function hasNextLink(linkHeader) {
  return typeof linkHeader === "string" && /rel="next"/.test(linkHeader);
}

function normalizeISO(raw) {
  if (!raw) return null;
  return new Date(raw).toISOString().replace(/\.\d+Z$/, "Z");
}

/**
 * GitHub REST. `fetchImpl` інжектується заради тестів — мережі в них немає.
 *
 * Список файлів посторінковий (100 на сторінку, стеля API — 3000 файлів), і
 * зупинка на першій сторінці — рівно та тиха дірка, через яку колись повз
 * реєстр проїхав #1081. Тому сторінки йдуть до кінця за `Link: rel="next"`,
 * а підсумок звіряється з `changed_files` самого PR: PR, більший за стелю
 * API, валить прогін, а не записується неповним.
 */
export function githubSource({ slug, token, fetchImpl = globalThis.fetch }) {
  async function ghGet(path) {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "sergeant-pr-ledger",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(`${GH_API}/repos/${slug}/${path}`, {
      headers,
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status} на ${path.split("?")[0]}`);
    }
    return {
      data: await res.json(),
      next: hasNextLink(res.headers?.get?.("link")),
    };
  }

  async function changedPaths(prNumber, expected) {
    const paths = [];
    for (let page = 1; ; page++) {
      const { data, next } = await ghGet(
        `pulls/${prNumber}/files?per_page=100&page=${page}`,
      );
      // Перейменований файл несе новий шлях у `filename`, старий — у
      // `previous_filename`; видалений — свій шлях у `filename`.
      for (const f of data ?? []) if (f.filename) paths.push(f.filename);
      if (!next) break;
    }
    assertCompleteFileList(paths.length, expected, prNumber);
    return paths;
  }

  return {
    host: "github",
    slug,
    async getPR(prNumber) {
      const { data } = await ghGet(`pulls/${prNumber}`);
      if (!data.merged_at) {
        throw new Error(`PR #${prNumber} не змерджений (state=${data.state}).`);
      }
      return {
        number: data.number,
        title: data.title,
        merged_at: normalizeISO(data.merged_at),
        // На GitHub логін — справжній хендл, тож PII-міркування з
        // Bitbucket-гілки (див. `bitbucketAuthor`) тут не діє.
        author: `@${data.user?.login || "unknown"}`,
        merge_commit: data.merge_commit_sha ?? null,
        url: data.html_url ?? `https://github.com/${slug}/pull/${prNumber}`,
        paths: await changedPaths(prNumber, data.changed_files),
      };
    },
    /**
     * Змерджені PR, найсвіжіші за оновленням першими. GitHub не фільтрує
     * «merged» на сервері, тож беремо `closed` і відсіюємо `merged_at == null`.
     * `since` (YYYY-MM-DD) обрізає хвіст: `updated_at >= merged_at`, тож щойно
     * сторінка дійшла до оновлених раніше за `since`, змерджених пізніше вже
     * не буде.
     */
    async listMerged(limit, since = null) {
      const out = [];
      let more = false;
      for (let page = 1; ; page++) {
        const { data, next } = await ghGet(
          `pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`,
        );
        let reachedSince = false;
        for (const pr of data ?? []) {
          if (since && (pr.updated_at ?? "").slice(0, 10) < since) {
            reachedSince = true;
            break;
          }
          if (!pr.merged_at) continue;
          const merged_at = normalizeISO(pr.merged_at);
          if (since && merged_at.slice(0, 10) < since) continue;
          out.push({ number: pr.number, merged_at });
        }
        more = next && !reachedSince;
        if (!more || out.length >= limit) break;
      }
      return {
        prs: out.slice(0, limit),
        capped: out.length > limit || (out.length >= limit && more),
      };
    },
  };
}

// Токен живе в `.env` ОСНОВНОГО клону, а не worktree, і не передається
// аргументом: у командному рядку його бути не повинно. Той самий шлях і те саме
// міркування, що в `scripts/deploy-api.mjs`.
const ENV_PATH = "D:\\Sergeant\\.env";
const BB_API = "https://api.bitbucket.org/2.0/repositories";
// Архівний дім 2026-09-23..29 (ADR-0101). Не `currentRepoSlug()`: той тепер
// повертає GitHub-слуг, а номери Bitbucket-PR живуть лише тут.
export const BITBUCKET_ARCHIVE_SLUG = "skords01/sergeant";

export function readBitbucketToken(envPath = ENV_PATH) {
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("BITBUCKET_TOKEN="));
  const token = line?.slice("BITBUCKET_TOKEN=".length).trim();
  if (!token) {
    throw new Error(
      `BITBUCKET_TOKEN не знайдено в ${envPath}. Без нього архівні ` +
        `Bitbucket-PR не дочитати (gh з Bitbucket не працює).`,
    );
  }
  return token;
}

/**
 * Звірка «скільки файлів у PR» проти «скільки ми прочитали».
 *
 * Винесено окремою чистою функцією, бо саме тут була дірка: `gh pr view
 * --json files` віддавав максимум 100 файлів, і для більшого PR скрипт
 * чесно не бачив жодного канонічного документа, друкував «did not touch
 * any canonical doc» і виходив нулем. Джоба ставала зеленою, крок
 * створення follow-up PR — `skipped`, і в логах це не відрізнити від
 * «справді нічого не чіпав». Так у леджер не потрапив #1081 (956 файлів,
 * десятки ADR), а за ним і решта — Hard Rule #26 замовкло вдруге.
 *
 * Тому неповний список — це помилка, а не привід тихо продовжити:
 * гейт, який не може виконати свою роботу, мусить сказати про це вголос.
 *
 * Обидва хости мають ту саму пастку: GitHub `pulls/<n>/files` і Bitbucket
 * `diffstat` посторінкові, а GitHub ще й ріже список на 3000 файлах. Тому
 * лічильник звіряється з `changed_files` (GitHub) або `size` (Bitbucket).
 */
export function assertCompleteFileList(fetched, expected, prNumber) {
  if (!Number.isInteger(expected)) return;
  if (fetched === expected) return;
  throw new Error(
    `PR #${prNumber}: fetched ${fetched} changed file(s) but the API reports ` +
      `${expected}. Refusing to guess which docs were touched — a partial ` +
      `list silently under-reports the ledger.`,
  );
}

/**
 * Автор Bitbucket-PR у формі `@handle`.
 *
 * Bitbucket логіна в цій відповіді не віддає: поля `nickname` немає навіть у
 * явному `fields=`, є лише `display_name` - і там лежить СПРАВЖНЄ ІМʼЯ власника,
 * а не хендл. Те саме в git: мерж-коміти, створені Bitbucket-ом, несуть
 * реальне імʼя і в `%an`, і в `%cn`.
 *
 * Тому display_name сюди не пишемо. Поле `author` ніде не рендериться (блок
 * показує лише номер, заголовок і дату), тож PII у трекованому файлі дало б
 * рівно нуль користі - а AGENTS.md § Deployment прямо просить такого не
 * комітити. Замість цього беремо слуг робочого простору з `repo`: він і так
 * лежить у репо відкритим текстом, має форму хендла і для цього репо правдивий,
 * бо PR-и тут створював лише власник.
 *
 * `nickname` теж не рятує: у цьому репо він дорівнює display_name. Відрізнити
 * хендл від імені програмно не вийде (одне слово буває і тим, і тим), тож
 * ніяких здогадів: для Bitbucket пишемо слуг робочого простору завжди.
 */
function bitbucketAuthor(slug) {
  const workspace = slug?.split("/")[0];
  return `@${workspace || "unknown"}`;
}

export function bitbucketSource({ slug, token, fetchImpl = globalThis.fetch }) {
  async function bbGet(path) {
    const res = await fetchImpl(`${BB_API}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Bitbucket API ${res.status} на ${path.split("?")[0]}`);
    }
    return res.json();
  }

  /** Усі шляхи, змінені в PR. Ходить по сторінках `diffstat` до кінця. */
  async function changedPaths(prNumber) {
    const paths = [];
    let expected = null;
    for (let page = 1; ; page++) {
      const data = await bbGet(
        `${slug}/pullrequests/${prNumber}/diffstat?pagelen=100&page=${page}`,
      );
      if (expected === null) expected = data.size ?? null;
      for (const v of data.values ?? []) {
        // `new` порожній у видалених файлів, `old` — у доданих.
        const p = v.new?.path ?? v.old?.path;
        if (p) paths.push(p);
      }
      if (!data.next) break;
    }
    assertCompleteFileList(paths.length, expected, prNumber);
    return paths;
  }

  // Bitbucket не має `merged_at`; час мержу — це `closed_on`.
  const mergedAt = (pr) => normalizeISO(pr.closed_on ?? pr.updated_on);

  return {
    host: "bitbucket",
    slug,
    async getPR(prNumber) {
      const data = await bbGet(
        `${slug}/pullrequests/${prNumber}` +
          `?fields=id,title,state,closed_on,updated_on,merge_commit.hash`,
      );
      if (data.state !== "MERGED") {
        throw new Error(`PR #${prNumber} не змерджений (state=${data.state}).`);
      }
      return {
        number: data.id,
        title: data.title,
        merged_at: mergedAt(data),
        author: bitbucketAuthor(slug),
        merge_commit: data.merge_commit?.hash ?? null,
        url: `https://bitbucket.org/${slug}/pull-requests/${prNumber}`,
        paths: await changedPaths(prNumber),
      };
    },
    async listMerged(limit, since = null) {
      const out = [];
      let more = false;
      for (let page = 1; ; page++) {
        const data = await bbGet(
          `${slug}/pullrequests?q=${encodeURIComponent('state="MERGED"')}` +
            `&sort=-updated_on&pagelen=50&page=${page}` +
            `&fields=next,values.id,values.closed_on,values.updated_on`,
        );
        for (const pr of data.values ?? []) {
          const merged_at = mergedAt(pr);
          if (since && (merged_at ?? "").slice(0, 10) < since) continue;
          out.push({ number: pr.id, merged_at });
        }
        more = Boolean(data.next);
        if (!more || out.length >= limit) break;
      }
      return {
        prs: out.slice(0, limit),
        capped: out.length > limit || (out.length >= limit && more),
      };
    },
  };
}

/** Метадані одного змердженого PR у формі запису реєстру. */
export async function fetchPRMetadata(prNumber, source) {
  const pr = await source.getPR(prNumber);
  const touchedDocs = pr.paths.filter((p) => isCanonicalDocPath(p)).sort();
  console.log(
    `PR #${pr.number} (${pr.url}, merge ${pr.merge_commit?.slice(0, 8) ?? "?"}): ` +
      `${pr.paths.length} changed file(s), ${touchedDocs.length} canonical doc(s).`,
  );
  return {
    number: pr.number,
    title: pr.title,
    merged_at: pr.merged_at,
    author: pr.author,
    host: source.host,
    repo: source.slug,
    touchedDocs,
  };
}

/**
 * PR, які вже дивились і які не торкнулись жодного канонічного документа.
 *
 * Без цього списку `--stale` рахував би їх вічно: більшість PR канонічних доків
 * не чіпає, запису в реєстрі не отримує - і кожен наступний прогін нагадував би
 * про ті самі «пропущені». Нагадування, яке не можна погасити, за тиждень
 * читається як шум і перестає працювати.
 *
 * Зберігаємо саме перелік оглянутих, а не «найбільший оглянутий номер»: PR
 * зі старішим номером може змерджитись пізніше за новіший, і відсічка по
 * максимуму тихо проковтнула б його - рівно той клас пропуску, проти якого це
 * правило й існує.
 *
 * Ключ групи: `bitbucket` для архіву (як писалось з 2026-09-23) і
 * `github:<owner>/<repo>` для GitHub. Номер унікальний лише в межах репо, а
 * GitHub-репо в історії вже кілька: група лише за хостом після наступного
 * переїзду тихо вважала б нові PR #1..#N «уже оглянутими».
 */
export function examinedKey(host, slug) {
  return host === "bitbucket" ? "bitbucket" : `${host}:${slug}`;
}

function examinedSet(ledger, key) {
  return new Set(ledger.examined?.[key] ?? []);
}

function markExamined(ledger, key, numbers) {
  if (numbers.length === 0) return false;
  const before = examinedSet(ledger, key);
  const after = new Set([...before, ...numbers]);
  if (after.size === before.size) return false;
  ledger.examined = {
    ...(ledger.examined ?? {}),
    [key]: [...after].sort((a, b) => a - b),
  };
  return true;
}

/** Змерджені PR, яких ще немає в реєстрі і яких ще не дивились. */
async function findMissingPRs(ledger, source, { limit, since }) {
  const known = new Set(ledger.prs.map((p) => entryKey(p)));
  const examined = examinedSet(ledger, examinedKey(source.host, source.slug));
  const { prs, capped } = await source.listMerged(limit, since);
  const missing = prs.filter(
    (pr) =>
      !known.has(
        entryKey({ number: pr.number, host: source.host, repo: source.slug }),
      ) && !examined.has(pr.number),
  );
  missing.reverse();
  return { missing, capped, scanned: prs.length };
}

// ── Ledger upsert ───────────────────────────────────────────────────────────

function upsertPR(ledger, entry) {
  if (entry.touchedDocs.length === 0) return false;
  const key = entryKey(entry);
  const idx = ledger.prs.findIndex((p) => entryKey(p) === key);
  if (idx >= 0) {
    // Replace existing entry verbatim (fields may change after merge —
    // for example, follow-up amend changes title).
    if (JSON.stringify(ledger.prs[idx]) === JSON.stringify(entry)) {
      return false;
    }
    ledger.prs[idx] = entry;
  } else {
    ledger.prs.push(entry);
  }
  // Sort by merged_at descending so the newest PR is at index 0.
  ledger.prs.sort((a, b) =>
    (b.merged_at || "").localeCompare(a.merged_at || ""),
  );
  ledger.generated_at = todayISO();
  return true;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const out = { mode: null, prNumber: null, host: "github", since: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") out.mode = "check";
    else if (a === "--rebuild-blocks") out.mode = "rebuild-blocks";
    else if (a === "--sync") out.mode = "sync";
    else if (a === "--stale") out.mode = "stale";
    else if (a === "--pr") {
      const v = argv[++i];
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`--pr requires a positive integer (got ${v})`);
      }
      out.mode = "pr";
      out.prNumber = n;
    } else if (a === "--host") {
      const v = argv[++i];
      if (!KNOWN_HOSTS.has(v)) {
        throw new Error(`--host must be github or bitbucket (got ${v})`);
      }
      out.host = v;
    } else if (a === "--since") {
      const v = argv[++i];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v ?? "")) {
        throw new Error(`--since requires YYYY-MM-DD (got ${v})`);
      }
      out.since = v;
    }
  }
  return out;
}

/** Джерело метаданих за `--host`. Токен — лише з середовища або `.env`. */
function sourceFor(host) {
  if (host === "bitbucket") {
    return bitbucketSource({
      slug: BITBUCKET_ARCHIVE_SLUG,
      token: readBitbucketToken(),
    });
  }
  const token = readGitHubToken();
  if (!token) {
    console.error(
      "pr-ledger: GITHUB_TOKEN/GH_TOKEN не задано — анонімні запити (60/год). " +
        "Локально: GH_TOKEN=$(gh auth token).",
    );
  }
  return githubSource({ slug: currentRepoSlug(), token });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.mode) {
    console.error(
      "Usage:\n" +
        "  --sync             дочитати всі змерджені PR, яких немає в реєстрі\n" +
        "  --pr <NUMBER>      те саме для одного PR\n" +
        "  --stale            скільки PR бракує (нічого не пише, exit 0)\n" +
        "  --rebuild-blocks   перерендерити блоки з поточного реєстру\n" +
        "  --check            звірити реєстр ↔ блоки ↔ схему (крок pnpm lint)\n" +
        "Опції для --sync/--pr/--stale:\n" +
        "  --host github|bitbucket   джерело (типово github; bitbucket — архів)\n" +
        "  --since YYYY-MM-DD        лише PR, змерджені від цієї дати",
    );
    process.exit(2);
  }

  const ledger = loadLedger();

  if (args.mode === "check") {
    const schemaErrors = validateLedger(ledger);
    if (schemaErrors.length > 0) {
      console.error(
        `pr-ledger: ${schemaErrors.length} schema violation${schemaErrors.length === 1 ? "" : "s"}:`,
      );
      for (const err of schemaErrors.slice(0, 20)) console.error(`  - ${err}`);
      process.exit(1);
    }
    const diffs = await rebuildAllBlocks(ledger, { write: false });
    if (diffs.length > 0) {
      console.error(
        `pr-ledger: ${diffs.length} doc${diffs.length === 1 ? "" : "s"} have stale PR-BACKLINKS block${diffs.length === 1 ? "" : "s"}. Run \`pnpm docs:gen-pr-backlinks\` and commit.`,
      );
      for (const d of diffs.slice(0, 10)) console.error(`  - ${d.path}`);
      process.exit(1);
    }
    console.log(
      `pr-ledger: up to date (${ledger.prs.length} PR${ledger.prs.length === 1 ? "" : "s"} indexed, all blocks in sync).`,
    );
    return;
  }

  if (args.mode === "rebuild-blocks") {
    const schemaErrors = validateLedger(ledger);
    if (schemaErrors.length > 0) {
      console.error("pr-ledger: schema violations — refusing to write.");
      for (const err of schemaErrors) console.error(`  - ${err}`);
      process.exit(1);
    }
    const diffs = await rebuildAllBlocks(ledger, { write: true });
    console.log(
      `pr-ledger: ${diffs.length === 0 ? "no blocks needed updating" : `updated ${diffs.length} block${diffs.length === 1 ? "" : "s"}`}.`,
    );
    return;
  }

  const source = sourceFor(args.host);
  const scan = { limit: SYNC_LIMIT, since: args.since };
  const sinceNote = args.since ? `, змерджених від ${args.since}` : "";

  if (args.mode === "stale") {
    const { missing, capped, scanned } = await findMissingPRs(
      ledger,
      source,
      scan,
    );
    console.log(String(missing.length));
    if (missing.length > 0) {
      console.error(
        `pr-ledger: ${missing.length} змерджених PR (${source.host}:${source.slug}${sinceNote}) ` +
          `з ${scanned} перевірених немає в реєстрі` +
          `${capped ? ` (скан обрізано на ${SYNC_LIMIT})` : ""}: ` +
          missing.map((p) => `#${p.number}`).join(", "),
      );
    }
    return;
  }

  if (args.mode === "sync" || args.mode === "pr") {
    let targets;
    if (args.mode === "pr") {
      targets = [{ number: args.prNumber }];
    } else {
      const found = await findMissingPRs(ledger, source, scan);
      if (found.capped) {
        console.error(
          `pr-ledger: скан обрізано на ${SYNC_LIMIT} PR — запусти ще раз ` +
            `або звузь --since.`,
        );
      }
      targets = found.missing;
    }

    if (targets.length === 0) {
      console.log("pr-ledger: усі змерджені PR уже в реєстрі.");
      return;
    }

    let upserted = 0;
    const withoutDocs = [];
    for (const target of targets) {
      const entry = await fetchPRMetadata(target.number, source);
      if (entry.touchedDocs.length === 0) {
        // Нічого канонічного не торкнувся — це не пропуск, а нормальний стан
        // для більшості PR. Запису немає навмисно: реєстр індексує саме
        // канонічні доки, а не всі мержі. Але номер запамʼятовуємо, інакше
        // `--stale` рахуватиме його як пропущений вічно.
        withoutDocs.push(entry.number);
        continue;
      }
      if (upsertPR(ledger, entry)) upserted += 1;
    }

    const marked = markExamined(
      ledger,
      examinedKey(source.host, source.slug),
      withoutDocs,
    );
    if (upserted > 0 || marked) writeLedger(ledger);
    console.log(
      `pr-ledger: ${upserted} запис(ів) додано або оновлено, ` +
        `${withoutDocs.length} PR без канонічних доків.`,
    );
    const diffs = await rebuildAllBlocks(ledger, { write: true });
    console.log(
      `Blocks: ${diffs.length === 0 ? "no updates needed" : `regenerated ${diffs.length}`}.`,
    );
    return;
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    await main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
