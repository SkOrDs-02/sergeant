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

/**
 * Меню команд бота.
 *
 * Без `setMyCommands` у Telegram НЕМАЄ ні синьої кнопки «Menu» біля поля
 * вводу, ні підказки при наборі «/». Бот при цьому команди обробляє —
 * просто ніхто про них не дізнається, бо єдина згадка живе в тексті
 * `/help`, який теж треба спершу набрати наосліп.
 *
 * `/start` тут навмисно немає: Telegram сам показує його кнопкою в
 * порожньому чаті, і в меню він лише займав би рядок. `/stats` теж —
 * це власницька команда, і в публічному меню вона видавала б своє
 * існування (гейт за chat_id у `telegram-webhook.ts` лишається, але
 * не варто на нього вказувати пальцем).
 *
 * Список має збігатися з блоком «Команди бота» в `helpReply`
 * (`apps/server/src/modules/telegram/betaTexts.ts`).
 */
const BOT_COMMANDS = [
  { command: "app", description: "Адреса застосунку" },
  { command: "install", description: "Як поставити на головний екран" },
  { command: "help", description: "Правила бети й куди писати" },
  { command: "stop", description: "Відписатись від розсилки" },
];

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

  let me;
  try {
    me = await api("getMe");
  } catch (err) {
    // Telegram віддає рівно "404 Not Found" на будь-який недійсний токен —
    // старий, відкликаний чи спотворений при копіюванні. Показуємо форму
    // токена (без самого значення), щоб можна було звірити на око: справжній
    // токен — це <bot_id>:<35 символів>, разом ~46 символів і рівно одна
    // двокрапка.
    if (/^getMe: 404/.test(err.message)) {
      const parts = TOKEN.split(":");
      console.error(
        "Токен не впізнаний Telegram-ом (404). Найчастіші причини:\n" +
          "  1) це старий/відкликаний токен — візьми свіжий у BotFather\n" +
          "     (/mybots → бот → API Token → Revoke current token);\n" +
          "  2) $env:TELEGRAM_WAITLIST_BOT_TOKEN виставлено в ІНШОМУ вікні\n" +
          "     PowerShell, а не в тому, де запускається цей скрипт;\n" +
          "  3) при копіюванні прилип пробіл, лапки чи перенос рядка.\n\n" +
          `Форма зараз: довжина ${TOKEN.length}, двокрапок ${parts.length - 1}` +
          (parts.length === 2
            ? `, частина після ":" — ${parts[1]?.length ?? 0} символів`
            : "") +
          "\n(очікується: ~46 символів, рівно одна двокрапка).",
      );
      process.exit(1);
    }
    throw err;
  }
  console.log(`Бот: @${me.username} (${me.first_name})`);

  if (has("--check")) {
    console.log("\nПоточний стан вебхука:");
    const info = await api("getWebhookInfo");
    reportInfo(info);
    // Порожній allowed_updates означає дефолт Telegram, у якому
    // callback_query НЕМАЄ — тобто кнопки опитувань мертві.
    console.log(
      `  Типи апдейтів:       ${(info.allowed_updates ?? []).join(", ") || "(дефолт — без callback_query!)"}`,
    );
    const registered = await api("getMyCommands");
    console.log(
      `\nМеню команд: ${registered.map((c) => `/${c.command}`).join(" ") || "(порожнє — кнопки «Menu» в чаті не буде)"}`,
    );
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
    // Рівно два типи, і обидва обовʼязкові. `message` — команди й вільний
    // текст. `callback_query` — натискання кнопок мікро-опитувань: цей тип
    // НЕ входить у дефолт Telegram, і поки його тут не було, кнопки
    // «Пульс тижня» мовчали, а клієнт крутив годинник до таймауту.
    // Звужений список економить трафік і не тягне зайвих даних користувачів.
    allowed_updates: ["message", "callback_query"],
  });

  await api("setMyCommands", { commands: BOT_COMMANDS });

  console.log(`\nВебхук встановлено: ${url}`);
  console.log(`Секрет: ${tail(SECRET)}`);
  console.log(
    `Меню команд: ${BOT_COMMANDS.map((c) => `/${c.command}`).join(" ")}`,
  );

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
