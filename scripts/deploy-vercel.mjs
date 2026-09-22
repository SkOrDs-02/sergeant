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

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function run(args) {
  console.log(`\n> npx ${CLI} ${args.join(" ")}`);
  execFileSync("npx", ["--yes", CLI, ...args], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    // npx на Windows це .cmd, без shell execFileSync його не знаходить.
    shell: process.platform === "win32",
  });
}

console.log(`Деплой "${target}" у продакшн (project ${projectId}).`);
run(["pull", "--yes", "--environment=production"]);
run(["build", "--prod"]);
run(["deploy", "--prebuilt", "--prod"]);
console.log(
  `\nГотово. Перевір: npx ${CLI} inspect <url> має дати target=production і status=Ready.`,
);
