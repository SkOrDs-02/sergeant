/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Запит на ПОСТІЙНЕ сховище для цього origin.
 *
 * AI-CONTEXT: місце на диску браузер дає сайту в користування, а не у
 * власність. Типове (best-effort) сховище система має право стерти першим —
 * коли на пристрої закінчується місце, або коли сайтом довго не
 * користувались (у Safari це окреме анти-трекінгове правило). Для
 * офлайн-first продукту це не дрібниця: локальна копія тут не кеш, а
 * подеколи ЄДИНА копія — черга `sync_op_outbox` зберігає записи, яких на
 * сервері ще немає (звіт власника 2026-09-14: 1356 таких операцій).
 *
 * `navigator.storage.persist()` перемикає сховище origin у режим
 * `persistent`: браузер більше не витирає його під тиском місця й не
 * застосовує до нього анти-трекінгове прибирання. Рішення ухвалює САМЕ
 * браузер за власними критеріями (додано на домашній екран, частота
 * візитів, дозволи) — гарантії немає, але й ціна запиту нульова.
 *
 * AI-DANGER: не робити з результату гейт. `false` — це нормальний стан, а
 * не помилка: застосунок мусить працювати однаково і з постійним, і з
 * тимчасовим сховищем. Єдиний наслідок відмови — запис у Sentry, щоб було
 * видно, наскільки часто браузери відмовляють реальним користувачам.
 */
import { addSentryBreadcrumb, setSentryTag } from "../observability/sentry";

export type PersistentStorageOutcome =
  /** Сховище вже було постійним — запит не потрібен. */
  | "already-persisted"
  /** Браузер задовольнив запит. */
  | "granted"
  /** Браузер відмовив — сховище лишається best-effort. */
  | "denied"
  /** API немає (старий браузер, SSR, тести). */
  | "unsupported"
  /** Виклик кинув — трактуємо як відсутність постійності. */
  | "failed";

/**
 * Просить постійне сховище один раз за завантаження застосунку.
 *
 * Ніколи не кидає і нічого не гейтить — повертає результат лише для
 * телеметрії й тестів.
 */
export async function requestPersistentStorage(): Promise<PersistentStorageOutcome> {
  const storage: StorageManager | undefined =
    typeof navigator === "undefined" ? undefined : navigator.storage;
  if (
    !storage ||
    typeof storage.persist !== "function" ||
    typeof storage.persisted !== "function"
  ) {
    return "unsupported";
  }

  let outcome: PersistentStorageOutcome;
  try {
    // Спершу питаємо стан: у вже постійному сховищі повторний `persist()`
    // безглуздий, а в деяких браузерах ще й показує запит дозволу.
    outcome = (await storage.persisted())
      ? "already-persisted"
      : (await storage.persist())
        ? "granted"
        : "denied";
  } catch (err) {
    addSentryBreadcrumb({
      category: "storage",
      level: "warning",
      message: "storage.persist threw",
      data: { error: err instanceof Error ? err.message : String(err) },
    });
    outcome = "failed";
  }

  // Тег, а не подія: це властивість СЕСІЇ, і в Sentry його хочеться бачити
  // поруч із будь-яким іншим збоєм сховища — зокрема з `SQLITE_IOERR`.
  setSentryTag("storage.persisted", outcome);
  addSentryBreadcrumb({
    category: "storage",
    level: outcome === "denied" || outcome === "failed" ? "warning" : "info",
    message: "storage persistence resolved",
    data: { outcome },
  });
  return outcome;
}
