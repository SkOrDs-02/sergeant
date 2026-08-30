#!/usr/bin/env node
// scripts/pre-commit-derived-artifacts.mjs
//
// Pre-commit guard for DERIVED artifacts: files that are generated from
// other files in the repo and committed alongside them.
//
// Проблема, яку це закриває. У ніч 2026-08-29/30 `main` ламався шість
// разів поспіль трьома різними PR — і щоразу одним і тим самим
// механізмом: джерело змінилось, похідний артефакт не перегенеровано.
// #935 лишив несвіжим `docs/02-engineering/api/openapi.json`, #930 і #941 —
// чотири похідні доки та `freshness-dashboard.html`. Гейти в CI на все це
// вже були; чого не було — нічого, що заважає створити розсинхрон ЛОКАЛЬНО.
// Автор дізнавався про нього лише коли червонів чужий відкритий PR.
//
// AI-CONTEXT: цей скрипт не додає НОВОГО класу блокувань. Кожна перевірка
// тут уже стоїть PR-гейтом (`api:check-openapi` — у contract-tests.yml,
// решта — у docs-automation.yml, джоби `docs-freshness`, `daily-brief`,
// `markdown-links`). Змінюється лише момент, коли автор про це дізнається:
// на своїй машині до пушу замість чужого червоного PR після.
//
// Чому перевірка, а не автофікс. Прецедент автофіксу в цьому ж хуку є:
// `bump-last-validated.mjs` перегенеровує freshness-dashboard і сам його
// `git add`-ить. Він може собі це дозволити, бо дашборд — чиста функція
// від тих самих `Last validated`, які цей же скрипт щойно й зсунув: він
// дописує в коміт наслідок ВЛАСНОЇ правки. Решта артефактів тут інша.
// `open-work.md`, `today.md`, `STATUS.md` і trust-badge рендеряться зі
// стану ТРЕКЕРІВ і `pr-ledger` цілого репо, `openapi.json` — з усіх
// zod-схем `@sergeant/shared`. Тихо перегенерувати їх означає підмішати в
// коміт автора чужий стан, якого він не торкався і не бачив у діффі.
// Тому тут — назвати розбіжність і точну команду, а рішення лишити людині.
//
// AI-NOTE: дашборд у таблиці нижче лишається навмисно, хоч
// `bump-last-validated` і намагається його перегенерувати сам. Там це
// best-effort у `try/catch` зі свідомим «як що — зловить CI» (див. його
// коментар при `generate-freshness-dashboard`). Ця перевірка стоїть ПІСЛЯ
// і робить те «зловить CI» локальним — тобто ловить саме той випадок,
// коли автофікс мовчки не спрацював.
//
// Чому це не червонітиме саме по собі від плину часу. Усі `--check` тут
// порівнюють вміст, нечутливий до штампів дат (`isStaleIgnoringDateStamp`
// у `scripts/docs/freshness-stamp.mjs`), тому «настав наступний день» саме
// по собі гейт не будить. Розбіжність, яка ВСЕ Ж може виникнути без
// правки джерела, — коли доку перетнув свій `Next review` і він з'явився
// у списку прострочених. Це справжній дрейф вмісту, і CI на нього
// відреагує так само; аварійний вихід — `SERGEANT_NO_DERIVED_CHECK=1`.
//
// Межа цього гейта: він бачить ЛИШЕ дерево автора. Другий механізм
// розсинхрону — коли базова гілка з'їхала під уже відкритим PR: CI рендерить
// артефакт з мерджу, тож дашборд може розійтись, хоча в коміті автора все
// сходилось. Впіймано на самому PR, який цей скрипт і додає: `main` пішов
// уперед на пʼять комітів (серед них ревізія routine-канону з власним
// freshness-заголовком), і `Markdown link checker` почервонів на артефакті,
// якого автор не торкався. Лікується це не хуком, а `git merge origin/main`
// + регенерацією — і сам гейт тоді відтворює падіння CI локально, разом із
// командою фіксу. Тобто скрипт закриває «забув перегенерувати після своєї
// правки», але не «чужий мердж знецінив мій артефакт».
//
// Usage (з lint-staged; імена staged-файлів у argv ігноруються — усі ці
// генератори читають ціле дерево, не переданий список):
//
//   node scripts/pre-commit-derived-artifacts.mjs --docs     [files…]
//   node scripts/pre-commit-derived-artifacts.mjs --openapi  [files…]
//
// Opt-out: `SERGEANT_NO_DERIVED_CHECK=1 git commit …` — для проміжного
// коміту в гілці. Хук при цьому НЕ пропускається (Hard Rule #7), і CI-гейт
// лишається на місці.

import { spawn } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

/**
 * Похідні артефакти за групами тригерів.
 *
 * AI-NOTE: `check` / `fix` — це ІМЕНА pnpm-скриптів, не командні рядки.
 * Реальна команда резолвиться з `package.json` (див. `resolveCommand`), щоб
 * тут не з'явилась друга копія шляху до генератора, яка мовчки розійдеться
 * з першою. `fix` показується людині рівно в тому вигляді, в якому вона
 * його набере.
 */
