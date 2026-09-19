#!/usr/bin/env node
/**
 * Гейт: у доках не з'являється НЕВІДОМИЙ слуг власного репо.
 *
 * @status Active
 *
 * Що ловить і чому саме так. Репо переїхало чотири рази, і слуг був зашитий
 * у трьох незалежних місцях — тож кожен переїзд тихо робив мертвими всі
 * self-посилання одразу. 2026-09-19 це коштувало 93 битих лінки і червоний
 * `--strict-external` на КОЖНОМУ PR незалежно від змісту, тобто гейт
 * посилань повернувся у стан «червоний завжди = вимкнений».
 *
 * Мережева перевірка цю роботу виконати не може: анонімний HEAD дає 404 на
 * всі чотири домівки (старі акаунти сторінок не віддають, поточна приватна).
 * Тому цей гейт нічого не відкриває — він звіряє написане в доках із
 * реєстром `docs/governance/governance/repo-identity.json` і з фактичним
 * `git remote`. Працює офлайн, спрацьовує на коміті, а не через тиждень.
 *
 * Дві перевірки:
 *
 *   1. `current` у реєстрі збігається з живим `origin` / `GITHUB_REPOSITORY`.
 *      Розбіжність = репо переїхало, а реєстр не оновили.
 *   2. Кожне markdown-посилання на `github.com/<owner>/<repo>`, де `<repo>`
 *      схожий на цей проєкт, вказує на слуг із реєстру.
 *
 * Чого гейт НЕ робить: не вимагає переписати історичні посилання на
 * поточний дім. PR-нумерація кожного дому своя (свіжий доказ: перший PR у
 * `klas149` отримав номер 18, тоді як у `zaebal-beep` номери йшли до 100),
 * тож заміна власника дає брехливе посилання замість мертвого.
 *
 * Запуск: `pnpm lint:repo-slug` або `node scripts/check-repo-slug.mjs`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import {
  IDENTITY_PATH,
  REPO_ROOT,
  knownSlugs,
  readIdentity,
  slugFromEnvironment,
} from "./docs/repo-identity.mjs";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-server",
  "coverage",
  ".turbo",
  ".next",
  "build",
  "playwright-report",
  "test-results",
]);

/**
 * Назви репо, які вважаємо «своїми». Тільки вони перевіряються — посилання
 * на `github.com/better-auth/better-auth` цього гейта не обходять.
 */
const SELF_REPO_NAMES = new Set(["sergeant"]);

/** `github.com/<owner>/<repo>` у будь-якому контексті (markdown-лінк, голий URL, код). */
const RE_GITHUB = /github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)/gu;

function collectMarkdown(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue; // битий симлінк — не наша робота
    }
    if (st.isDirectory()) collectMarkdown(full, out);
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

/**
 * Знаходить посилання на власне репо з невідомим слугом.
 * Чистий — щоб тест міг годувати рядок без файлової системи.
 *
 * @param {string} source вміст markdown-файла
 * @param {Set<string>} known відомі слуги в нижньому регістрі
 * @returns {{line: number, slug: string}[]}
 */
export function findUnknownSlugs(source, known) {
  const found = [];
  source.split("\n").forEach((line, i) => {
    RE_GITHUB.lastIndex = 0;
    for (const m of line.matchAll(RE_GITHUB)) {
      const [, owner, repoRaw] = m;
      const repo = repoRaw.replace(/\.git$/u, "");
      if (!SELF_REPO_NAMES.has(repo.toLowerCase())) continue;
      const slug = `${owner}/${repo}`;
      if (known.has(slug.toLowerCase())) continue;
      found.push({ line: i + 1, slug });
    }
  });
  return found;
}

function main() {
  const identity = readIdentity();
  const live = slugFromEnvironment();
  const problems = [];

  // ── Перевірка 1: реєстр проти живого remote ───────────────────────────────
  if (live && live.toLowerCase() !== identity.current.toLowerCase()) {
    problems.push(
      `Реєстр застарів: "current" = ${identity.current}, а фактичний origin — ${live}.`,
      `  Полагодити: у ${relative(REPO_ROOT, IDENTITY_PATH)} перенести "${identity.current}"`,
      `  у початок "previous" і поставити "current": "${live}".`,
      "",
    );
  }

  // ── Перевірка 2: посилання в доках ────────────────────────────────────────
  const known = knownSlugs();
  const hits = [];
  for (const file of collectMarkdown(REPO_ROOT)) {
    for (const hit of findUnknownSlugs(readFileSync(file, "utf8"), known)) {
      hits.push({ file: relative(REPO_ROOT, file), ...hit });
    }
  }

  if (hits.length > 0) {
    const bySlug = new Map();
    for (const h of hits) {
      if (!bySlug.has(h.slug)) bySlug.set(h.slug, []);
      bySlug.get(h.slug).push(h);
    }
    problems.push(
      `Невідомий слуг власного репо у ${hits.length} посилання(х):`,
      "",
    );
    for (const [slug, rows] of bySlug) {
      problems.push(`  ${slug} — ${rows.length} згадка(и):`);
      for (const r of rows.slice(0, 5)) {
        problems.push(`    ${r.file}:${r.line}`);
      }
      if (rows.length > 5) problems.push(`    … і ще ${rows.length - 5}`);
      problems.push("");
    }
    problems.push(
      "  Якщо це справді наша домівка (переїзд) — додайте слуг у",
      `  ${relative(REPO_ROOT, IDENTITY_PATH)}. Якщо друкарська помилка — виправте посилання.`,
      "  Переписувати історичні посилання на поточний дім НЕ треба:",
      "  PR-нумерація кожного дому своя, заміна власника дасть брехливе",
      "  посилання замість мертвого.",
      "",
    );
  }

  if (problems.length > 0) {
    console.error("🔴 lint:repo-slug\n");
    console.error(problems.join("\n"));
    process.exitCode = 1;
    return;
  }

  const source = live ? `origin → ${live}` : `реєстр → ${identity.current}`;
  console.log(
    `✅ lint:repo-slug OK — ${known.size} відомих домівок, ${source}.`,
  );
}

// Гейт запускається лише при прямому виклику. Без цієї перевірки `import`
// із тесту проганяв би весь скан, і будь-яка знахідка в доках ставила б
// `process.exitCode = 1` — тобто валила б тест, який до неї не має стосунку.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
