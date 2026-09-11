/**
 * Last validated: 2026-09-08
 * Status: Active
 *
 * Фільтр місць зберігання. Саме фільтр, а не вкладки: вкладки роблять
 * кожне місце окремим екраном і повертають ту саму сліпоту («що є вдома?»),
 * тільки під іншим ярликом. Категорії лишаються головним групуванням —
 * місце звужує список.
 *
 * ОДИН нативний селект, а не рядок чипів. Чипи були першою спробою і
 * програли на 393px: чотири штуки не влазять у рядок, з переносом займають
 * два ряди й перетягують увагу на себе, а з горизонтальним скролом ховають
 * місце за краєм (звіт власника 2026-09-02). Селект показує поточне місце
 * одним рядком і відкриває повний список в один тап, тобто дає ту саму
 * прямоту без ваги. Дефолт «Усі місця» — те, заради чого активної комори й
 * позбулись.
 */
import type { Pantry } from "@sergeant/nutrition-domain";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import type { useNutritionPantries } from "../hooks/useNutritionPantries";

type PantryController = ReturnType<typeof useNutritionPantries>;

/** Значення `<option>` для «без фільтра» — порожній рядок, не `null`. */
const ALL = "";

interface NutritionPantrySelectorProps {
  pantry: PantryController;
  busy?: boolean;
}

export function NutritionPantrySelector({
  pantry,
  busy,
}: NutritionPantrySelectorProps) {
  const pantries: Pantry[] = Array.isArray(pantry.pantries)
    ? pantry.pantries
    : [];
  const { placeFilter, setPlaceFilter } = pantry;
  const selectedPlace = pantries.find((place) => place.id === placeFilter);

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-nutrition/20 bg-nutrition/10 px-4 py-3">
      <div className="min-w-0 flex-1">
        <SectionHeading
          as="div"
          size="xs"
          variant="nutrition"
          className="mb-0.5"
        >
          Місце перегляду
        </SectionHeading>
        <div className="truncate text-style-label font-extrabold text-text">
          {selectedPlace?.name || "Усі місця"}
        </div>
      </div>
      <select
        value={placeFilter ?? ALL}
        onChange={(e) => setPlaceFilter(e.target.value || null)}
        disabled={busy}
        aria-label="Місце зберігання"
        className="input-focus-nutrition min-h-[44px] min-w-0 max-w-[42%] rounded-xl border border-nutrition/30 bg-panel/60 px-3 text-style-caption text-text truncate"
      >
        {/* Без чисел у підписах. «Усі місця (6)» читалось як «шість
            місць», хоча шість — це продукти (звіт власника 2026-09-02).
            Скільки позицій показано, каже заголовок картки нижче. */}
        <option value={ALL}>Усі місця</option>
        {pantries.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name || "Комора"}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => pantry.setPantryManagerOpen(true)}
        disabled={busy}
        className="touch-target flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-nutrition/20 text-nutrition-strong/90 transition-colors hover:bg-nutrition/10 hover:text-nutrition-strong dark:text-nutrition/70 dark:hover:text-nutrition"
        aria-label="Керування місцями зберігання"
        title="Місця"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      </button>
    </div>
  );
}
