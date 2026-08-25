/**
 * Last validated: 2026-08-25
 * Status: Active
 *
 * Вимірювання точності детермінованого мапера на РЕАЛЬНИХ назвах позицій
 * із чеків Сільпо.
 *
 * Навіщо це є. Питання «чи варто вкладатись в AI-мапер» неможливо
 * відповісти без базової лінії: без числа будь-яка нова версія «здається
 * кращою». Тут воно й рахується — і саме воно потім скаже, чи AI щось
 * реально дає, чи просто інакше помиляється.
 *
 * Фікстура — `receiptItems.golden.tsv`, три колонки через TAB:
 *
 *     назва позиції<TAB>category_slug або порожньо<TAB>правильна категорія
 *
 * Третя колонка — розмітка ЛЮДИНОЮ. Порожня = «ще не розмічено»: такий
 * рядок не валить тест, а йде в звіт, щоб було видно залишок роботи.
 *
 * ## Як наповнити
 *
 * 1. Вивантаж назви (запит — у § нижче), поклади сюди дві перші колонки.
 * 2. `GOLDEN_SEED=1 pnpm --filter @sergeant/finyk-domain exec vitest run \
 *      src/domain/receiptSplitSuggestion.golden.test.ts`
 *    надрукує готовий TSV, де третю колонку вже заповнено ВІДПОВІДДЮ
 *    МАПЕРА. Перенаправ у файл і виправ руками те, що мапер вгадав
 *    неправильно, — це швидше, ніж розмічати з нуля.
 * 3. Далі тест просто рахує точність і тримає поріг знизу.
 *
 * SQL для кроку 1 (підстав свій `user_id`; частота — щоб розмічати
 * спершу те, що трапляється найчастіше):
 *
 * ```sql
 * SELECT i.name, COALESCE(i.category_slug, '') AS slug, COUNT(*) AS n
 *   FROM silpo_receipt_items i
 *  WHERE i.user_id = '<user_id>'
 *  GROUP BY i.name, i.category_slug
 *  ORDER BY n DESC, i.name;
 * ```
 *
 * > **Приватність.** Колонку `n` у фікстуру НЕ клади: репозиторій
 * > публічний, і частоти перетворюють список товарів на журнал покупок.
 * > Самі назви — це продуктовий словник; сум, дат і кількостей тут немає
 * > свідомо.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalManualCategoryId } from "../lib/manualTaxonomy.js";
import { mapReceiptItemToCategory } from "./receiptSplitSuggestion";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "receiptItems.golden.tsv",
);

/**
 * Поріг знизу. Це храповик, а не мета: підняти його можна лише разом із
 * реальним покращенням мапера. Стартове значення виставляється за першим
 * прогоном на живій фікстурі — доти лишається `null` і тест лише звітує.
 */
const MIN_ACCURACY: number | null = null;

interface GoldenRow {
  name: string;
  slug: string;
  expected: string;
}

function readFixture(): GoldenRow[] {
  if (!existsSync(FIXTURE)) return [];
  return readFileSync(FIXTURE, "utf8")
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const [name = "", slug = "", expected = ""] = line.split("\t");
      return {
        name: name.trim(),
        slug: slug.trim(),
        expected: expected.trim(),
      };
    })
    .filter((row) => row.name);
}

function actualFor(row: GoldenRow): string {
  return mapReceiptItemToCategory({
    name: row.name,
    categorySlug: row.slug || null,
    priceKop: 1,
  });
}

describe("мапер позицій чека — точність на живих назвах", () => {
  const rows = readFixture();

  it.skipIf(rows.length === 0)("тримає поріг точності і звітує промахи", () => {
    const labelled = rows.filter((r) => r.expected);
    // Порівнюємо КАНОНІЧНІ id, а не сирі слаги: `groceries` і `food` — той
    // самий кошик, і людина, що розмічає, не має вгадувати, який із двох
    // аліасів поверне мапер.
    const misses = labelled
      .map((row) => ({ row, actual: actualFor(row) }))
      .filter(
        ({ row, actual }) =>
          canonicalManualCategoryId(actual) !==
          canonicalManualCategoryId(row.expected),
      );

    const accuracy = labelled.length
      ? (labelled.length - misses.length) / labelled.length
      : 0;

    // Звіт друкується ЗАВЖДИ, не лише на падінні: число потрібне саме
    // тоді, коли тест зелений, — інакше нема з чим порівняти AI-версію.
    const report = [
      `розмічено ${labelled.length} з ${rows.length}`,
      `точність ${(accuracy * 100).toFixed(1)}%`,
      `промахів ${misses.length}`,
    ].join(" · ");
    console.info(`[golden] ${report}`);
    for (const { row, actual } of misses.slice(0, 40)) {
      console.info(`[golden] «${row.name}» → ${actual}, треба ${row.expected}`);
    }

    if (MIN_ACCURACY !== null) {
      expect(accuracy, report).toBeGreaterThanOrEqual(MIN_ACCURACY);
    }
  });

  // Явний зелений рядок замість тиші: інакше повністю проскіпаний файл
  // виглядає так само, як відсутній, і про незібрану базову лінію легко
  // забути.
  it.skipIf(rows.length > 0)(
    "фікстури ще немає — вимірювати нема на чому",
    () => {
      expect(rows).toHaveLength(0);
    },
  );

  it.skipIf(!process.env["GOLDEN_SEED"])(
    "GOLDEN_SEED=1 — друкує TSV із відповідями мапера для ручної правки",
    () => {
      for (const row of rows) {
        console.info(`${row.name}\t${row.slug}\t${actualFor(row)}`);
      }
      expect(rows.length).toBeGreaterThan(0);
    },
  );
});
