#!/usr/bin/env node

/**
 * Build the auditable old-path → final-path matrix for the docs migration.
 *
 * @status Active
 *
 * **Чому артефакт не несе часу.** До 2026-09-19 сюди писалось
 * `baseline_revision: git rev-parse HEAD` і `baseline_files`, а `--check`
 * вимагав побайтової рівності. Це робило гейт нездійсненним за побудовою:
 * щойно щойно згенерований файл потрапляв у коміт, HEAD змінювався — і
 * артефакт ставав «застарілим» тією самою дією, яка його зберігала. `--amend`
 * цього не лікував, бо міняв HEAD ще раз. Друга половина тієї ж пастки:
 * `baseline_files` рахував `git ls-tree HEAD`, тож коміт із новим доком
 * зсував і його.
 *
 * Саме тому гейт і не був підключений ні до `pnpm lint`, ні до жодного
 * воркфлоу — підключений він валив би все. А непідключений мовчав, і файл
 * стояв простроченим до звірки 2026-09-19.
 *
 * Тепер в артефакті лишається тільки те, що описує САМУ матрицю (`entries`,
 * `target_collisions`, `tracked_files` як розмір об'єднання закоміченого й
 * дискового стану). Ревізія і момент зняття йдуть у лог прогону, не у файл.
 * Розбір — `docs/work/specs/docs-code-drift-2026-09-19.md`, PR-9.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { readIdentity } from "./repo-identity.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT = resolve(
  ROOT,
  "docs/work/specs/data/documentation-inventory.json",
);
const CHECK = process.argv.includes("--check");
const SHA = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).trim();
// Слуг для permalink-ів на видалені доки — із реєстру домівок, не зашитий.
// Доти тут стояв `SkOrDs-01/Sergeant` (ще й у третьому написанні власника),
// тобто четверта незалежна копія величини, яку PR-1 звів до однієї.
const LEGACY_BLOB_BASE = `https://github.com/${readIdentity().legacyPrSlug}/blob`;

const TEXT_EXTENSIONS =
  /\.(?:md|json|mjs|js|ts|tsx|yml|yaml|toml|hbs|css|html|alloy)$/u;

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function repoPath(path) {
  return relative(ROOT, path).replaceAll("\\", "/");
}

/**
 * Відкидає gitignored-шляхи з дискового обходу.
 *
 * AI-CONTEXT: обхід `walk()` бачить ВЕСЬ диск, а в CI диск = чистий
 * чекаут. Gitignored-файл під `docs/` (з 2026-10-01 це локально згенерований
 * `freshness-dashboard.html`) робив матрицю залежною від того, чи автор
 * запускав генератор: локальний `--check` червонів, CI був зелений, або
 * навпаки. Дашборд іще й містить шляхи всіх ~500 відстежуваних доків, тож
 * додавав себе в `inbound_sources` кожного з них.
 */
function dropIgnored(paths) {
  if (paths.length === 0) return paths;
  let out = "";
  try {
    out = execFileSync("git", ["check-ignore", "--stdin"], {
      cwd: ROOT,
      input: paths.join("\n"),
      encoding: "utf8",
    });
  } catch (error) {
    // `git check-ignore` виходить з 1, коли жоден шлях не ігнорується.
    if (error?.status === 1) return paths;
    throw error;
  }
  const ignored = new Set(out.split(/\r?\n/u).filter(Boolean));
  return paths.filter((path) => !ignored.has(path));
}

const baseline = execFileSync(
  "git",
  ["ls-tree", "-r", "--name-only", "HEAD", "docs"],
  {
    cwd: ROOT,
    encoding: "utf8",
  },
)
  .split(/\r?\n/u)
  .filter(Boolean)
  .sort();
const current = dropIgnored(walk(resolve(ROOT, "docs")).map(repoPath)).sort();
const currentSet = new Set(current);

