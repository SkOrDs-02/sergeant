/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Ранній сигнал проти циклу `receipts` ↔ `toolContract`.
 *
 * Історія конкретна. `toolContract.ts` брав розміри запитів прямо з
 * `receipts.ts`, а `receipts.ts` імпортує `toolContract.ts` заради звірки
 * контракту. В ESM це не помилка збірки: коли першим вантажиться
 * `receipts`, `toolContract` отримує його напів-ініціалізованим і падає на
 * `ReferenceError: Cannot access 'ONLINE_ORDERS_PAGE_SIZE' before
 * initialization` — тобто сервер НЕ ПІДНІМАЄТЬСЯ взагалі.
 *
 * Звичайні юніти цього не бачать: вони імпортують `toolContract` окремо, і
 * в такому порядку цикл нешкідливий. Спіймав тільки E2E — по тому, що
 * сервер не відповів і джоба вийшла по таймауту. Ціна діагнозу була
 * непропорційна причині, тож тут стоїть дешевий сторож: перевіряє рівно
 * той порядок завантаження, у якому ламалось, і називає файл одразу.
 */
import { describe, it, expect } from "vitest";

describe("порядок завантаження модулів Сільпо", () => {
  async function read(name: string): Promise<string> {
    const { readFile } = await import("node:fs/promises");
    return readFile(new URL(`./${name}`, import.meta.url), "utf8");
  }

  // ЧОМУ СТАТИЧНА ПЕРЕВІРКА, А НЕ ПРОГІН ІМПОРТУ. Перша версія цього тесту
  // вантажила `receipts` і `toolContract` у тому ж порядку, що й сервер, і
  // була ПОРОЖНЬОЮ: під vite-node цикл нешкідливий, тож тест зеленів і на
  // зламаному коді (перевірено — стара версія модулів його не валила).
  // Ламається саме нодовий ESM у проді, відтворити який у Vitest немає чим.
  // Тому сторожимо не симптом, а саме ребро графа, яке його створює.
  it("toolContract не імпортує receipts — це ребро й давало цикл", async () => {
    const src = await read("toolContract.ts");
    expect(src).not.toMatch(/from\s+"\.\/receipts\.js"/);
  });

  it("модуль лімітів лишається листом — без власних імпортів", async () => {
    const src = await read("orderLimits.ts");
    // Один імпорт тут повертає цикл рівно тим шляхом, яким він уже
    // приїжджав, тож дешевше заборонити їх усі.
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});
