/**
 * Last validated: 2026-11-25
 * Status: Active
 *
 * Тіньовий режим прапорця анонімної партиції і опортуністичний peek
 * (спека `anonymous-migration-fast-path.md`, PR2). Поведінку гейта тут не
 * змінено: повна розвідка йде на кожному вході, як і раніше. Прапорець лише
 * прогнозує її результат, а розбіжності «CLEAN, але рядки є» йдуть у
 * Sentry. PR3 вмикає швидкий шлях лише після того, як таких розбіжностей
 * на реальному трафіку не буде.
 */
import { addSentryBreadcrumb, captureException } from "../observability/sentry";
import { preflightAnonymousRows } from "./anonymousPartitionPreflight.js";
import {
  markAnonPartitionCleanIfUnchanged,
  readAnonPartitionState,
  readAnonPartitionToken,
  type AnonPartitionState,
} from "./anonPartitionState.js";

/** Прапорець сказав CLEAN, а повна розвідка знайшла анонімні рядки. */
export class AnonPartitionStaleCleanError extends Error {
  override name = "AnonPartitionStaleCleanError";
}

function mark(name: string): void {
  try {
    performance.mark(name);
  } catch {
    // Без User Timing позначка просто не зʼявиться.
  }
}

/**
 * Звірити прогноз прапорця, прочитаний ДО розвідки, з її результатом.
 * Ідентифікаторів і вмісту рядків тут немає: лише стан і кількість.
 */
export function reportAnonPartitionShadow(
  predicted: AnonPartitionState,
  sourceRows: number,
): void {
  addSentryBreadcrumb({
    category: "storage",
    level: "info",
    message: "anon-gate: shadow verdict",
    data: { predicted, found: sourceRows > 0 },
  });
  if (predicted === "clean" && sourceRows === 0) {
    mark("anon-gate:shadow-would-skip");
  }
  if (predicted === "clean" && sourceRows > 0) {
    captureException(
      new AnonPartitionStaleCleanError(
        `flag predicted clean, probe found ${sourceRows} anonymous rows`,
      ),
      { level: "warning", tags: { area: "anon-gate", shadow: "stale-clean" } },
    );
  }
}

/** Затримка peek після анонімного буту: не конкурувати з першим рендером. */
export const ANON_PEEK_DELAY_MS = 3000;

/**
 * Перевірити анонімну партицію, поки вона й так активна (людина на
 * `/sign-in` чи в застосунку без акаунта), і поставити CLEAN, якщо preflight
 * ДОВІВ, що переносити нічого.
 *
 * AI-DANGER: перевіряємо, що активна саме анонімна партиція, до і після
 * відкриття бази: інакше preflight ішов би по файлу акаунта. Якщо посеред
 * peek стався вхід, хендл закриється, запит кине, і стан не зміниться.
 *
 * Відхилення від таблиці переходів спеки: peek ставить CLEAN і з DIRTY, не
 * лише з UNKNOWN. Доказ той самий, що в повної розвідки для переходу
 * DIRTY → CLEAN (preflight `"empty"` = повні журнали міграцій і жодного
 * рядка `local-anon`), а порівняння-і-запис ловить запис посеред peek. Без
 * цього DIRTY від міграцій схем на анонімному буті (вони пишуть у модульні
 * таблиці) закривав би швидкий шлях саме на свіжому пристрої.
 */
export async function peekAnonymousPartition(): Promise<void> {
  try {
    if (readAnonPartitionState() === "clean") return;
    const sqlite = await import("../db/sqlite.js");
    if (sqlite.readActiveSqliteUserId() !== null) return;
    const token = readAnonPartitionToken();
    const handle = await sqlite.getSqliteDb();
    if (sqlite.readActiveSqliteUserId() !== null) return;
    if ((await preflightAnonymousRows(handle.migrationClient())) !== "empty")
      return;
    if (sqlite.readActiveSqliteUserId() !== null) return;
    if (markAnonPartitionCleanIfUnchanged(token)) mark("anon-gate:peek-clean");
  } catch {
    // Peek лише оптимізація: збій лишає стан як був.
  }
}
