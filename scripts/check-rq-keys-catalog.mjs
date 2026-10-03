#!/usr/bin/env node
/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Звіряє СПИСОК фабрик RQ-ключів у документації з тим, що реально
 * експортує `apps/web/src/shared/lib/api/queryKeys.ts`.
 *
 * Існує через конкретний дрейф: фабрика `silpoKeys` жила в коді з серпня,
 * а обидва каталоги (`AGENTS.md` і `apps/web/AGENTS.md`) перелічували 11
 * фабрик із 12. Знайшов це аудит, не гейт — тобто випадково.
 *
 * Чому це не косметика. Обидва списки — навігація під Hard Rule #2 («ключі
 * лише через централізовані фабрики»). Агент або людина, яка звіряється зі
 * списком і не бачить там своєї поверхні, робить природний висновок:
 * фабрики немає, отже можна інлайн-ключ. Неповний каталог не просто
 * застарілий — він активно вчить порушувати правило, яке сам описує.
 *
 * Перевірка навмисно тупа: множина імен, а не порядок і не форматування.
 * Порядок у двох файлах різний і це нормально.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "apps/web/src/shared/lib/api/queryKeys.ts";
const CATALOGS = ["AGENTS.md", "apps/web/AGENTS.md"];

function read(rel) {
  return readFileSync(resolve(root, rel), "utf-8");
}

const actual = new Set(
  [...read(SOURCE).matchAll(/^export const (\w+Keys)\b/gm)].map((m) => m[1]),
);
if (actual.size === 0) {
  console.error(
    `[rq-keys-catalog] у ${SOURCE} не знайдено жодної фабрики — зламався сам парсер, а не каталог`,
  );
  process.exit(1);
}

let failed = false;
for (const catalog of CATALOGS) {
  const text = read(catalog);
  // Беремо лише імена в бектиках: інакше згадка фабрики у прозі зарахується
  // як «є в каталозі», і перевірка почне вважати документованим те, що
  // просто десь названо.
  const listed = new Set([...text.matchAll(/`(\w+Keys)`/g)].map((m) => m[1]));
  const missing = [...actual].filter((k) => !listed.has(k));
  const extra = [...listed].filter((k) => !actual.has(k));
  if (missing.length > 0) {
    failed = true;
    console.error(
      `[rq-keys-catalog] ${catalog}: не перелічено ${missing.join(", ")} — каталог, у якому немає твоєї поверхні, штовхає писати інлайн-ключ (Hard Rule #2)`,
    );
  }
  if (extra.length > 0) {
    failed = true;
    console.error(
      `[rq-keys-catalog] ${catalog}: перелічено неіснуючі ${extra.join(", ")} — фабрику прибрали з коду, а з каталогу ні`,
    );
  }
}

if (failed) process.exit(1);
console.log(
  `[rq-keys-catalog] ✅ ${actual.size} фабрик, обидва каталоги збігаються.`,
);
