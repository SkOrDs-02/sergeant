#!/usr/bin/env node
/**
 * Звіт про реальні AI-витрати з `ai_usage_daily`.
 *
 * Відповідає на питання, яке не можна вирішити читанням конфігу: ЯКІ моделі
 * насправді обслуговували запити. Відро `anthropic:<model>` веде накопичену
 * вартість per-model (міграція 059), тож список моделей у виводі — це факт,
 * а не те, що мало б статись за змінними оточення.
 *
 *   node scripts/ai/usage-report.mjs
 *   node scripts/ai/usage-report.mjs --days 30
 *
 * Env:
 *   MIGRATE_DATABASE_URL  — публічний URL бази (той самий, що для міграцій)
 *   DATABASE_URL          — запасний варіант, якщо перший не заданий
 *
 * Тільки читає. Жодного запису, жодної транзакції.
 */
import pg from "pg";

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const DAYS = Number(valueOf("--days") ?? 7);
const URL = process.env["MIGRATE_DATABASE_URL"] || process.env["DATABASE_URL"];

if (!URL) {
  console.error(
    "MIGRATE_DATABASE_URL не задано (публічний URL бази з Coolify).\n" +
      'PowerShell:  $env:MIGRATE_DATABASE_URL = "postgres://…"',
  );
  process.exit(1);
}

// Коерція bigint/numeric у число (Hard Rule #1): pg віддає NUMERIC рядком,
// і без цього сума в JS склеїлась би, а не додалась.
const n = (v) => Number(v ?? 0);
const usd = (v) => "$" + n(v).toFixed(4);

const pool = new pg.Pool({
  connectionString: URL,
  ssl: URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log(`Вікно: останні ${DAYS} днів\n`);

  const models = await pool.query(
    // `last_seen` віддаємо РЯДКОМ, а не датою. pg мапить DATE у JS-Date на
    // локальну північ, і `toISOString()` у Києві (UTC+3) відкотив би її на
    // добу назад — звіт показував би вчора замість сьогодні.
    `SELECT replace(bucket, 'anthropic:', '')     AS model,
            sum(est_cost_usd)                     AS usd,
            sum(request_count)                    AS calls,
            to_char(max(usage_day), 'YYYY-MM-DD') AS last_seen
       FROM ai_usage_daily
      WHERE bucket LIKE 'anthropic:%'
        AND usage_day > current_date - $1::int
      GROUP BY 1
      ORDER BY 2 DESC NULLS LAST`,
    [DAYS],
  );

  if (models.rows.length === 0) {
    console.log("Жодного запису у відрах anthropic:<model>.");
    console.log(
      "Або за цей період не було AI-викликів, або ledger не пишеться.\n",
    );
  } else {
    console.log("Моделі, що реально працювали:\n");
    const w = Math.max(...models.rows.map((r) => r.model.length), 5);
    for (const r of models.rows) {
      console.log(
        `  ${r.model.padEnd(w)}  ${usd(r.usd).padStart(10)}  ` +
          `${String(n(r.calls)).padStart(6)} викл.  ` +
          `останній ${r.last_seen}`,
      );
    }
    const total = models.rows.reduce((s, r) => s + n(r.usd), 0);
    console.log(`\n  ${"РАЗОМ".padEnd(w)}  ${usd(total).padStart(10)}`);
    console.log(`  на добу в середньому: ${usd(total / DAYS)}\n`);

    // Головний висновок робимо самі, щоб не доводилось звіряти id очима.
    const anthropicOnly = models.rows.every((r) =>
      r.model.startsWith("claude-"),
    );
    const hasGateway = models.rows.some(
      (r) => r.model.includes("/") || r.model.startsWith("z-ai"),
    );
    if (anthropicOnly) {
      console.log(
        "Висновок: усе на прямому Anthropic — CHAT_VIA_OPENROUTER та/або\n" +
          "VISION_VIA_OPENROUTER вимкнені. Платиш за дорожчою колонкою.\n",
      );
    } else if (hasGateway) {
      console.log("Висновок: шлюз працює — у списку є OpenRouter-моделі.\n");
    }
  }

  // Відра тиринга показують, чи вмикався каскад premium → standard → floor.
  const buckets = await pool.query(
    `SELECT bucket, sum(request_count) AS calls, count(DISTINCT subject_key) AS subjects
       FROM ai_usage_daily
      WHERE bucket IN ('default', 'premium', 'standard')
        AND usage_day > current_date - $1::int
      GROUP BY 1 ORDER BY 2 DESC`,
    [DAYS],
  );

  if (buckets.rows.length > 0) {
    console.log("Квоти й тиринг:\n");
    for (const r of buckets.rows) {
      console.log(
        `  ${r.bucket.padEnd(9)}  ${String(n(r.calls)).padStart(6)} викл.  ` +
          `${String(n(r.subjects)).padStart(4)} суб'єктів`,
      );
    }
    console.log("");
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