function finalPathFor(oldPath) {
  const moves = [
    ["docs/00-start/playbooks", "docs/start/instructions"],
    ["docs/03-operations/runbooks", "docs/start/instructions"],
    ["docs/01-product/model/finyk.md", "docs/product/modules/finyk.md"],
    ["docs/01-product/model/fizruk.md", "docs/product/modules/fizruk.md"],
    ["docs/01-product/model/hub-coach.md", "docs/product/modules/hub-coach.md"],
    ["docs/01-product/model/nutrition.md", "docs/product/modules/nutrition.md"],
    ["docs/01-product/model/routine.md", "docs/product/modules/routine.md"],
    ["docs/01-product/launch", "docs/work/specs/launch"],
    [
      "docs/04-governance/security/hardening",
      "docs/work/specs/security-hardening",
    ],
    ["docs/90-work/planning/specs", "docs/work/specs"],
    ["docs/90-work/initiatives", "docs/work/specs/initiatives"],
    ["docs/90-work/planning", "docs/work/specs/planning"],
    ["docs/90-work/audits", "docs/work/specs/audits"],
    ["docs/90-work/tech-debt", "docs/work/specs/tech-debt"],
    ["docs/90-work/superpowers", "docs/work/specs/superpowers"],
    ["docs/90-work/beta-launch", "docs/work/specs/beta-launch"],
    ["docs/00-start", "docs/start"],
    ["docs/01-product", "docs/product"],
    ["docs/02-engineering", "docs/engineering"],
    ["docs/03-operations", "docs/operations"],
    ["docs/04-governance", "docs/governance"],
    ["docs/05-design", "docs/design"],
    ["docs/90-work", "docs/work"],
  ];
  for (const [from, to] of moves) {
    if (oldPath === from || oldPath.startsWith(`${from}/`)) {
      return `${to}${oldPath.slice(from.length)}`;
    }
  }
  return oldPath;
}

function genreFor(path) {
  if (path.includes("/adr/")) return "adr";
  if (path.startsWith("docs/work/specs/")) return "active-work";
  if (path.startsWith("docs/start/instructions/")) return "instruction";
  if (path.startsWith("docs/product/modules/")) return "product-canon";
  if (
    path.endsWith("README.md") ||
    /^docs\/(?:STATUS|today|open-work)\.md$/u.test(path)
  )
    return "index";
  return "reference";
}

const inbound = new Map();
function addInbound(target, source) {
  if (!target.startsWith("docs/")) return;
  const sources = inbound.get(target) ?? new Set();
  sources.add(source);
  inbound.set(target, sources);
}

