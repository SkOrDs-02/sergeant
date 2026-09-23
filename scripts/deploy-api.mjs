#!/usr/bin/env node
// Викотити бекенд: тригерить деплой застосунку sergeant-api-v2 у Coolify і чекає результат.
//
// AI-DANGER: це прод. Міграції їдуть в ENTRYPOINT образу
// (`node dist-server/migrate.js && exec node dist-server/index.js`), тому деплой
// застосовує схему з НОВОГО коду ще до старту сервера. Перед запуском переконайся,
// що зміни перевірені: CI, який міг би це прикрити, не існує.
//
// Порядок відносно фронта: спершу бекенд, потім Vercel. Інакше свіжий фронт
// якийсь час говоритиме зі старим API.
//
// Токен читається з .env, а не передається аргументом: у командному рядку його
// бути не повинно, і гейт дозволів у сесіях ріже команди, що згадують імена токенів.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ENV_PATH = "D:\\Sergeant\\.env";
const APP_UUID = "hlyvmjeoqa31w6mewpfg9qgc";

// Pre-flight: ENTRYPOINT прожене ці міграції на живій БД (див. AI-DANGER
// вище) - деплой з порушенням нумерації чи без two-phase DROP тут не
// зупинити пізніше, тож ловимо його до POST-у в Coolify.
const migrationsLint = spawnSync(
  process.execPath,
  ["scripts/lint-migrations.mjs"],
  { stdio: "inherit" },
);
if (migrationsLint.status !== 0) {
  console.error(
    "\nДеплой скасовано: lint-migrations.mjs червоний. Виправ міграції перед деплоєм.",
  );
  process.exit(1);
}

// Білд на сервері ~225 с (двоядерна машина, потребує swap). Стеля з запасом.
const TIMEOUT_MS = 15 * 60 * 1000;
const POLL_MS = 15_000;

function readEnv(name) {
  const line = readFileSync(ENV_PATH, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} не знайдено в ${ENV_PATH}`);
  return line.slice(name.length + 1).trim();
}

const base = readEnv("COOLIFY_URL").replace(/\/$/, "");
const token = readEnv("COOLIFY_TOKEN");
const auth = { Authorization: `Bearer ${token}` };

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

// Привести дзеркало Hetzner до стану main на Bitbucket. Свідомо БЕЗ force:
// якщо пуш відхилено, дзеркало має коміти, яких немає на Bitbucket (так буває,
// коли сесія не змогла створити PR і запушила роботу прямо в нього). Затирати
// їх не можна - їх треба звести злиттям, і скрипт зупиняється, щоб це зробили.
function syncMirror() {
  git(["fetch", "origin", "--quiet"]);
  git(["fetch", "hetzner", "--quiet"]);

  const behind = Number(
    git(["rev-list", "--count", "hetzner/main..origin/main"]),
  );
  const ahead = Number(
    git(["rev-list", "--count", "origin/main..hetzner/main"]),
  );

  if (ahead > 0) {
    console.error(`Дзеркало має ${ahead} комітів, яких немає на Bitbucket:`);
    console.error(git(["log", "--oneline", "origin/main..hetzner/main"]));
    console.error(
      "\nЦе чиясь робота, що не доїхала в PR. Зведи її злиттям, не затирай:",
    );
    console.error(
      "  git checkout -b <гілка> origin/main && git merge hetzner/main",
    );
    process.exit(1);
  }

  if (behind === 0) {
    console.log("Дзеркало вже збігається з main.");
    return;
  }

  console.log(`Дзеркало відстає на ${behind} комітів, підтягую.`);
  git(["push", "hetzner", "origin/main:main"]);
}

async function json(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { ...auth, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

// Coolify тягне НЕ з Bitbucket, а з bare-репо на Hetzner, і саме тут ховається
// найпідступніша пастка цього ланцюга. Merge PR відбувається на сервері Bitbucket,
// тож merge-коміти `main` існують ТІЛЬКИ там: `origin` з двома push-адресами
// реплікує гілки, але не результат злиття. Без цього кроку Coolify збирає
// попередній стан, чесно рапортує "finished" за 17 секунд, і виглядає це як
// успішний деплой. 2026-09-23 так було двічі поспіль, поки не звірили дзеркало.
syncMirror();

// `--sync-only` існує, щоб синхронізацію можна було перевірити, не викочуючи прод.
if (process.argv[2] === "--sync-only") {
  console.log("Зупиняюсь: --sync-only.");
  process.exit(0);
}

// Саме POST. GET віддає 405 «This endpoint has changed to a POST request»:
// у старих версіях Coolify цей ендпоінт був GET, і приклади в мережі досі такі.
const started = await json(`${base}/api/v1/deploy?uuid=${APP_UUID}`, {
  method: "POST",
});
const queued = started.deployments?.[0];
console.log(
  `Деплой поставлено в чергу${queued?.deployment_uuid ? `: ${queued.deployment_uuid}` : ""}.`,
);
console.log("Білд на сервері займає близько 4 хвилин.");

const deadline = Date.now() + TIMEOUT_MS;
let lastStatus = "";

while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, POLL_MS));

  const data = await json(
    `${base}/api/v1/deployments/applications/${APP_UUID}`,
  );
  const latest = data.deployments?.[0];
  if (!latest) continue;

  if (latest.status !== lastStatus) {
    lastStatus = latest.status;
    console.log(
      `  ${new Date().toISOString().slice(11, 19)}  ${latest.status}`,
    );
  }

  if (latest.status === "finished") {
    console.log(`\nГотово: ${latest.commit?.slice(0, 9)}`);
    // Health не доводить, що поїхав новий код (віддає просто "ok"), але доводить,
    // що контейнер піднявся і міграції не впали. Це той доказ, який тут можливий.
    const res = await fetch("https://api.sergeant.com.ua/health");
    console.log(`/health -> ${res.status} ${await res.text()}`);
    process.exit(res.ok ? 0 : 1);
  }

  if (latest.status === "failed" || latest.status === "cancelled") {
    console.error(
      `\nДеплой ${latest.status}. Лог: ${base}/project/.../deployment/${latest.deployment_uuid}`,
    );
    process.exit(1);
  }
}

console.error(
  `\nНе дочекався за ${TIMEOUT_MS / 60000} хв. Перевір Coolify вручну.`,
);
process.exit(1);
