#!/usr/bin/env node
// Деплой фронта на Vercel без Git-інтеграції.
//
// AI-CONTEXT: Git-інтеграція Vercel тут не працює і не запрацює на безкоштовному
// тарифі. Hobby відмовляє репозиторіям, що належать workspace, а на Bitbucket усі
// репозиторії належать workspace, персональних поза ним не існує. Тому деплой
// лишається ручним, і цей скрипт існує, щоб він був однією командою, а не трьома
// з пам'яті. Деталі рішення - AGENTS.md § Де живе код.
//
// AI-DANGER: кожен запуск викочує ПРОД. Прев'ю тут немає навмисно: воно потребує
// саме тієї Git-інтеграції, якої немає.
//
// Три кроки нижче не переставляти і не скорочувати:
//   pull   тягне env продакшену в .vercel, без нього build бере чужі змінні;
//   build  збирає локально, щоб у deploy поїхав готовий .vercel/output;
//   deploy з --prebuilt шле лише той output. БЕЗ --prebuilt CLI пакує весь
//          монорепо і впирається в "Request body too large. Limit: 10mb".
//
// Запускати лише з кореня репо: CLI додає Root Directory проєкту відносно cwd,
// тож із apps/web шлях подвоюється і деплой падає. Тому cwd тут прибитий до
// кореня і не залежить від того, звідки викликали.

import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Чи підтверджує вивід `vercel deploy` готовий production-деплой.
 *
 * Код виходу CLI тут не доказ: 2026-09-26 при збої DNS до npm `deploy`
 * надрукував лише «Retrieving project…», вийшов із 0, і скрипт звітував
 * «Готово», хоча прод лишився старим. Тому успіх означає три факти з самого
 * виводу: URL деплою, `readyState: READY` і `target: production`. Зміниться
 * формат виводу CLI, і скрипт упаде голосно, а не збреше тихо.
 */
export function checkDeployOutput(out) {
  const url = out.match(/"url":\s*"(https:\/\/[^"]+)"/)?.[1];
  if (!url) return { ok: false, reason: "у виводі немає URL деплою" };
  if (!/"readyState":\s*"READY"/.test(out))
    return { ok: false, url, reason: "деплой не дійшов до стану READY" };
  if (!/"target":\s*"production"/.test(out))
    return { ok: false, url, reason: "деплой не має target=production" };
  return { ok: true, url };
}

/**
 * Чи прийме Vercel коміт від цього автора.
 *
 * CLI бере автора HEAD із локального git. Merge-коміти Bitbucket пише бот
 * (`…@bots.bitbucket.org`), він не учасник команди Vercel, і проєкт лендингу
 * такий деплой відхиляє (лист «Failed CLI deployment … not a member of the
 * team», 2026-09-26). CLI при цьому не падає, а висить. Web-проєкт того ж дня
 * приймав ті самі коміти, тож для нього це лише попередження.
 */
export function botAuthorProblem(email) {
  return /@bots\.bitbucket\.org$/i.test(email.trim())
    ? `автор HEAD-коміта бот Bitbucket (${email.trim()}), не учасник команди Vercel`
    : null;
}

// Крок deploy без ліміту висить, коли Vercel блокує деплой.
const DEPLOY_TIMEOUT_MS = 15 * 60 * 1000;

// ponytail: ID зашиті, бо вони не секрети і не змінюються; env-перевизначення
// лишене на випадок, коли проєкт перестворять.
const ORG_ID = process.env.VERCEL_ORG_ID || "team_A96p26fl8eTxCK74fXAWybql";
const TARGETS = {
  web: process.env.VERCEL_PROJECT_ID_WEB || "prj_WTfB58gEl6CKaLYGRz2SYOQzmnJQ",
  landing:
    process.env.VERCEL_PROJECT_ID_LANDING || "prj_pT84guUtiEIhLOQFQdi07cAd6tDw",
};

// Пін обов'язковий. 54.7.0 падає на власному багу (`Named export
// 'isPackageInstalled' not found`), а 54.10-54.12 не встановлюються взагалі:
// опубліковані із залежністю undici@^7.27.1, якої в реєстрі немає.
const CLI = "vercel@54.9.1";

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) main();

function main() {
  const target = process.argv[2];
  const projectId = TARGETS[target];

  if (!projectId) {
    const known = Object.keys(TARGETS).join(" | ");
    console.error(`Використання: node scripts/deploy-vercel.mjs <${known}>`);
    console.error(`Отримано: ${target ?? "(нічого)"}`);
    process.exit(1);
  }

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const env = {
    ...process.env,
    VERCEL_ORG_ID: ORG_ID,
    VERCEL_PROJECT_ID: projectId,
  };

  // npx на Windows це .cmd, без shell його не знаходить.
  const opts = { cwd: repoRoot, env, shell: process.platform === "win32" };

  function run(args) {
    console.log(`\n> npx ${CLI} ${args.join(" ")}`);
    execFileSync("npx", ["--yes", CLI, ...args], { ...opts, stdio: "inherit" });
  }

  // Вивід `deploy` потрібен рядком для перевірки, а CLI ділить його між
  // stdout і stderr, тож перехоплюються обидва й дублюються в консоль.
  function runCaptured(args) {
    console.log(`\n> npx ${CLI} ${args.join(" ")}`);
    const r = spawnSync("npx", ["--yes", CLI, ...args], {
      ...opts,
      stdio: ["inherit", "pipe", "pipe"],
      encoding: "utf8",
      timeout: DEPLOY_TIMEOUT_MS,
    });
    process.stdout.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
    if (r.error?.code === "ETIMEDOUT") {
      console.error(
        `\nКрок deploy висів понад ${DEPLOY_TIMEOUT_MS / 60000} хв і зупинений. ` +
          `Найчастіше Vercel заблокував деплой: перевір пошту від Vercel.`,
      );
      process.exit(1);
    }
    if (r.status !== 0) {
      console.error(`\nКрок deploy завершився з кодом ${r.status}.`);
      process.exit(1);
    }
    return `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  }

  const author = execFileSync("git", ["log", "-1", "--format=%ae"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const authorProblem = botAuthorProblem(author);
  if (authorProblem) {
    const hint =
      "Зроби в detached-копії main порожній локальний коміт від себе " +
      "(git commit --allow-empty, не пушити) і запусти деплой звідти.";
    if (target === "landing") {
      console.error(`Деплой лендингу зупинено: ${authorProblem}. ${hint}`);
      process.exit(1);
    }
    console.warn(`Увага: ${authorProblem}. Якщо Vercel відхилить: ${hint}`);
  }

  console.log(`Деплой "${target}" у продакшн (project ${projectId}).`);
  run(["pull", "--yes", "--environment=production"]);
  run(["build", "--prod"]);
  console.log(
    "\n> node scripts/ci/check-e2e-seed-boundary.mjs .vercel/output/static/assets",
  );
  execFileSync(
    "node",
    ["scripts/ci/check-e2e-seed-boundary.mjs", ".vercel/output/static/assets"],
    { cwd: repoRoot, stdio: "inherit" },
  );
  const result = checkDeployOutput(
    runCaptured(["deploy", "--prebuilt", "--prod"]),
  );
  if (!result.ok) {
    console.error(
      `\nДеплой НЕ підтверджено: ${result.reason}. Прод, найпевніше, лишився старим. ` +
        `Перевір мережу й запусти ще раз; стан покаже pnpm deploy:status.`,
    );
    process.exit(1);
  }
  console.log(`\nГотово: ${result.url} (production, READY).`);
}
