#!/usr/bin/env node
// scripts/check-vite-flag-registry.mjs
//
// Гейт реєстру `VITE_*`: кожна змінна, яку код СПРАВДІ читає, мусить бути
// описана в одному з двох канонів —
//   • `docs/engineering/architecture/feature-flags.md` — тумблери
//     («що ламається при протилежному значенні», «умова зняття»);
//   • `docs/engineering/integrations/env-vars.md` — значення (URL-и,
//     ключі, пресети, шляхи збірки).
//
// **Навіщо.** Головне правило самого реєстру: «прапорець без записаної
// умови зняття — це технічний борг із дня народження». Недокументований
// тумблер цієї умови не має взагалі, і саме так у репо двічі знаходили
// мертві прапорці. Знахідка PR-T4, аудит 2026-09-13.
//
// **Що саме відсіює фантоми — і чому це не те, що здається.** Сирий греп
// `VITE_[A-Z_]+` по дереву дає два хибні імені:
//
//   • `VITE_API_URL` — не існує як змінна взагалі. Єдина згадка в усьому
//     репо — коментар у тесті, який називає неіснуюче імʼя (справжнє —
//     `VITE_API_BASE_URL`).
//   • `VITE_VOICE_PROVIDER` — назва є, читання немає:
//     `resolveConfiguredProvider()` повертає `"auto"` літералом, а env-оверайд
//     «was never wired in any environment».
//
// Обидва відсіює НЕ форма патернів, а `stripComments()` плюс пропуск
// `*.test.*` — це перевірено зламом: підміна патернів на голе
// `/(VITE_[A-Z0-9_]+)/g` лишає гейт зеленим. Записую це прямо, бо перша
// версія цього коментаря приписувала заслугу патернам, і то була неправда.
//
// Патерни читання (`import.meta.env.X`, `import.meta.env["X"]`, `env.X` у
// `vite.config.js`) потрібні для іншого: імʼя всередині рядкового літерала,
// таблиці чи ключа обʼєкта — не читання змінної, і вимагати на нього доку
// означало б ганяти автора за згадку. Структуру патернів пінить тест.
//
// Запуск: `node scripts/check-vite-flag-registry.mjs`
//         `--json` — машинний вивід для CI.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const WEB = join(ROOT, "apps/web");
const FLAGS_DOC = join(ROOT, "docs/engineering/architecture/feature-flags.md");
const ENV_DOC = join(ROOT, "docs/engineering/integrations/env-vars.md");

/**
 * Змінні, які код читає, але описувати в канонах не треба.
 *
 * Порожній навмисно: у момент введення гейта жодна з 20 прочитаних змінних
 * не потребувала винятку. Рядок сюди додають РАЗОМ із причиною — інакше
 * список стає тихим способом обійти правило, замість якого гейт і стоїть.
 */
const EXEMPT = new Map([]);

/** `import.meta.env.FOO`, `import.meta.env["FOO"]`, `env.FOO` у vite.config. */
const READ_PATTERNS = [
  /import\.meta\.env\s*\??\.\s*(VITE_[A-Z0-9_]+)/g,
  /import\.meta\.env\s*\??\.?\s*\[\s*["'](VITE_[A-Z0-9_]+)["']\s*\]/g,
  /\benv\.(VITE_[A-Z0-9_]+)/g,
];

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".vite")
      continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
      continue;
    }
    if (!/\.(?:tsx?|jsx?|mjs)$/.test(entry)) continue;
    // Тести стабають змінні, яких продакшн не читає (`vi.stubEnv`), тож
    // рахувати їх означало б вимагати доку на тестову фікстуру.
    if (entry.includes(".test.") || entry.includes(".stories.")) continue;
    out.push(full);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const reads = new Map(); // name -> Set<file:line>
for (const file of collect(WEB)) {
  const raw = readFileSync(file, "utf8");
  const code = stripComments(raw);
  const lines = code.split("\n");
  for (const [i, line] of lines.entries()) {
    for (const rx of READ_PATTERNS) {
      rx.lastIndex = 0;
      let m;
      while ((m = rx.exec(line)) !== null) {
        const name = m[1];
        if (!reads.has(name)) reads.set(name, new Set());
        reads.get(name).add(`${relative(ROOT, file)}:${i + 1}`);
      }
    }
  }
}

const flagsDoc = readFileSync(FLAGS_DOC, "utf8");
const envDoc = readFileSync(ENV_DOC, "utf8");

const missing = [];
for (const [name, sites] of [...reads].sort()) {
  if (EXEMPT.has(name)) continue;
  if (flagsDoc.includes(name) || envDoc.includes(name)) continue;
  missing.push({ name, sites: [...sites].sort() });
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ read: reads.size, missing }, null, 2));
} else {
  console.log(`🔍 Реєстр VITE_*: прочитано ${reads.size} змінних у apps/web.`);
  if (missing.length === 0) {
    console.log("\n✅ Кожна описана у feature-flags.md або env-vars.md.\n");
  } else {
    console.error(`\n❌ Не описані в жодному каноні: ${missing.length}\n`);
    for (const { name, sites } of missing) {
      console.error(`  ${name}`);
      for (const s of sites) console.error(`      ${s}`);
    }
    console.error(
      "\nТумблер (вмикає/вимикає поведінку) → docs/engineering/architecture/feature-flags.md,\n" +
        "  і обовʼязково з УМОВОЮ ЗНЯТТЯ — правило самого реєстру.\n" +
        "Значення (URL, ключ, пресет, шлях) → docs/engineering/integrations/env-vars.md.\n",
    );
  }
}

process.exit(missing.length === 0 ? 0 : 1);
