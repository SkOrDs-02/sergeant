#!/usr/bin/env node
// scripts/check-inline-error-responses.mjs
//
// Бюджетний гейт на ІНЛАЙНОВІ ERROR-ВІДПОВІДІ, що обходять центральний
// `apps/server/src/http/errorHandler.ts`.
//
// **Що не так.** Хендлер зразковий: стабільне тіло
// `{error, message, code, requestId, details?}`, розділення operational /
// programmer, `redactSensitiveUrl`, Sentry лише на 5xx-не-operational,
// лічильник `appErrorsTotal`. Але третина серверних поверхонь відповідає
// повз нього — `res.status(4xx).json({ error: "…" })` просто в хендлері.
// Тоді клієнт не може розрізнити помилку за `code`, користувач не має
// `requestId` для тікета, і подія не потрапляє ні в метрику, ні в
// структурований лог. Знахідка PR-T3, аудит 2026-09-13.
//
// **Express 5 робить лікування дешевим.** Reject з async-хендлера сам їде в
// error-handler, тож `throw new ValidationError("…")` замість
// `res.status(400).json(...)` — це один рядок, без обгортки `asyncHandler`
// (її в репо немає і не треба).
//
// **Чому бюджет, а не нуль.** Три роди місць лишаються інлайновими законно,
// і кожен має причину, а не звичку:
//
//   • ВЕБХУКИ з чужим контрактом тіла. Telegram читає `{ok:false}`, і
//     підмінити його на наше тіло означає зламати інтеграцію.
//   • ВЕБХУКИ з навмисно скупою відповіддю. `mono/webhook.ts` віддає
//     `{error:"Not found"}` на невалідний секрет у шляху — детальніша
//     відповідь підказала б, чи існує такий шлях.
//   • MIDDLEWARE, що вирішує ДО хендлера (`requireSession` і сусіди). Воно
//     й так віддає `code`; це не борг, а інша точка в конвеєрі.
//
// Перші два роди в `EXEMPT_FILES` нижче. Middleware НЕ виключене: воно
// потрапляє в лічильник `requestId`, і це чесно — `req.requestId` там
// доступний, просто не проставлений.
//
// **Дві цифри, обидві ходять лише вниз.**
//   `code`      — скільки місць не дають клієнтові коду помилки. Головна.
//   `requestId` — скільки не дають користувачеві чим підперти тікет.
//
// Запуск: `node scripts/check-inline-error-responses.mjs`
//         `--json`   — машинний вивід
//         `--update` — переписати baseline (лише коли борг ЗМЕНШИВСЯ)

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "apps/server/src");
const BUDGET_FILE = join(ROOT, ".tech-debt/inline-error-responses-budget.json");

/**
 * Файли, де інлайнове тіло помилки — вимога, а не борг.
 *
 * Рядок сюди додають РАЗОМ із причиною: без неї список стає тихим способом
 * обійти гейт замість того, щоб полагодити контракт.
 */
const EXEMPT_FILES = new Map([
  [
    "routes/telegram-webhook.ts",
    "Telegram Bot API читає рівно `{ok:false}` — наше тіло зламало б інтеграцію",
  ],
  [
    "modules/mono/webhook.ts",
    "скупа відповідь навмисна: детальніша підказала б, чи існує секретний шлях",
  ],
  [
    "http/errorHandler.ts",
    "це і є сам хендлер — його власна відповідь і є канонічним тілом",
  ],
]);

/** `res.status(<що завгодно>).json(` з можливими переносами рядка. */
const CALL =
  /res\s*\n?\s*\.status\(\s*(\d{3}|[A-Za-z_$][\w$.]*)\s*\)\s*\n?\s*\.json\(/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.ts$/.test(entry) || /\.test\.ts$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/** Тіло виклику `.json(…)` — баланс дужок від позиції після відкритої. */
function callBody(src, from) {
  let i = from;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    i++;
  }
  return src.slice(from, i - 1);
}

