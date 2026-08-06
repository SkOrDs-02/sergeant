#!/usr/bin/env node
// AI-LEGACY: expires 2026-10-31 — тимчасова інфраструктура закритої бети;
// видалити разом із docs/90-work/beta-launch/ (перелік — у README тієї теки).
/**
 * Видача та відкликання Pro-доступу для тестерів бети.
 *
 * ⚠️ ТИМЧАСОВИЙ ОПЕРАТОРСЬКИЙ СКРИПТ на час закритої бети.
 * Інструкція й порядок запуску: docs/90-work/beta-launch/run-beta-wave.md
 * Спека: docs/90-work/planning/specs/telegram-waitlist.md
 *
 *   node scripts/billing/grant-beta-pro.mjs --list
 *   node scripts/billing/grant-beta-pro.mjs --emails a@b.com,c@d.com --dry-run
 *   node scripts/billing/grant-beta-pro.mjs --emails a@b.com --days 14
 *   node scripts/billing/grant-beta-pro.mjs --emails a@b.com --revoke --dry-run
 *
 * Прапорці:
 *   --list             показує зареєстрованих і їхній поточний план; нічого не змінює
 *   --emails a,b       кому видати/відкликати (через кому)
 *   --emails-file p    те саме, але зі файлу (по одному на рядок, `#` — коментар)
 *   --since YYYY-MM-DD усі, хто зареєструвався з цієї дати (київська північ)
 *   --days N           тривалість доступу, дефолт 14
 *   --revoke           відкликати замість видати
 *   --dry-run          виконати всі записи в транзакції й ВІДКОТИТИ
 *
 * Env: DATABASE_URL.
 *
 * Чому email, а не Telegram-хендл: у `telegram_waitlist` лежить `chat_id`, а не
 * пошта, і зв'язати одне з одним нічим — людина реєструється будь-якою
 * адресою. Тому порядок такий: тестер реєструється → ти дивишся `--list` →
 * зіставляєш із людиною з вейтліста → видаєш доступ.
 *
 * `--since` знімає це зіставлення взагалі: посилання на бету є лише в
 * запрошених, тож «усі, хто зареєструвався з дати розсилки» — це рівно вони.
 * Дешевше за збір пошт у групі, і без чужих персональних даних у спільному
 * чаті. Ціна — випадковий перехожий, який роздобув URL, теж отримає Pro;
 * на дві тижні закритої хвилі це прийнятно.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const DRY_RUN = has("--dry-run");
const REVOKE = has("--revoke");
const LIST = has("--list");
const DAYS = Number(valueOf("--days") ?? 14);
const SINCE = valueOf("--since");

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * `provider = 'manual'` — не косметика, а запобіжник. Міграція 056 описує
 * `manual` як «seeded/admin-granted», і саме цим значенням позначені бета-видачі.
 * Відкликання фільтрує по ньому, щоб цей скрипт НІКОЛИ не скасував реальну
 * оплачену підписку, якщо колись email тестера збіжиться з email платника.
 */
const BETA_PROVIDER = "manual";

/** Статуси, які `getUserPlan` вважає діючими (і які покриває унікальний індекс). */
const LIVE_STATUSES = ["active", "trialing", "past_due"];

function parseEmails() {
  const inline = (valueOf("--emails") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const file = valueOf("--emails-file");
  if (!file) return [...new Set(inline)];

  const fromFile = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.split("#")[0].trim().toLowerCase())
    .filter(Boolean);

  return [...new Set([...inline, ...fromFile])];
}

