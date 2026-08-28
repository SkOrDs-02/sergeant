/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * AI-CONTEXT: попередня версія цієї перевірки жила в
 * `assistantCatalogue.test.ts` і звіряла каталог із **рукописною копією**
 * набору, оголошеною в тому ж тестовому файлі. Вона була зелена, поки в
 * продукті співіснували чотири різні набори — бо копія в тесті збігалась
 * сама з собою. Тут порівнюються реальні множини, і жодного літерального
 * списку id у файлі немає навмисно: список, оголошений у тесті, старіє
 * рівно так само, як старів попередній.
 */
import { describe, expect, it } from "vitest";

import { ASSISTANT_CAPABILITIES } from "./assistantCatalogue";
import {
  RISKY_TOOL_IDS,
  TOOL_RISK,
  isRiskyTool,
  requiresConfirmation,
} from "./toolRisk";

const capabilityIds = new Set(ASSISTANT_CAPABILITIES.map((c) => c.id));
const catalogueRisky = new Set(
  ASSISTANT_CAPABILITIES.filter((c) => c.risky).map((c) => c.id),
);

describe("TOOL_RISK ↔ каталог здібностей", () => {
  it("жоден ризиковий id не є привидом — усі існують у каталозі", () => {
    // Робить неможливим стан, у якому набір містить інструмент, якого в
    // продукті немає. Саме так у web-копії роками жив `delete_workout`:
    // ані серверного tool-def, ані клієнтського хендлера, ані запису в
    // каталозі — але UI цілком серйозно вважав його ризиковим.
    const ghosts = [...RISKY_TOOL_IDS].filter((id) => !capabilityIds.has(id));
    expect(ghosts).toEqual([]);
  });

  it("множини збігаються в ОБИДВА боки", () => {
    // Порівнюємо множини, а не кількості: збіг довжин нічого не доводить.
    expect(new Set(catalogueRisky)).toEqual(new Set(RISKY_TOOL_IDS));
  });

  it("кожен ризиковий інструмент має явний режим, без дефолту", () => {
    // `TOOL_RISK[x] ?? "reversible"` було б найзручнішою і найгіршою
    // помилкою: новий деструктивний інструмент тихо отримав би
    // наймʼякший режим і виконувався б без підтвердження.
    for (const id of RISKY_TOOL_IDS) {
      expect(["destructive", "reversible"]).toContain(TOOL_RISK[id]);
    }
  });

  it("підтвердження вимагають саме незворотні дії", () => {
    // Рішення founder-а #8: «Тільки незворотне (видалення, перезапис)».
    // Асерт фіксує межу поіменно — зсув в будь-який бік має бути свідомим
    // рішенням, а не побічним ефектом рефакторингу.
    const confirming = [...RISKY_TOOL_IDS].filter(requiresConfirmation).sort();
    expect(confirming).toEqual([
      "batch_categorize",
      // Стирає всі позиції активної комори одним викликом, без undo.
      "clear_pantry",
      "delete_transaction",
      "forget",
      "import_monobank_range",
    ]);
  });

  it("оборотні дії НЕ вимагають підтвердження", () => {
    // Друга половина рішення #8: «Решта — одразу, з кнопкою скасувати».
    // Без цього асерта найпростіший спосіб «полагодити» падіння —
    // позначити все як destructive, і діалог почне зʼявлятись на кожну дію.
    expect(requiresConfirmation("hide_transaction")).toBe(false);
    expect(requiresConfirmation("archive_habit")).toBe(false);
  });

  it("B39: overwrite-інструменти Фініка класифіковано reversible, не destructive", () => {
    // `set_budget_limit`, `set_monthly_plan`, `update_budget`,
    // `change_category` перезаписують значення без явної згоди людини —
    // до фіксу B39 вони взагалі не мали запису в `TOOL_RISK`, тобто ні
    // блокуючого підтвердження, ні undo. Founder уточнив межу: вони
    // reversible (мають робочий `undo`), а не destructive — модал НЕ
    // повинен їх блокувати.
    for (const id of [
      "set_budget_limit",
      "set_monthly_plan",
      "update_budget",
      "change_category",
    ]) {
      expect(TOOL_RISK[id]).toBe("reversible");
      expect(requiresConfirmation(id)).toBe(false);
      expect(isRiskyTool(id)).toBe(true);
    }
  });

  it("нериковий інструмент не проходить жоден із гейтів", () => {
    expect(isRiskyTool("create_transaction")).toBe(false);
    expect(requiresConfirmation("create_transaction")).toBe(false);
    expect(requiresConfirmation("невідомий_інструмент")).toBe(false);
  });
});
