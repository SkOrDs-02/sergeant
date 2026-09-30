#!/usr/bin/env node
// Чи відстає прод від main. Нічого не деплоїть; єдина побічна дія - рухає ref
// `main` у трунку (див. refreshTrunkMain нижче), робочих дерев не чіпає.
//
// AI-CONTEXT: бекенд автодеплоїться джобою `deploy-api` у ci.yml лише після
// зелених обовʼязкових джоб (ADR-0101), бо міграції їдуть в ENTRYPOINT образу.
// Скрипт показує, чи той деплой справді доїхав (або був пропущений), і стан
// фронта, який і далі ручний. Деталі - AGENTS.md § «Прод не оновлюється сам».
//
// Токени НЕ передаються аргументами і не згадуються в командному рядку: скрипт
// читає їх сам із .env основного клону. Це не тільки гігієна, а й практична
// потреба - гейт дозволів у сесіях ріже команди, що згадують імена токенів.
//
// Джерела правди різні для двох поверхонь, і це не примха:
//   бекенд - Coolify знає ТОЧНИЙ коміт останнього деплою;
//   фронт  - Vercel деплоїться локальним CLI без Git-інтеграції, тож коміт там
//            не зберігається взагалі, і лишається порівняння за часом.
// Тому вердикт по бекенду точний, а по фронту це оцінка. Так і підписано у виводі.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { refreshTrunkMain } from "./lib/refresh-trunk-main.mjs";

const ENV_PATH = "D:\\Sergeant\\.env";
const COOLIFY_APP_UUID = "hlyvmjeoqa31w6mewpfg9qgc";
const VERCEL_TEAM = "team_A96p26fl8eTxCK74fXAWybql";
const VERCEL_PROJECTS = {
  web: "prj_WTfB58gEl6CKaLYGRz2SYOQzmnJQ",
  landing: "prj_pT84guUtiEIhLOQFQdi07cAd6tDw",
};

// Які шляхи роблять деплой потрібним. Поверхні навмисно ширші за самі застосунки:
// зміна в db-schema або api-client доїжджає в прод через збірку.
const BACKEND_PATHS = ["apps/server", "packages/db-schema", "Dockerfile.api"];
const WEB_PATHS = ["apps/web", "packages/api-client", "packages/design-tokens"];
const LANDING_PATHS = ["apps/landing"];

function readEnv(name) {
  const line = readFileSync(ENV_PATH, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} не знайдено в ${ENV_PATH}`);
  return line.slice(name.length + 1).trim();
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function json(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${url.replace(/\?.*/, "")}`);
  return res.json();
}

function countCommits(fromRef, paths) {
  return Number(
    git(["rev-list", "--count", `${fromRef}..origin/main`, "--", ...paths]),
  );
}

function commitsSince(unixSeconds, paths) {
  const out = git([
    "rev-list",
    "--count",
    `--since=${unixSeconds}`,
    "origin/main",
    "--",
    ...paths,
  ]);
  return Number(out);
}

async function backendStatus() {
  const base = readEnv("COOLIFY_URL").replace(/\/$/, "");
  const token = readEnv("COOLIFY_TOKEN");
  const data = await json(
    `${base}/api/v1/deployments/applications/${COOLIFY_APP_UUID}`,
    token,
  );
  const finished = (data.deployments ?? []).filter(
    (d) => d.status === "finished",
  );
  if (finished.length === 0)
    return { name: "бекенд", detail: "історія деплоїв порожня", stale: null };

  const last = finished[0];
  const sha = last.commit;
  let known = true;
  try {
    git(["cat-file", "-e", sha]);
  } catch {
    known = false;
  }
  if (!known) {
    return {
      name: "бекенд",
      detail: `прод на ${sha.slice(0, 9)}, якого немає локально`,
      stale: null,
    };
  }

  const all = countCommits(sha, ["."]);
  const mine = countCommits(sha, BACKEND_PATHS);
  return {
    name: "бекенд",
    detail: `прод на ${sha.slice(0, 9)} (${last.created_at?.slice(0, 10)}), main попереду на ${all} комітів, з них ${mine} по бекенду`,
    stale: mine > 0,
    exact: true,
  };
}

async function vercelStatus(label, projectId, paths) {
  const token = readEnv("VERCEL");
  const url = `https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${VERCEL_TEAM}&limit=1&target=production&state=READY`;
  const data = await json(url, token);
  const last = data.deployments?.[0];
  if (!last)
    return { name: label, detail: "готових прод-деплоїв немає", stale: null };

  const seconds = Math.floor(last.created / 1000);
  const since = commitsSince(seconds, paths);
  const when = new Date(last.created)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
  return {
    name: label,
    detail: `останній деплой ${when} UTC, після нього ${since} комітів по його поверхнях`,
    stale: since > 0,
    exact: false,
  };
}

git(["fetch", "origin", "--quiet"]);

// Те саме робить pre-push хук, але покладатися лише на нього не можна: він лежить
// у робочому дереві ТРУНКУ, тож коли трунк застарів, файла там немає і хук не
// виконується взагалі. Замкнене коло розривається саме тут, бо цей скрипт
// запускається з worktree і від Husky не залежить.
const trunk = refreshTrunkMain();

// Мовчазна операція, яку ніхто не бачить, з часом перестає працювати непомітно -
// саме так сталося з хуком. Тому результат називається вголос.
const TRUNK_NOTE = {
  "ff-merged": "трунк: підтягнутий разом із файлами (хуки свіжі)",
  "ref-updated":
    "трунк: оновлено ref main, але файли старі, тож хуки звідти не діють",
  dirty: "трунк: є незакомічені зміни, не чіпав",
  skipped: "трунк: оновити не вдалось",
};
console.log(TRUNK_NOTE[trunk] ?? `трунк: ${trunk}`);

const results = [];
for (const task of [
  () => backendStatus(),
  () => vercelStatus("фронт (web)", VERCEL_PROJECTS.web, WEB_PATHS),
  () => vercelStatus("лендинг", VERCEL_PROJECTS.landing, LANDING_PATHS),
]) {
  try {
    results.push(await task());
  } catch (err) {
    results.push({
      name: "?",
      detail: `не вдалось перевірити: ${err.message}`,
      stale: null,
    });
  }
}

let anyStale = false;
for (const r of results) {
  const mark = r.stale === null ? "?" : r.stale ? "ВІДСТАЄ" : "свіжий";
  const note =
    r.exact === false && r.stale ? " (оцінка за часом, не за комітом)" : "";
  console.log(`${mark.padEnd(8)} ${r.name}: ${r.detail}${note}`);
  if (r.stale) anyStale = true;
}

if (anyStale) {
  console.log(
    "\nВикотити: pnpm deploy:api -- --yes (спершу бекенд), далі pnpm deploy:web -- --yes / pnpm deploy:landing -- --yes.",
  );
}
process.exit(0);