async function listUsers(client) {
  // Better Auth тримає юзерів у таблиці "user" (у лапках — це зарезервоване слово).
  const { rows } = await client.query(
    `SELECT u.email,
            u.name,
            u."createdAt"                        AS registered_at,
            coalesce(s.plan, 'free')             AS plan,
            s.status,
            s.provider,
            s.current_period_end
       FROM "user" u
       LEFT JOIN subscriptions s
              ON s.user_id = u.id
             AND s.status = ANY($1::text[])
      ORDER BY u."createdAt" DESC
      LIMIT 100`,
    [LIVE_STATUSES],
  );

  if (rows.length === 0) {
    console.log("Зареєстрованих користувачів немає.");
    return;
  }

  console.log(`Зареєстровані (${rows.length}, найновіші згори):`);
  console.log("─".repeat(78));
  for (const r of rows) {
    const until = r.current_period_end
      ? ` до ${r.current_period_end.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" })}`
      : "";
    const plan =
      r.plan === "pro" ? `PRO (${r.status}, ${r.provider}${until})` : "free";
    const when = r.registered_at
      ? r.registered_at.toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" })
      : "?";
    console.log(`  ${r.email.padEnd(34)} ${plan.padEnd(30)} ${when}`);
  }
}

/**
 * Пошти всіх, хто зареєструвався з указаної дати включно.
 *
 * Межа доби — київська, а не UTC (доменний інваріант).
 *
 * Каст саме у `timestamp`, а не в `date`, і це не стилістика. `date` у цьому
 * контексті неявно приводиться до `timestamptz` (UTC-північ), і `AT TIME ZONE`
 * тоді працює у ЗВОРОТНИЙ бік — перекладає UTC у київський настінний час.
 * Межа виходила на 3 години пізніше, і той, хто зареєструвався о 00:01 за
 * Києвом, у вибірку не потрапляв. `timestamp` (наївна північ) змушує оператор
 * трактувати її як київську й повернути правильний timestamptz.
 *
 * Повертає пошти, а не id, свідомо: далі вони йдуть тим самим шляхом, що й
 * `--emails`, тож уся логіка видачі лишається однією.
 */
async function emailsRegisteredSince(client, since) {
  const { rows } = await client.query(
    `SELECT lower(email) AS email
       FROM "user"
      WHERE "createdAt" >= ($1::timestamp AT TIME ZONE 'Europe/Kyiv')
      ORDER BY "createdAt"`,
    [since],
  );
  return rows.map((r) => r.email);
}

async function resolveUserIds(client, emails) {
  const { rows } = await client.query(
    `SELECT id, email FROM "user" WHERE lower(email) = ANY($1::text[])`,
    [emails],
  );
  const found = new Map(rows.map((r) => [r.email.toLowerCase(), r.id]));
  const missing = emails.filter((e) => !found.has(e));
  return { found, missing };
}

async function grant(client, userIds, days) {
  // ON CONFLICT цілиться в частковий унікальний індекс
  // `subscriptions_user_active_idx` — для такого індексу його ж предикат
  // ОБОВ'ЯЗКОВО повторити у WHERE, інакше Postgres не знайде arbiter index.
  //
  // status = 'trialing', а не 'active': коли з'являться реальні платники,
  // бета-доступи не змішаються з ними у виручці й метриках.
  //
  // current_period_end через N днів — щоб бета закривалася сама, навіть якщо
  // ти забудеш відкликати доступ вручну.
  const { rows } = await client.query(
    `INSERT INTO subscriptions
       (user_id, plan, status, provider, current_period_end)
     SELECT id, 'pro', 'trialing', $2, NOW() + ($3 || ' days')::interval
       FROM "user" WHERE id = ANY($1::text[])
     ON CONFLICT (user_id) WHERE status IN ('active', 'trialing', 'past_due')
     DO UPDATE SET plan               = 'pro',
                   status             = 'trialing',
                   provider           = $2,
                   current_period_end = NOW() + ($3 || ' days')::interval,
                   updated_at         = NOW()
     RETURNING user_id, (xmax = 0) AS created`,
    [userIds, BETA_PROVIDER, String(days)],
  );
  return {
    created: rows.filter((r) => r.created).length,
    updated: rows.filter((r) => !r.created).length,
  };
}

async function revoke(client, userIds) {
  // Не DELETE: рядок — це історія того, що доступ був виданий і коли забраний.
  // Фільтр по provider не дає скасувати справжню оплачену підписку.
  const { rowCount } = await client.query(
    `UPDATE subscriptions
        SET status = 'canceled', updated_at = NOW()
      WHERE user_id = ANY($1::text[])
        AND provider = $2
        AND status = ANY($3::text[])`,
    [userIds, BETA_PROVIDER, LIVE_STATUSES],
  );
  return rowCount;
}

