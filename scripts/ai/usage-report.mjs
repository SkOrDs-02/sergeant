#!/usr/bin/env node
/**
 * Звіт про реальні AI-витрати за довільне вікно.
 *
 * Відповідає на питання, яке не можна вирішити читанням конфігу: які моделі
 * і які конвеєри насправді обслуговували запити й скільки це коштувало.
 *
 *   node scripts/ai/usage-report.mjs                    # останні 7 днів
 *   node scripts/ai/usage-report.mjs --days 30
 *   node scripts/ai/usage-report.mjs --days 30 --per 100
 *
 * Env:
 *   INTERNAL_API_KEY  — обовʼязково, той самий, що в Coolify
 *   SERGEANT_API_URL  — база API; за замовчуванням http://localhost:3000
 *
 * ── Чому HTTP, а не прямий SQL ──────────────────────────────────────────
 *
 * Попередня версія ходила в Postgres через `MIGRATE_DATABASE_URL`, і в
 * шапці стояло «публічний URL бази». На Railway він таким і був; на Coolify
 * у бази публічного порту немає взагалі, тож скрипт запускався лише з
 * термінала самого ресурсу. Ендпоінт `/api/internal/ai-usage` віддає ту саму
 * агрегацію й доступний звідусіль — а заразом рахує вартість як
 * `COALESCE(actual_cost_usd, est_cost_usd)`, тоді як тут стояло голе
 * `est_cost_usd`, тобто витрати шлюзу занижувались до нуля для моделей,
 * яких немає в локальній прайс-таблиці.
 *
 * Тільки читає. Жодного запису.
 */

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const DAYS = Math.min(90, Math.max(1, Number(valueOf("--days") ?? 7)));
const PER = Math.max(1, Number(valueOf("--per") ?? 100));
const BASE = (
  process.env["SERGEANT_API_URL"] || "http://localhost:3000"
).replace(/\/+$/, "");
const KEY = process.env["INTERNAL_API_KEY"];

if (!KEY) {
  console.error(
    "INTERNAL_API_KEY не задано (значення з Coolify → sergeant-api → Environment).\n" +
      'PowerShell:  $env:INTERNAL_API_KEY = "…"\n' +
      'Bash:        export INTERNAL_API_KEY="…"',
  );
  process.exit(1);
}

const usd = (v) => "$" + Number(v ?? 0).toFixed(4);
const pad = (s, w) => String(s).padStart(w);

async function main() {
  const url = `${BASE}/api/internal/ai-usage?days=${DAYS}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${KEY}` },
  });

  if (res.status === 401) {
    throw new Error(`401 — INTERNAL_API_KEY не підходить до ${BASE}`);
  }
  if (res.status === 503) {
    throw new Error(`503 — на ${BASE} не налаштований INTERNAL_API_KEY`);
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} від ${url}`);
  }

  const data = await res.json();
  const items = data.items ?? [];

  console.log(`Вікно: ${data.from} … ${data.until} (${data.days} дн., Київ)\n`);

  if (items.length === 0) {
    console.log("Жодного запису за цей період.");
    console.log(
      "Або AI-викликів не було, або леджер не пишеться — перевір\n" +
        "`recordAnthropicUsageToDb` у lib/anthropic.ts і lib/llm/provider.ts.\n",
    );
    return;
  }

  // ── Конвеєри ──────────────────────────────────────────────────────────
  // Головна таблиця: за що саме платимо. `endpoint` розрізняє кроки, які
  // ділять модель (перший тур чату проти синтезу), `bucket` — модель.
  const wEp = Math.max(...items.map((i) => i.endpoint.length), 8);
  const wB = Math.max(...items.map((i) => i.bucket.length), 6);

  console.log("Конвеєри:\n");
  console.log(
    `  ${"endpoint".padEnd(wEp)}  ${"модель".padEnd(wB)}  ` +
      `${pad("виклики", 8)}  ${pad("разом", 10)}  ${pad(`$/${PER}`, 9)}  кеш`,
  );
  for (const i of items) {
    console.log(
      `  ${i.endpoint.padEnd(wEp)}  ${i.bucket.padEnd(wB)}  ` +
        `${pad(i.calls, 8)}  ${pad(usd(i.costUsd), 10)}  ` +
        `${pad("$" + (i.costPerCallUsd * PER).toFixed(2), 9)}  ` +
        `${pad(i.cacheHitPct + "%", 6)}`,
    );
  }

  // ── Моделі ────────────────────────────────────────────────────────────
  // Той самий набір, згорнутий по моделі: відповідає на «шлюз працює?»
  // незалежно від того, скільки конвеєрів через нього ходить.
  const byModel = new Map();
  for (const i of items) {
    const model = i.bucket.replace(/^anthropic:/, "");
    const acc = byModel.get(model) ?? { calls: 0, costUsd: 0 };
    acc.calls += i.calls;
    acc.costUsd += i.costUsd;
    byModel.set(model, acc);
  }
  const models = [...byModel.entries()].sort(
    (a, b) => b[1].costUsd - a[1].costUsd,
  );
  const wM = Math.max(...models.map(([m]) => m.length), 6);

  console.log("\nМоделі:\n");
  for (const [model, m] of models) {
    const perN = m.calls > 0 ? (m.costUsd / m.calls) * PER : 0;
    console.log(
      `  ${model.padEnd(wM)}  ${pad(m.calls, 8)} викл.  ` +
        `${pad(usd(m.costUsd), 10)}  ${pad("$" + perN.toFixed(2), 9)} / ${PER}`,
    );
  }

  // ── Підсумок ──────────────────────────────────────────────────────────
  const total = data.totalCostUsd ?? 0;
  const calls = data.totalCalls ?? 0;
  console.log(`\n  РАЗОМ: ${usd(total)} за ${calls} викликів`);
  console.log(`  на добу в середньому: ${usd(total / data.days)}`);
  if (calls > 0) {
    console.log(`  за ${PER} викликів: $${((total / calls) * PER).toFixed(2)}`);
    console.log(`  прогноз на 30 днів: ${usd((total / data.days) * 30)}\n`);
  }

  // Висновок робимо самі, щоб не доводилось звіряти id очима.
  const names = models.map(([m]) => m);
  if (names.every((m) => m.startsWith("claude-"))) {
    console.log(
      "Висновок: усе на прямому Anthropic — CHAT_VIA_OPENROUTER та/або\n" +
        "VISION_VIA_OPENROUTER вимкнені. Платиш за дорожчою колонкою.\n",
    );
  } else if (names.some((m) => m.includes("/") || m.startsWith("z-ai"))) {
    console.log("Висновок: шлюз працює — у списку є OpenRouter-моделі.\n");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
