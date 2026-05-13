#!/usr/bin/env node
/**
 * PR-34 — strategic mode skeleton: dev/seed script.
 *
 * Запис 3–5 sample goals per persona (finyk / fizruk / nutrition / routine)
 * у поточну Kyiv-ISO-week. Безпечний для повторного запуску — кожен прогон
 * INSERT-ить нові рядки (append-only); якщо потрібна clean state — спочатку
 * `TRUNCATE strategic_goals` руками.
 *
 * Usage:
 *
 *   DATABASE_URL=postgresql://hub:hub@127.0.0.1:5432/hub \
 *   STRATEGIC_FOUNDER_USER_ID=dev-founder-1 \
 *     node scripts/seed-strategic-goals.mjs
 *
 * Якщо `STRATEGIC_FOUNDER_USER_ID` не вказано, дефолт — `dev-founder-1`.
 * Якщо `DATABASE_URL` не вказано — fail-fast з error-message (це не fail-open
 * шлях, бо seeder викликається тільки в dev/test).
 */

import pg from "pg";

const PERSONAS = ["finyk", "fizruk", "nutrition", "routine"];

const SAMPLE_GOALS = {
  finyk: [
    "Закрити 60% витрат на каву категорією 'Coffee' до неділі",
    "Прибрати з 'Income' 3 пропущені mono-транзакції за квітень",
    "Поставити budget на 'Eating out' = 6000 ₴/міс",
    "Перевірити чи всі debt-receivables за PR-10 закриті",
    "Запросити friend на trial Sergeant Plus (referral)",
  ],
  fizruk: [
    "5 strength-day цього тижня (нижня частина в Mon/Wed/Fri)",
    "60 хв cardio cumulative (Wahoo bike або run)",
    "8 годин сну median — без 'late TV' після 23:00",
    "Body-fat 17.5% → 17.0% (DEXA на наступному тижні)",
  ],
  nutrition: [
    "5 днів meal-plan-compliance (без fast-food after-work)",
    "Vegetarian-day у середу (мінімум 50 г plant-protein)",
    "Water intake 2.5L median (Apple Health log)",
    "Skip alcohol — Fri-Sat clean week",
    "Cook 3 нові рецепти з PR-22 nutrition-catalog-у",
  ],
  routine: [
    "Mon-Wed-Fri 09:00 deep-work block (no Slack notifications)",
    "Weekly review Fri 18:00 (15-хв brain-dump → notion-page)",
    "Inbox-zero у Sun 21:00 — process всю tasks-queue",
    "Spend ≤2h на passive YouTube/Twitter (RescueTime)",
  ],
};

function kyivMondayISO() {
  const nowKyiv = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Kyiv" }),
  );
  const dow = nowKyiv.getDay();
  const daysSinceMonday = (dow + 6) % 7;
  const monday = new Date(nowKyiv);
  monday.setDate(monday.getDate() - daysSinceMonday);
  return monday.toISOString().slice(0, 10);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(
      "seed-strategic-goals: DATABASE_URL not set; refusing to run in default-host mode",
    );
    process.exit(1);
  }
  const founderUserId =
    process.env.STRATEGIC_FOUNDER_USER_ID || "dev-founder-1";
  const weekStart = kyivMondayISO();

  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
  let inserted = 0;
  try {
    for (const persona of PERSONAS) {
      for (const goalText of SAMPLE_GOALS[persona] ?? []) {
        await pool.query(
          `INSERT INTO strategic_goals (persona, founder_user_id, week_start, goal_text)
           VALUES ($1, $2, $3, $4)`,
          [persona, founderUserId, weekStart, goalText],
        );
        inserted += 1;
      }
    }
    console.log(
      JSON.stringify({
        ok: true,
        weekStart,
        founderUserId,
        inserted,
        personas: PERSONAS,
      }),
    );
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
