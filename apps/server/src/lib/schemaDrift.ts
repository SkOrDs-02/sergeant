/**
 * Детектор розбіжності «схема в образі ↔ схема в базі».
 *
 * Навіщо. За два тижні серпня 2026 прод тричі віддавав 500 через колонки,
 * яких у базі не існувало, хоча відповідні міграції лежали в тому ж релізі:
 *
 *   - `sergeant@29a02d3` — `column "is_jar" does not exist`        (133 події)
 *   - `sergeant@758a296` — `column "last_token_check_at" ...`      (90 подій)
 *   - `sergeant@fb1b1a5` — `column "active_modules" does not exist` (9 подій)
 *
 * Міграції 119/120/116 були в репо — просто не застосувались у проді.
 * `migrate.mjs` сам по собі чесний: він виходить із кодом 1 на будь-якій
 * помилці. Прогалина не в ньому, а в тому, що НІХТО не звіряв результат:
 * контейнер спокійно піднімався на старій схемі, і єдиним сигналом ставав
 * потік 500-ок від живих користувачів. Найдовший епізод — 106 хвилин.
 *
 * Що робить цей модуль. Порівнює список міграцій, що поїхали в образі, з
 * рядками `schema_migrations` і дає структурований звіт. Виклик на старті
 * перетворює «223 помилки за півтори години» на один алерт на нульовій
 * секунді, ДО того як прилетить перший запит.
 *
 * Чому за замовчуванням не блокує readiness: хибне спрацювання тут коштувало б
 * повного простою (Coolify перестав би маршрутизувати трафік і відкотив би
 * цілком справний деплой — так уже було 2026-08-06 з health-check-ом без
 * `/bin/wget`). Тому дефолт — гучно повідомити, а фейл-стоп вмикається
 * свідомо через `MIGRATION_DRIFT_BLOCKS_READINESS`.
 */

import { access } from "node:fs/promises";
import type { Pool } from "pg";
import { MIGRATIONS_DIR, listShippedMigrations } from "../db.js";
import { logger } from "../obs/logger.js";

export interface SchemaDriftReport {
  /** Скільки міграцій містить образ. */
  shipped: number;
  /** Скільки з них позначені застосованими в базі. */
  applied: number;
  /**
   * Є в образі, немає в базі. Непорожній список — та сама ситуація, що дала
   * три інциденти: код уже очікує нових колонок, база про них не знає.
   */
  pending: string[];
  /**
   * Є в базі, немає в образі. Означає відкат на старіший образ поверх уже
   * мігрованої бази. Саме по собі не аварія (міграції additive-first), але
   * знати про це треба.
   */
  unknown: string[];
  /**
   * Каталогу міграцій немає в образі взагалі.
   *
   * Це НЕ те саме, що «жодної міграції не чекає»: порожній список від
   * відсутнього каталогу невідрізнимий від справді синхронної схеми — на
   * свіжій базі обидва дають `shipped: 0, applied: 0`. Якби зламана збірка
   * викинула `src/migrations` з образу, детектор мовчки рапортував би
   * «здорово» і не підняв би жодного алерту — тобто гарантія, заради якої він
   * існує, тихо зникла б. Тому стан позначаємо окремо і не вважаємо
   * синхронним.
   */
  migrationsDirMissing: boolean;
  /** `true`, коли `pending` порожній і каталог міграцій на місці. */
  inSync: boolean;
}

/**
 * Звіряє образ із базою.
 *
 * Кидає лише на недоступній базі — відсутність таблиці `schema_migrations`
 * трактується як «не застосовано нічого», бо це рівно стан свіжої бази, у яку
 * pre-deploy так і не сходив.
 */
export async function checkSchemaDrift(
  pool: Pick<Pool, "query">,
): Promise<SchemaDriftReport> {
  const shipped = await listShippedMigrations();

  // `MIGRATIONS_DIR` рахується від `__dirname`, тож чужий cwd цього стану дати
  // не може — лише реально зламаний артефакт збірки.
  let migrationsDirMissing = false;
  try {
    await access(MIGRATIONS_DIR);
  } catch {
    migrationsDirMissing = true;
  }

  // Наявність таблиці перевіряємо ОКРЕМИМ запитом, а не умовою у `WHERE`:
  // `SELECT ... FROM schema_migrations` падає ще на плануванні, якщо
  // відношення не існує, тож жоден предикат до цього не дійшов би. Відсутня
  // таблиця — не помилка, а рівно стан бази, в яку pre-deploy не сходив
  // жодного разу.
  const existing = await pool.query<{ reg: string | null }>(
    "SELECT to_regclass('public.schema_migrations') AS reg",
  );
  const appliedSet = new Set<string>();
  if (existing.rows[0]?.reg) {
    const { rows } = await pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations",
    );
    for (const row of rows) appliedSet.add(row.name);
  }

  const pending = shipped.filter((name) => !appliedSet.has(name));
  const shippedSet = new Set(shipped);
  const unknown = [...appliedSet]
    .filter((name) => !shippedSet.has(name))
    .sort();

  return {
    shipped: shipped.length,
    applied: appliedSet.size,
    pending,
    unknown,
    migrationsDirMissing,
    inSync: pending.length === 0 && !migrationsDirMissing,
  };
}

