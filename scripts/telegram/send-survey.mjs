#!/usr/bin/env node
// AI-LEGACY: expires 2026-10-31 — тимчасова інфраструктура закритої бети;
// видалити разом із docs/90-work/beta-launch/ (перелік — у README тієї теки).
/**
 * Розсилка мікро-опитування тестерам бети.
 *
 * ⚠️ ТИМЧАСОВИЙ ОПЕРАТОРСЬКИЙ СКРИПТ на час закритої бети.
 * Спека: docs/90-work/planning/specs/telegram-waitlist.md § Мікро-опитування
 *
 * Сестра `broadcast-waitlist.mjs`: так само запускається руками, так само не
 * деплоїться в прод. Різниця в адресатах — інвайт іде тим, кого ще НЕ
 * запрошено, а опитування навпаки тим, кого вже запрошено й хто досі з нами.
 *
 *   node scripts/telegram/send-survey.mjs --dry-run
 *   node scripts/telegram/send-survey.mjs --limit 10
 *
 * Прапорці:
 *   --dry-run       нічого не шле; друкує питання і кількість адресатів
 *   --limit N       не більше N адресатів за прогін
 *   --survey ID     інше опитування (за замовчуванням `week1`)
 *
 * Env: DATABASE_URL, TELEGRAM_WAITLIST_BOT_TOKEN.
 */
import pg from "pg";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const DRY_RUN = has("--dry-run");
const LIMIT = Number(valueOf("--limit") ?? 0) || null;

const BOT_TOKEN = process.env.TELEGRAM_WAITLIST_BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

const SEND_INTERVAL_MS = 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Дзеркало `WEEKLY_PULSE_SURVEY` з
 * `apps/server/src/modules/telegram/betaTexts.ts`.
 *
 * Копія, а не імпорт, бо в репо немає TS-раннера для скриптів, а збирати
 * весь сервер заради одного разового прогону — задорого. Розʼїзд ловить
 * тест `betaTexts.test.ts`: він читає цей файл і звіряє `id` та значення
 * варіантів із каталогом. Саме вони утворюють `callback_data`, і якщо вони
 * розійдуться, бот мовчки відкине КОЖНЕ натискання.
 */
const SURVEYS = {
  week1: {
    id: "week1",
    question:
      "Як тобі цей тиждень із Sergeant?\n\n" +
      "1 — не зайшло взагалі, 5 — не хочеться вимикати.",
    options: [
      { label: "1", value: "1" },
      { label: "2", value: "2" },
      { label: "3", value: "3" },
      { label: "4", value: "4" },
      { label: "5", value: "5" },
    ],
  },
};

const SURVEY_ID = valueOf("--survey") ?? "week1";

function keyboardFor(survey) {
  return {
    inline_keyboard: [
      survey.options.map((o) => ({
        text: o.label,
        callback_data: `s:${survey.id}:${o.value}`,
      })),
    ],
  };
}

async function sendMessage(chatId, text, replyMarkup) {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
      }),
    },
  );
  const body = await res.json().catch(() => null);
  return {
    ok: body?.ok === true,
    errorCode: body?.error_code,
    description: body?.description,
    retryAfter: body?.parameters?.retry_after,
  };
}

async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL не задано");
    process.exit(1);
  }
  if (!DRY_RUN && !BOT_TOKEN) {
    console.error("TELEGRAM_WAITLIST_BOT_TOKEN не задано");
    process.exit(1);
  }

  const survey = SURVEYS[SURVEY_ID];
  if (!survey) {
    console.error(
      `Опитування «${SURVEY_ID}» невідоме. Доступні: ${Object.keys(SURVEYS).join(", ")}`,
    );
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Адресати — активні тестери: інвайт уже отримали й не відписались.
  // `NOT EXISTS` робить повторний прогін безпечним: той, хто вже відповів,
  // не отримає те саме питання вдруге. Це важливо, бо прогін завжди може
  // обірватись посередині, і перезапуск має бути дешевим рішенням.
  const { rows } = await pool.query(
    `SELECT w.chat_id
       FROM telegram_waitlist w
      WHERE w.notified_at IS NOT NULL
        AND w.opted_out_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM telegram_beta_survey_responses r
           WHERE r.chat_id = w.chat_id AND r.survey_id = $1
        )
      ORDER BY w.notified_at
      ${LIMIT ? "LIMIT $2" : ""}`,
    LIMIT ? [survey.id, LIMIT] : [survey.id],
  );

  console.log(`Опитування: ${survey.id}`);
  console.log(`Адресатів: ${rows.length}${LIMIT ? ` (ліміт ${LIMIT})` : ""}`);
  console.log("─".repeat(60));
  console.log(survey.question);
  console.log(`[${survey.options.map((o) => o.label).join("] [")}]`);
  console.log("─".repeat(60));

  if (DRY_RUN) {
    console.log("--dry-run: нічого не надіслано.");
    await pool.end();
    return;
  }

  const markup = keyboardFor(survey);
  let sent = 0;
  let optedOut = 0;
  let failed = 0;

  for (const row of rows) {
    // pg віддає BIGINT рядком; Telegram приймає і рядок.
    const chatId = String(row.chat_id);
    let result = await sendMessage(chatId, survey.question, markup);

    if (!result.ok && result.errorCode === 429 && result.retryAfter) {
      console.warn(`429 — чекаю ${result.retryAfter}s`);
      await sleep((result.retryAfter + 1) * 1000);
      result = await sendMessage(chatId, survey.question, markup);
    }

    if (result.ok) {
      // Нічого не стампуємо: ознака «надіслано» тут — відсутність рядка у
      // відповідях, і вона зʼявиться, коли людина натисне кнопку. Той, хто
      // не відповів, свідомо отримає питання ще раз при наступному прогоні.
      sent += 1;
    } else if (result.errorCode === 403) {
      // "bot was blocked by the user" — це відписка, а не збій.
      await pool.query(
        `UPDATE telegram_waitlist SET opted_out_at = NOW() WHERE chat_id = $1`,
        [chatId],
      );
      optedOut += 1;
    } else {
      failed += 1;
      console.warn(
        `chat ${chatId}: ${result.errorCode ?? "?"} ${result.description ?? ""}`,
      );
    }

    await sleep(SEND_INTERVAL_MS);
  }

  console.log(
    `Готово. Надіслано: ${sent}, заблокували бота: ${optedOut}, помилок: ${failed}.`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
