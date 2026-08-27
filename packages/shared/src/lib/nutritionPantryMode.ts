import type { PantryMode } from "../schemas/api";

/**
 * Єдина користувацька причина, чому режим «Тільки з наявного» не може
 * стартувати. Не обіцяємо довільні «2–3» продукти: один валідний продукт уже
 * є непорожньою коморою, навіть якщо результат буде простим.
 */
export const PANTRY_ONLY_EMPTY_MESSAGE =
  "Додай у комору хоча б один продукт, щоб генерувати тільки з наявного.";

/**
 * Перевіряє саме придатні для промпту позиції, а не довжину масиву.
 * Схема історично приймає порожній рядок і обʼєкт без `name`, але генератор
 * відкидає їх — такий масив усе одно означає порожню комору.
 */
export function hasUsablePantryItems(pantry: unknown): boolean {
  if (!Array.isArray(pantry)) return false;

  return pantry.some((item) => {
    if (typeof item === "string") return item.trim().length > 0;
    if (!item || typeof item !== "object") return false;
    const name = (item as { name?: unknown }).name;
    return typeof name === "string" && name.trim().length > 0;
  });
}

/**
 * `null` означає, що генерацію можна запускати. Лише `only` вимагає
 * непорожньої комори; `prefer` та `ignore` коректно працюють і без неї.
 */
export function pantryModeAvailabilityError(
  pantry: unknown,
  mode: PantryMode | null | undefined,
): string | null {
  return mode === "only" && !hasUsablePantryItems(pantry)
    ? PANTRY_ONLY_EMPTY_MESSAGE
    : null;
}
