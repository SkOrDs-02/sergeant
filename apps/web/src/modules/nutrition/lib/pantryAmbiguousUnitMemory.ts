/**
 * Last validated: 2026-09-01
 * Status: Active
 * Памʼять вибору «шт чи г?» для голих чисел без одиниці (UX-4 аудиту
 * 2026-09-01, канон nutrition §6 «Дані про їжу», рішення founder-а: не
 * вгадуємо одиницю, перепитуємо — але лише один раз на продукт).
 *
 * Сховище — той самий `nutritionStorage` (localStorage через `webKVStore`),
 * що вже тримає денний/тижневий план (`planStorage.ts`): це персональна,
 * пристрій-локальна звичка людини казати «Нутелла — це грами», а не
 * доменний факт комори. Синхронізація між пристроями свідомо не потрібна —
 * гірший випадок без неї це одне зайве уточнення на новому пристрої, а не
 * втрата даних.
 *
 * Ключ — `canonicalFoodKey` (та сама нормалізація, що й злиття позицій
 * комори): «Нутелла» і «нутелли» мають лягти в одну й ту саму пам'ять.
 */
import { nutritionStorage } from "./nutritionStorageInstance";

export const NUTRITION_PANTRY_AMBIGUOUS_UNIT_MEMORY_KEY =
  "nutrition_pantry_ambiguous_unit_memory_v1"; // gitleaks:allow

/** Дві одиниці, між якими реально плутається голе число (UX-4). */
export type AmbiguousPantryUnit = "шт" | "г";

function isAmbiguousUnit(value: unknown): value is AmbiguousPantryUnit {
  return value === "шт" || value === "г";
}

function readMemory(): Record<string, AmbiguousPantryUnit> {
  const raw = nutritionStorage.readJSON<unknown>(
    NUTRITION_PANTRY_AMBIGUOUS_UNIT_MEMORY_KEY,
    null,
  );
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, AmbiguousPantryUnit> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key && isAmbiguousUnit(value)) out[key] = value;
  }
  return out;
}

/**
 * Повертає одиницю, яку людина вже обрала для цього продукту раніше, або
 * `null`, якщо про нього ще ніхто не питав. `canonicalKey` — вихід
 * `canonicalFoodKey(name)`, той самий ключ, що й у злитті позицій.
 */
export function getRememberedAmbiguousUnit(
  canonicalKey: string,
): AmbiguousPantryUnit | null {
  if (!canonicalKey) return null;
  return readMemory()[canonicalKey] ?? null;
}

/**
 * Записує явний вибір людини: наступного разу той самий продукт більше не
 * питає. Викликається лише на явний тап («шт» чи «г»), ніколи на мовчазний
 * дефолт парсера — інакше перше ж «прийняв як є» назавжди зафіксувало б
 * здогадку як факт.
 */
export function rememberAmbiguousUnitChoice(
  canonicalKey: string,
  unit: AmbiguousPantryUnit,
): void {
  if (!canonicalKey) return;
  const next = { ...readMemory(), [canonicalKey]: unit };
  nutritionStorage.writeJSON(NUTRITION_PANTRY_AMBIGUOUS_UNIT_MEMORY_KEY, next);
}

/** Test-only: скидає локальний buffer, щоб тести не тікали одне на одного. */
export function __resetAmbiguousUnitMemoryForTests(): void {
  nutritionStorage.removeItem(NUTRITION_PANTRY_AMBIGUOUS_UNIT_MEMORY_KEY);
}
