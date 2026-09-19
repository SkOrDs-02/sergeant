#!/usr/bin/env node
// scripts/check-canonical-hosts.mjs
//
// Гейт на РОЗХОДЖЕННЯ двох списків прод-походжень.
//
// **Що сталося.** Сервер знає справжні прод-origin-и (`PROD_ORIGINS` у
// `apps/server/src/http/cors.ts`) — саме за ними він віддає credentialed CORS.
// Веб має СВІЙ список канонічних хостів (`DEFAULT_CANONICAL_HOSTS` у
// `apps/web/src/core/observability/deployEnvironment.ts`) — за ним резолвиться
// `environment` для Sentry і PostHog. Списки зажили окремо: продакшн переїхав
// на `app.sergeant.com.ua`, сервер про це дізнався, веб — ні.
//
// Ціна мовчання (замір 2026-09-17 по Sentry): **248 із 264 подій веба за 30
// днів, тобто 94%, приїхали з міткою `preview`** — серед них увесь потік
// `SQLITE_IOERR` на 38 користувачів. Фільтр по `production` показував 16 подій
// і читався як тиша. Класифікатор працював рівно так, як написаний; неправдою
// був його вхід.
//
// **Чому гейт, а не «просто не забувати».** Розходження не має жодного
// симптому в рантаймі: обидва списки валідні самі по собі, CORS пускає,
// сторінка працює, події йдуть. Видно його лише в дашборді — і лише тому, хто
// вже запідозрив. Тобто це рівно той клас дефекту, який ловиться тільки
// механічно.
//
// **Інваріант.** Кожен host із серверних `PROD_ORIGINS` має бути в
// `DEFAULT_CANONICAL_HOSTS` веба. Зворотне НЕ вимагається: веб законно тримає
// хости, яким сервер не віддає CORS (наприклад лендинг `sergeant-landing`,
// який до API не ходить), і вимагати їх у `PROD_ORIGINS` означало б
// розширювати credentialed CORS заради телеметрії.
//
// Запуск: `node scripts/check-canonical-hosts.mjs`

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CORS_FILE = join(ROOT, "apps/server/src/http/cors.ts");
const ENV_FILE = join(
  ROOT,
  "apps/web/src/core/observability/deployEnvironment.ts",
);

/**
 * Тіло масиву `<name> = [ … ]` без коментарів.
 *
 * Коментарі гасяться навмисно: усередині обох списків законно згадують домени
 * ПРИКЛАДАМИ (`cors.ts` показує зразок regex-у з `sergeant-git-…`), і рядок із
 * прикладу читався б як справжній запис. Гейт, що ловить власні коментарі,
 * гірший за відсутній — він змушує додавати в allowlist те, чого в коді немає.
 */
export function parseArrayLiterals(src, name) {
  const start = src.indexOf(`${name} = [`);
  if (start < 0) return null;
  const end = src.indexOf("]", start);
  if (end < 0) return null;
  const body = src
    .slice(start, end)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** `https://app.sergeant.com.ua` → `app.sergeant.com.ua`. */
export function toHost(origin) {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return origin.toLowerCase();
  }
}

/**
 * Прод-походження сервера, яких веб не вважає канонічними.
 *
 * Напрямок перевірки однобічний навмисно: веб законно тримає хости, яким
 * сервер не віддає CORS (лендинг до API не ходить), і вимагати їх у
 * `PROD_ORIGINS` означало б розширювати credentialed CORS заради телеметрії.
 */
export function findMissingHosts(prodOrigins, canonicalHosts) {
  const canonical = new Set(canonicalHosts.map((h) => h.toLowerCase()));
  return prodOrigins.map(toHost).filter((host) => !canonical.has(host));
}

function readList(file, name) {
  const parsed = parseArrayLiterals(readFileSync(file, "utf8"), name);
  if (parsed === null) {
    console.error(
      `❌ ${file}: не знайдено ${name} — гейт розсинхронізовано з кодом.`,
    );
    process.exit(1);
  }
  return parsed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prodOrigins = readList(CORS_FILE, "PROD_ORIGINS");
  const canonicalHosts = readList(ENV_FILE, "DEFAULT_CANONICAL_HOSTS");

  if (prodOrigins.length === 0 || canonicalHosts.length === 0) {
    console.error("❌ Один зі списків порожній — так гейт нічого не стереже.");
    process.exit(1);
  }

  const missing = findMissingHosts(prodOrigins, canonicalHosts);

  if (missing.length > 0) {
    console.error(
      `\n❌ Прод-походження є в сервері, але не в канонічних хостах веба: ${missing.join(", ")}\n`,
    );
    console.error(
      "Наслідок НЕ в тому, що щось зламається — усе працюватиме. Наслідок у тому,\n" +
        "що події з цих хостів поїдуть у Sentry і PostHog під міткою `preview`, і\n" +
        "фільтр по `production` показуватиме тишу замість реальних помилок\n" +
        "(так уже було: 94% подій веба за 30 днів, знахідка 2026-09-17).\n\n" +
        "Полагодь: додай хост у DEFAULT_CANONICAL_HOSTS\n" +
        "(apps/web/src/core/observability/deployEnvironment.ts).\n" +
        "Домен справді не має давати production-телеметрії? Прибери його з\n" +
        "PROD_ORIGINS — тоді йому й credentialed CORS не потрібен.\n",
    );
    process.exit(1);
  }

  console.log(
    `🔍 Канонічні хости: ${prodOrigins.length} прод-походжень сервера, ` +
      `${canonicalHosts.length} канонічних хостів веба.\n✅ Розходжень немає.`,
  );
}
