#!/usr/bin/env node
/**
 * Реєстрація вебхука бота вейтліста в Telegram.
 * Спека: docs/90-work/planning/specs/telegram-waitlist.md
 *
 * Запускати ПІСЛЯ того, як код із роутом `/api/v1/telegram/webhook` уже
 * задеплоєний. До того Telegram почне слати апдейти в 404 і піде в
 * exponential backoff — а перші живі `/start` осядуть у чергу ретраїв.
 *
 *   node scripts/telegram/setup-webhook.mjs --check
 *   node scripts/telegram/setup-webhook.mjs
 *   node scripts/telegram/setup-webhook.mjs --delete
 *
 * Прапорці:
 *   --check    лише показати поточний стан вебхука, нічого не міняти
 *   --delete   зняти вебхук (наприклад, перед локальною відладкою)
 *
 * Env:
 *   TELEGRAM_WAITLIST_BOT_TOKEN       — токен від BotFather
 *   TELEGRAM_WAITLIST_WEBHOOK_SECRET  — спільний секрет; якщо порожній,
 *                                       скрипт згенерує і надрукує новий
 *   API_BASE_URL                      — публічний URL бекенду (Coolify)
 *
 * Секрети читаються з оточення й НІКОЛИ не друкуються повністю — у вивід
 * іде лише кілька останніх символів, щоб можна було звірити, що значення
 * те саме, що в Coolify.
 */
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);

const TOKEN = process.env.TELEGRAM_WAITLIST_BOT_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL;
let SECRET = process.env.TELEGRAM_WAITLIST_WEBHOOK_SECRET;

/** Показує лише хвіст значення — достатньо для звірки, безпечно для логів. */
const tail = (v) => (v ? `…${v.slice(-6)}` : "(не задано)");

async function api(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => null);
  if (!json?.ok) {
    throw new Error(
      `${method}: ${json?.error_code ?? res.status} ${json?.description ?? "невідома помилка"}`,
    );
  }
  return json.result;
}

function reportInfo(info) {
  console.log(`  URL:                 ${info.url || "(не встановлено)"}`);
  console.log(`  Очікує апдейтів:     ${info.pending_update_count ?? 0}`);
  console.log(
    `  Перевірка секрету:   ${info.has_custom_certificate ? "own cert" : "secret_token"}`,
  );
  if (info.last_error_message) {
    // Це головний симптом «бот мовчить»: Telegram стукає, але не достукується.
    console.log(`  ⚠️  Остання помилка:  ${info.last_error_message}`);
    console.log(
      `      о ${new Date((info.last_error_date ?? 0) * 1000).toISOString()}`,
    );
  } else {
    console.log("  Помилок доставки:    немає");
  }
}

async function main() {
  if (!TOKEN) {
    console.error("TELEGRAM_WAITLIST_BOT_TOKEN не задано в оточенні.");
    process.exit(1);
  }

  const me = await api("getMe");
  console.log(`Бот: @${me.username} (${me.first_name})`);

  if (has("--check")) {
    console.log("\nПоточний стан вебхука:");
    reportInfo(await api("getWebhookInfo"));
    return;
  }

  if (has("--delete")) {
    await api("deleteWebhook", { drop_pending_updates: false });
    console.log("Вебхук знято. Апдейти, що вже в черзі, збережені.");
    return;
  }

  if (!API_BASE_URL) {
    console.error("API_BASE_URL не задано (публічний URL бекенду).");
    process.exit(1);
  }
  if (!/^https:\/\//.test(API_BASE_URL)) {
    // Telegram приймає вебхуки лише поверх HTTPS.
    console.error(
      `API_BASE_URL має починатись з https:// — маємо ${API_BASE_URL}`,
    );
    process.exit(1);
  }

  let generated = false;
  if (!SECRET) {
    SECRET = randomBytes(32).toString("hex");
    generated = true;
  }

  const url = `${API_BASE_URL.replace(/\/$/, "")}/api/v1/telegram/webhook`;
  await api("setWebhook", {
    url,
    secret_token: SECRET,
    // Нам потрібні лише повідомлення: бот обробляє /start і /stop.
    // Звужений список економить трафік і не тягне зайвих даних користувачів.
    allowed_updates: ["message"],
  });

  console.log(`\nВебхук встановлено: ${url}`);
  console.log(`Секрет: ${tail(SECRET)}`);

  if (generated) {
    console.log(
      "\n⚠️  Секрет згенеровано щойно. Скопіюй його в Coolify як\n" +
        "    TELEGRAM_WAITLIST_WEBHOOK_SECRET і зроби redeploy — інакше\n" +
        "    сервер відхилятиме апдейти з 401:\n",
    );
    console.log(`    ${SECRET}\n`);
  }

  console.log("Стан після реєстрації:");
  reportInfo(await api("getWebhookInfo"));
  console.log(
    "\nПеревірка: напиши боту /start. Якщо у відповідь тиша —\n" +
      "запусти цей скрипт із --check і подивись last_error_message.",
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