for (const sourcePath of current.filter(
  (path) => TEXT_EXTENSIONS.test(path) && resolve(ROOT, path) !== OUTPUT,
)) {
  const source = readFileSync(resolve(ROOT, sourcePath), "utf8");
  const withoutUrls = source.replace(/https?:\/\/\S+/gu, "");
  for (const match of withoutUrls.matchAll(/docs\/[A-Za-z0-9_.@/-]+/gu)) {
    addInbound(match[0].replace(/[.,;:]$/u, ""), sourcePath);
  }
  if (!sourcePath.endsWith(".md")) continue;
  for (const match of source.matchAll(
    /\]\((?!https?:|mailto:|#)<?([^)>\s#]+)(?:#[^)>\s]+)?>?/gu,
  )) {
    let href;
    try {
      href = decodeURIComponent(match[1]);
    } catch {
      href = match[1];
    }
    addInbound(
      repoPath(resolve(dirname(resolve(ROOT, sourcePath)), href)),
      sourcePath,
    );
  }
}

/**
 * Ревізія, на яку безпечно пінити permalink видаленого доку: останній коміт,
 * у якому файл ІСНУВАВ.
 *
 * Чому не `HEAD`. По-перше, це та сама пастка, що й `baseline_revision`:
 * пін на HEAD робить артефакт нестабільним від самого факту коміту. По-друге,
 * для ВИДАЛЕНОГО файла permalink на HEAD просто неправильний — на HEAD його
 * нема, посилання віддає 404. Останній коміт, що торкався шляху, може бути
 * саме комітом видалення, тому за потреби відступаємо на його батька.
 *
 * Зараз таких записів нуль (міграція доків завершена), але без цієї правки
 * перший же видалений док повернув би самопожирання артефакту.
 */
const permalinkRevCache = new Map();
function permalinkRevFor(path) {
  if (permalinkRevCache.has(path)) return permalinkRevCache.get(path);
  let rev;
  try {
    rev = execFileSync("git", ["rev-list", "-1", "HEAD", "--", path], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    if (rev) {
      try {
        execFileSync("git", ["cat-file", "-e", `${rev}:${path}`], {
          cwd: ROOT,
          stdio: "ignore",
        });
      } catch {
        rev = `${rev}^`; // цей коміт файл і видалив — беремо батька
      }
    }
  } catch {
    rev = "";
  }
  const out = rev || SHA;
  permalinkRevCache.set(path, out);
  return out;
}

const entries = baseline.map((oldPath) => {
  const proposed = finalPathFor(oldPath);
  const exists = currentSet.has(proposed);
  const removed = !exists || proposed.includes("/archive/");
  const newPath = removed
    ? `${LEGACY_BLOB_BASE}/${permalinkRevFor(oldPath)}/${oldPath}`
    : proposed;
  const sources = [...(inbound.get(exists ? proposed : oldPath) ?? [])].sort();
  const mergedReadme =
    oldPath === "docs/start/playbooks/README.md" ||
    oldPath === "docs/operations/runbooks/README.md";
  return {
    old_path: oldPath,
    new_path: newPath,
    action: removed
      ? "remove"
      : mergedReadme
        ? "merge"
        : oldPath === proposed
          ? "keep"
          : "move",
    genre: genreFor(proposed),
    canonical_owner: newPath,
    inbound_count: sources.length,
    inbound_sources: sources,
  };
});

const baselineSet = new Set(baseline);
for (const path of current) {
  if (baselineSet.has(path)) continue;
  if (entries.some((entry) => entry.new_path === path)) continue;
  const sources = [...(inbound.get(path) ?? [])].sort();
  entries.push({
    old_path: null,
    new_path: path,
    action: "keep",
    genre: genreFor(path),
    canonical_owner: path,
    inbound_count: sources.length,
    inbound_sources: sources,
  });
}
entries.sort((a, b) =>
  (a.old_path ?? a.new_path).localeCompare(b.old_path ?? b.new_path),
);

const targets = new Map();
for (const entry of entries.filter(
  (item) => !item.new_path.startsWith("https://"),
)) {
  const paths = targets.get(entry.new_path) ?? [];
  paths.push(entry.old_path);
  targets.set(entry.new_path, paths);
}
const targetCollisions = [...targets.entries()]
  .filter(([target, paths]) => {
    if (paths.length < 2) return false;
    const rows = entries.filter((entry) => entry.new_path === target);
    return !rows.every((entry) => entry.action === "merge");
  })
  .map(([new_path, old_paths]) => ({ new_path, old_paths }));

// Розмір ОБ'ЄДНАННЯ закоміченого й дискового стану. Саме об'єднання, а не
// `baseline.length`: після коміту, який додає док, `git ls-tree HEAD` бачить
// новий файл, і лічильник «baseline» стрибає — тобто чергове число, що
// змінюється від самого факту коміту.
const trackedFiles = new Set([...baseline, ...current]).size;

const output = await format(
  JSON.stringify(
    {
      _generated: true,
      generated_by: "scripts/docs/generate-documentation-inventory.mjs",
      // `baseline_revision` і `baseline_files` тут НЕ пишуться навмисно — див.
      // коментар «Чому артефакт не несе часу» у шапці файла.
      tracked_files: trackedFiles,
      total_entries: entries.length,
      target_collisions: targetCollisions,
      entries,
    },
    null,
    2,
  ),
  { parser: "json" },
);

if (CHECK) {
  let existing = "";
  try {
    existing = readFileSync(OUTPUT, "utf8");
  } catch {
    // A missing matrix is drift.
  }
  if (existing !== output) {
    console.error(
      `${repoPath(OUTPUT)} is out of date. Run pnpm docs:gen-inventory.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Documentation inventory is current (${entries.length} entries, ` +
        `${trackedFiles} tracked files @ ${SHA.slice(0, 8)}).`,
    );
  }
} else {
  writeFileSync(OUTPUT, output);
  console.log(`Wrote ${repoPath(OUTPUT)} (${entries.length} entries).`);
}
