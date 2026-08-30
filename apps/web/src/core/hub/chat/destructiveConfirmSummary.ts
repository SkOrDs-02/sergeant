/**
 * Last validated: 2026-08-25
 * Status: Active
 *
 * Компактний людський опис аргументів деструктивного tool-виклику для
 * `DestructiveConfirmModal` (audit B39, canon `hub-coach` §8).
 *
 * AI-CONTEXT: до фіксу B39 діалог показував лише ІМʼЯ інструмента —
 * користувач погоджувався на «batch_categorize» не бачачи ні патерна, ні
 * скільки транзакцій воно зачепить. Ця функція рахує підсумок ЛИШЕ з уже
 * наявних аргументів моделі (`tc.input`), синхронно й без жодного читання
 * сховища чи повторного прогону пошуку/фільтра — модал стоїть ПЕРЕД
 * виконанням, а дублювати бізнес-логіку виконавця тут означало б два
 * місця, які можуть розійтись.
 *
 * Тому для `batch_categorize` число — це СТЕЛЯ запиту (`clampLimit` у
 * `finykActions/search.ts`, 1..50, дефолт 20), а не гарантована кількість
 * знайдених транзакцій: справжнє число зʼявиться лише в тексті результату
 * ПІСЛЯ виконання. Текст навмисно каже «до N», а не «N» — це чесна межа,
 * а не омана.
 */

const BATCH_CATEGORIZE_DEFAULT_LIMIT = 20;
const BATCH_CATEGORIZE_MAX_LIMIT = 50;

function clampBatchLimit(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return BATCH_CATEGORIZE_DEFAULT_LIMIT;
  return Math.min(BATCH_CATEGORIZE_MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

/**
 * `undefined` — інструмент або не має аргументів, вартих показу
 * (`clear_pantry` не приймає жодних), або аргумент, потрібний для
 * підсумку, відсутній/невалідний. Модал у цьому разі просто не покаже
 * другий рядок під назвою інструмента.
 */
export function summarizeDestructiveToolInput(
  name: string,
  input: Record<string, unknown>,
): string | undefined {
  switch (name) {
    case "batch_categorize": {
      const rawPattern = input["pattern"];
      const pattern = typeof rawPattern === "string" ? rawPattern.trim() : "";
      const limit = clampBatchLimit(input["limit"]);
      return pattern
        ? `патерн «${pattern}», до ${limit} транзакцій`
        : `до ${limit} транзакцій`;
    }
    case "delete_transaction": {
      const rawTxId = input["tx_id"];
      const txId = typeof rawTxId === "string" ? rawTxId.trim() : "";
      return txId ? `транзакція ${txId}` : undefined;
    }
    case "forget": {
      const rawFactId = input["fact_id"];
      const factId = typeof rawFactId === "string" ? rawFactId.trim() : "";
      return factId ? `запис ${factId}` : undefined;
    }
    case "import_monobank_range": {
      const rawFrom = input["from"];
      const rawTo = input["to"];
      const from = typeof rawFrom === "string" ? rawFrom.trim() : "";
      const to = typeof rawTo === "string" ? rawTo.trim() : "";
      // Коротке «–», а не довге «—»: тут тире несе граматику діапазону,
      // а не паузу в реченні (канон §9а). Довге лишалось би ШІ-тиром і
      // тепер червонить `sergeant-design/ukrainian-copy`.
      return from && to ? `період ${from} – ${to}` : undefined;
    }
    case "clear_pantry":
      return "усі позиції активної комори";
    default:
      return undefined;
  }
}
