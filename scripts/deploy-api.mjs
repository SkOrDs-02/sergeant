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

import { readFileSync } from "node:fs";

const ENV_PATH = "D:\\Sergeant\\.env";
const APP_UUID = "hlyvmjeoqa31w6mewpfg9qgc";

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

async function json(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { ...auth, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
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