async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL не задано");
    process.exit(1);
  }
  if (!Number.isFinite(DAYS) || DAYS <= 0) {
    console.error("--days має бути додатним числом");
    process.exit(1);
  }
  // Формат звіряємо тут, а не покладаємось на приведення в Postgres: він
  // мовчки з'їсть і `09.08.2026`, розібравши його не так, як ти очікуєш.
  if (SINCE !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(SINCE)) {
    console.error(
      `--since має бути у форматі YYYY-MM-DD — отримано «${SINCE}».\n` +
        "Наприклад: --since 2026-08-09",
    );
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    if (LIST) {
      await listUsers(client);
      return;
    }

    const emails = parseEmails();

    if (SINCE) {
      const fromWindow = await emailsRegisteredSince(client, SINCE);
      if (fromWindow.length === 0) {
        // Порожня вибірка — найчастіше майбутня дата або помилка в місяці.
        // Мовчазне «нічого не зроблено» тут гірше за явну відмову.
        console.error(
          `За --since ${SINCE} не зареєструвався ніхто.\n` +
            "Перевір дату: вона в майбутньому? місяць і день не переплутані?\n" +
            "Хто вже є в базі — покаже --list.",
        );
        process.exit(1);
      }
      console.log(
        `--since ${SINCE}: знайдено ${fromWindow.length} акаунт(ів) у вікні.`,
      );
      emails.push(...fromWindow);
    }

    const targets = [...new Set(emails)];
    if (targets.length === 0) {
      console.error(
        "Не задано жодного email. Використай --emails, --emails-file або\n" +
          "--since YYYY-MM-DD, або подивись, хто вже зареєструвався: --list",
      );
      process.exit(1);
    }

    const { found, missing } = await resolveUserIds(client, targets);
    if (missing.length > 0) {
      // Не падаємо: одна незареєстрована адреса не повинна блокувати решту.
      console.warn(
        `⚠️  Не знайдено серед зареєстрованих (${missing.length}): ${missing.join(", ")}`,
      );
      console.warn(
        "    Ці люди ще не створили акаунт — видай їм доступ пізніше.\n",
      );
    }
    if (found.size === 0) {
      console.error("Жодного з указаних email немає в базі — нічого робити.");
      process.exit(1);
    }

    const userIds = [...found.values()];
    console.log(
      `${REVOKE ? "Відкликаю" : "Видаю"} Pro для ${found.size} акаунт(ів):`,
    );
    for (const email of found.keys()) console.log(`  ${email}`);
    if (!REVOKE) console.log(`Термін: ${DAYS} днів від зараз.`);
    console.log("─".repeat(60));

    // Суха перевірка виконує ТІ САМІ запити й відкочує їх. Так вона ловить
    // помилку в SQL (битий ON CONFLICT, знята міграція, невідповідний CHECK)
    // до того, як та щось зачепить — на відміну від друку плану, який
    // перевіряє лише те, що я правильно склав рядок.
    await client.query("BEGIN");
    try {
      if (REVOKE) {
        const n = await revoke(client, userIds);
        console.log(`Відкликано підписок: ${n}`);
      } else {
        const { created, updated } = await grant(client, userIds, DAYS);
        console.log(`Створено: ${created}, оновлено: ${updated}`);
      }

      if (DRY_RUN) {
        await client.query("ROLLBACK");
        console.log(
          "\n--dry-run: транзакцію відкочено, у базі нічого не змінилось.",
        );
      } else {
        await client.query("COMMIT");
        console.log("\nГотово — зміни збережені.");
        console.log(
          REVOKE
            ? "Доступ зникне після того, як у людини оновиться кеш плану (перезавантаження сторінки)."
            : "Тестери побачать Pro після перезавантаження сторінки.",
        );
      }
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