const sites = [];
for (const file of walk(SRC)) {
  const rel = relative(SRC, file);
  if (EXEMPT_FILES.has(rel)) continue;
  const src = readFileSync(file, "utf8");
  CALL.lastIndex = 0;
  let m;
  while ((m = CALL.exec(src)) !== null) {
    const status = m[1];
    // Числовий 2xx/3xx — це успішна відповідь, не наша тема. Динамічний
    // статус (змінна) лишаємо: він майже завжди про помилку, а пропустити
    // борг гірше, ніж полічити зайве.
    if (/^\d+$/.test(status) && Number(status) < 400) continue;
    const body = callBody(src, CALL.lastIndex);
    sites.push({
      file: rel,
      line: src.slice(0, m.index).split("\n").length,
      hasCode: /\bcode\s*:/.test(body),
      hasRequestId: /requestId/.test(body),
    });
  }
}

const noCode = sites.filter((s) => !s.hasCode);
const noRequestId = sites.filter((s) => !s.hasRequestId);
const actual = { code: noCode.length, requestId: noRequestId.length };

const budget = JSON.parse(readFileSync(BUDGET_FILE, "utf8"));
const worse = Object.keys(actual).filter((k) => actual[k] > budget[k]);
const better = Object.keys(actual).filter((k) => actual[k] < budget[k]);

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        sites: sites.length,
        actual,
        budget: { code: budget.code, requestId: budget.requestId },
        worse,
        better,
      },
      null,
      2,
    ),
  );
  process.exit(worse.length === 0 ? 0 : 1);
}

if (process.argv.includes("--update")) {
  if (worse.length > 0) {
    console.error(
      `❌ --update лише коли борг зменшився: ${worse
        .map((k) => `${k} ${actual[k]} > ${budget[k]}`)
        .join(", ")}.`,
    );
    process.exit(1);
  }
  writeFileSync(
    BUDGET_FILE,
    JSON.stringify({ ...budget, ...actual }, null, 2) + "\n",
  );
  console.log(
    `✅ baseline оновлено: без code ${actual.code}, без requestId ${actual.requestId}.`,
  );
  process.exit(0);
}

console.log(
  `🔍 Інлайнових error-відповідей у apps/server/src: ${sites.length}. ` +
    `Без code ${actual.code} (бюджет ${budget.code}), без requestId ${actual.requestId} (бюджет ${budget.requestId}).`,
);

if (worse.length > 0) {
  console.error(
    `\n❌ Борг зріс: ${worse.map((k) => `${k} ${actual[k]} > ${budget[k]}`).join(", ")}\n`,
  );
  const offenders = worse.includes("code") ? noCode : noRequestId;
  const byFile = new Map();
  for (const s of offenders)
    byFile.set(s.file, [...(byFile.get(s.file) ?? []), s.line]);
  for (const [f, lines] of [...byFile].sort()) {
    console.error(`  ${f}: ${lines.join(", ")}`);
  }
  console.error(
    "\nExpress 5 веде reject з async-хендлера прямо в errorHandler, тож замість\n" +
      '`res.status(400).json({ error: "…" })` пиши `throw new ValidationError("…")`\n' +
      "(підкласи — у apps/server/src/obs/errors.ts). Код, requestId, метрика й\n" +
      "структурований лог приходять безкоштовно.\n" +
      "Тіло справді мусить бути іншим (чужий контракт вебхука)? Додай файл у\n" +
      "EXEMPT_FILES РАЗОМ із причиною.\n",
  );
  process.exit(1);
}

console.log("\n✅ Борг не зріс.");
if (better.length > 0) {
  console.log(
    `   Зменшився (${better.map((k) => `${k} ${actual[k]} < ${budget[k]}`).join(", ")}) — опусти baseline: ` +
      `node scripts/check-inline-error-responses.mjs --update\n`,
  );
} else {
  console.log("");
}