const GROUPS = {
  docs: [
    {
      artifact: "docs/open-work.md",
      check: "docs:check-open-work",
      fix: "docs:gen-open-work",
    },
    {
      artifact: "docs/today.md",
      check: "docs:check-today",
      fix: "docs:gen-today",
    },
    {
      artifact: "docs/STATUS.md",
      check: "docs:check-status",
      fix: "docs:gen-status",
    },
    {
      artifact: "docs/README.md (блок trust-badge)",
      check: "docs:check-trust-badge",
      fix: "docs:gen-trust-badge",
    },
    {
      artifact: "docs/04-governance/governance/freshness-dashboard.html",
      check: "docs:check-freshness-dashboard",
      fix: "docs:freshness-dashboard",
    },
  ],
  openapi: [
    {
      artifact: "docs/02-engineering/api/openapi.json",
      check: "api:check-openapi",
      fix: "api:generate-openapi",
    },
  ],
};

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/** Групи, названі у argv (`--docs`, `--openapi`). Порядок — як у GROUPS. */
export function parseGroups(argv, groups = GROUPS) {
  const asked = new Set(
    argv.filter((a) => a.startsWith("--")).map((a) => a.slice(2)),
  );
  return Object.keys(groups).filter((name) => asked.has(name));
}

/**
 * Резолвить pnpm-скрипт у пару `[cmd, args]`, придатну для `spawn`.
 *
 * Прямий `node …`-скрипт запускаємо напряму: обгортка `pnpm` коштує
 * 200-400 ms на виклик, а тут їх до шести за коміт. Будь-яку іншу форму
 * (напр. `pnpm lint:x` як індирекція) віддаємо `pnpm` — правильність
 * важливіша за ці міліcекунди.
 */
export function resolveCommand(scriptName, scripts) {
  const raw = scripts?.[scriptName];
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(
      `pre-commit-derived-artifacts: у package.json немає скрипта "${scriptName}"`,
    );
  }
  const parts = raw.split(/\s+/);
  if (parts[0] === "node") {
    return { cmd: process.execPath, args: parts.slice(1) };
  }
  return { cmd: "pnpm", args: ["-s", scriptName] };
}

/** Текст, який бачить автор, коли щось розійшлось. */
export function formatFailure(failures) {
  const lines = [
    "",
    "✖ Похідні артефакти розійшлися з джерелом:",
    "",
    ...failures.map((f) => `    ${f.artifact}`),
    "",
    "  Перегенеруй і додай у коміт:",
    "",
    `    pnpm ${failures.map((f) => f.fix).join(" && pnpm ")}`,
    `    git add ${[...new Set(failures.map((f) => f.artifact.replace(/ \(.*\)$/, "")))].join(" ")}`,
    "",
    "  Ці ж перевірки стоять PR-гейтом — без них червонітиме CI, а не тільки цей хук.",
    "  Проміжний коміт: SERGEANT_NO_DERIVED_CHECK=1 git commit …",
    "",
  ];
  return lines.join("\n");
}

// ── Runtime ─────────────────────────────────────────────────────────────────

/** Per-stage timing для `scripts/pre-commit-timing.mjs`. Best-effort. */
function emitStageTiming(stage, ms) {
  const log = process.env.SERGEANT_TIMING_LOG;
  if (!log) return;
  try {
    appendFileSync(log, `${JSON.stringify({ stage, ms })}\n`);
  } catch {
    // Таймінг ніколи не блокує коміт.
  }
}

function runCheck(entry, scripts) {
  const { cmd, args } = resolveCommand(entry.check, scripts);
  return new Promise((done) => {
    const child = spawn(cmd, args, {
      cwd: REPO_ROOT,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => done({ entry, ok: false, stderr: String(err) }));
    child.on("close", (code) => done({ entry, ok: code === 0, stderr }));
  });
}

async function main() {
  if (process.env.SERGEANT_NO_DERIVED_CHECK === "1") return 0;

  const names = parseGroups(process.argv.slice(2));
  if (names.length === 0) {
    process.stderr.write(
      "pre-commit-derived-artifacts: очікую хоча б одну групу (--docs / --openapi)\n",
    );
    return 2;
  }

  const pkg = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
  );
  const entries = names.flatMap((name) => GROUPS[name]);

  const started = performance.now();
  const results = await Promise.all(
    entries.map((entry) => runCheck(entry, pkg.scripts)),
  );
  emitStageTiming(
    `derived:${names.join("+")}`,
    Math.round(performance.now() - started),
  );

  const failures = results.filter((r) => !r.ok).map((r) => r.entry);
  if (failures.length === 0) return 0;

  process.stderr.write(formatFailure(failures));
  return 1;
}

const isMain = resolve(process.argv[1] ?? "") === resolve(__filename);
if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(
        `pre-commit-derived-artifacts: ${err instanceof Error ? err.stack : err}\n`,
      );
      process.exit(1);
    });
}