/**
 * `true`, коли дрейф має валити readiness-пробу.
 *
 * Опт-ін: див. doc-string модуля про ціну хибного спрацювання.
 */
export function driftBlocksReadiness(): boolean {
  return process.env["MIGRATION_DRIFT_BLOCKS_READINESS"] === "true";
}

/**
 * Кеш останнього звіту. Readiness-проба зобовʼязана лишатись дешевою (її
 * смикають кожні кілька секунд), тож повторно читати каталог і ходити в
 * `schema_migrations` на кожен виклик не можна. Схема між рестартами не
 * змінюється — pre-deploy відпрацьовує до старту процесу.
 */
let lastReport: SchemaDriftReport | null = null;

/**
 * Стан стартової перевірки. Потрібен окремо від `lastReport`, бо `null` там
 * означає одразу дві різні речі — «ще не рахували» і «порахувати не вдалося», —
 * а readiness мусить їх розрізняти.
 *
 * `checking` виставляється СИНХРОННО, до `app.listen`. Інакше між підняттям
 * порту і резолвом запиту в `schema_migrations` існує вікно, у якому
 * `getLastSchemaDriftReport()` віддає `null`, гейт вважає це «дрейфу немає», і
 * `/readyz` пускає трафік на контейнер із неперевіреною схемою — тобто рівно
 * те, що гейт має не допустити.
 */
export type SchemaDriftCheckState = "idle" | "checking" | "done" | "failed";

let checkState: SchemaDriftCheckState = "idle";

export function getSchemaDriftCheckState(): SchemaDriftCheckState {
  return checkState;
}

/**
 * Позначає перевірку як розпочату. Викликається синхронно на буті, ДО того як
 * платформа отримає перший readiness-запит.
 */
export function markSchemaDriftCheckStarted(): void {
  checkState = "checking";
}

export function getLastSchemaDriftReport(): SchemaDriftReport | null {
  return lastReport;
}

/** Скидання кешу між тест-кейсами. */
export function __resetSchemaDriftCacheForTests(): void {
  lastReport = null;
  checkState = "idle";
}

/**
 * Стартова перевірка: рахує звіт, кешує його і піднімає галас, якщо схема
 * відстала. Ніколи не кидає — обсервабіліті не має права завалити бут.
 *
 * @param captureMessage Транспорт алерту (у проді — `Sentry.captureMessage`).
 *   Інжектиться, щоб модуль лишався тестованим без Sentry.
 */
export async function reportSchemaDriftAtBoot(
  pool: Pick<Pool, "query">,
  captureMessage: (message: string, context: SchemaDriftReport) => void,
): Promise<SchemaDriftReport | null> {
  markSchemaDriftCheckStarted();

  let report: SchemaDriftReport;
  try {
    report = await checkSchemaDrift(pool);
  } catch (e: unknown) {
    checkState = "failed";
    logger.warn({
      msg: "schema_drift_check_failed",
      err: { message: e instanceof Error ? e.message : String(e) },
    });
    return null;
  }

  lastReport = report;
  checkState = "done";

  if (report.unknown.length > 0) {
    logger.warn({
      msg: "schema_drift_unknown_migrations",
      unknown: report.unknown,
      hint: "База мігрована далі, ніж цей образ — схоже на відкат на старіший реліз.",
    });
  }

  if (report.inSync) {
    logger.info({
      msg: "schema_drift_none",
      shipped: report.shipped,
      applied: report.applied,
    });
    return report;
  }

  // Зламаний артефакт і відсталу базу лікують по-різному, тож і повідомлення
  // різні: у першому випадку `migrate.js` не допоможе — міграцій в образі
  // просто немає.
  const message = report.migrationsDirMissing
    ? "Schema drift: the migrations directory is missing from this image — schema state cannot be verified at all."
    : `Schema drift: ${report.pending.length} migration(s) shipped but not applied — endpoints touching the new columns will 500.`;

  logger.error({
    msg: report.migrationsDirMissing
      ? "schema_migrations_dir_missing"
      : "schema_drift_detected",
    shipped: report.shipped,
    applied: report.applied,
    pending: report.pending,
    migrationsDirMissing: report.migrationsDirMissing,
    blocksReadiness: driftBlocksReadiness(),
    hint: report.migrationsDirMissing
      ? "Каталог `src/migrations` не потрапив в образ — перевір збірку (`Dockerfile.api`, крок копіювання міграцій)."
      : "Pre-deploy міграції не відпрацювали. Запусти `node dist-server/migrate.js` проти цієї бази перед тим, як пускати трафік.",
  });

  try {
    captureMessage(message, report);
  } catch {
    // Транспорт алерту не має права завалити бут.
  }

  return report;
}
