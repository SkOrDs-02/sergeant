/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Конструктор страви: назва, інгредієнти з пошуку з грамами, порції і
 * опційна вага готової страви. КБЖВ рахується живо з `per100` знімків
 * (`computeRecipe*` у nutrition-domain) і зберігається в `macros` на порцію.
 * Працює без входу: рецепт лягає в ту саму книгу, що й AI-рецепти.
 */
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  computeRecipePer100,
  computeRecipePerServing,
  computeRecipeTotal,
  type RecipeComponent,
} from "@sergeant/nutrition-domain";
import type { NullableMacros } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Sheet } from "@shared/components/ui/Sheet";
import { messages } from "@shared/i18n/uk";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";
import { parseDecimalInput } from "@shared/lib/format/numberInput";
import type { SavedRecipe } from "../lib/recipeBook";
import {
  FoodPickerSection,
  type PickedFood,
} from "./meal-sheet/FoodPickerSection";
import { useFoodSearch } from "./meal-sheet/useFoodSearch";
import { MAX_PORTION_GRAMS } from "./meal-sheet/mealFormUtils";

const t = messages.nutrition.recipeBuilder;
const MAX_COMPONENTS = 80;
const MAX_SERVINGS = 1000;

interface Row {
  key: number;
  name: string;
  gramsRaw: string;
  foodId: string | null;
  per100: NullableMacros;
}

interface RecipeBuilderSheetProps {
  /** `null` - нова страва; інакше редагування з тим самим `id`. */
  initial: SavedRecipe | null;
  fmtMacro: (v: unknown) => string | number;
  onClose: () => void;
  onSave: (recipe: SavedRecipe) => void;
}

function gramsOf(raw: string, max = MAX_PORTION_GRAMS): number | null {
  const p = parseDecimalInput(raw);
  return p.ok && p.value > 0 && p.value <= max ? p.value : null;
}

function macroLine(
  m: NullableMacros,
  fmt: (v: unknown) => string | number,
): string {
  const part = (label: string, v: number | null, unit: string) =>
    v == null ? null : `${label} ${fmt(v)}${unit}`;
  return [
    part("", m.kcal, " ккал"),
    part("Б", m.protein_g, " г"),
    part("Ж", m.fat_g, " г"),
    part("В", m.carbs_g, " г"),
  ]
    .filter(Boolean)
    .join(" · ")
    .trim();
}

function initialRows(initial: SavedRecipe | null): Row[] {
  return (initial?.components ?? []).map((c, i) => ({
    key: i,
    name: c.name,
    gramsRaw: String(c.grams).replace(".", ","),
    foodId: c.foodId,
    per100: c.per100,
  }));
}

export function RecipeBuilderSheet({
  initial,
  fmtMacro,
  onClose,
  onSave,
}: RecipeBuilderSheetProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [rows, setRows] = useState<Row[]>(() => initialRows(initial));
  const [nextKey, setNextKey] = useState(
    () => (initial?.components ?? []).length,
  );
  const [servingsRaw, setServingsRaw] = useState(
    String(initial?.servings && initial.servings >= 1 ? initial.servings : 1),
  );
  const [cookedRaw, setCookedRaw] = useState(
    initial?.cookedWeightG ? String(initial.cookedWeightG) : "",
  );
  const [query, setQuery] = useState("");
  const search = useFoodSearch(query);

  const servings = (() => {
    const n = gramsOf(servingsRaw, MAX_SERVINGS);
    return n != null && Number.isInteger(n) ? n : null;
  })();
  const rowGrams = rows.map((r) => gramsOf(r.gramsRaw));
  const cookedTrim = cookedRaw.trim();
  const cookedWeightG = cookedTrim === "" ? null : gramsOf(cookedTrim);
  const cookedInvalid = cookedTrim !== "" && cookedWeightG == null;

  const components: RecipeComponent[] = rows.flatMap((r, i) => {
    const g = rowGrams[i];
    return g == null
      ? []
      : [{ name: r.name, grams: g, foodId: r.foodId, per100: r.per100 }];
  });
  const total = computeRecipeTotal(components);
  const perServing = computeRecipePerServing(components, servings ?? 1);
  const per100 = computeRecipePer100(components, cookedWeightG);

  const reason = !title.trim()
    ? t.reasonName
    : rows.length === 0
      ? t.reasonNoIngredient
      : rowGrams.some((g) => g == null)
        ? t.reasonGrams
        : servings == null
          ? t.reasonServings
          : "";

  function addFood(p: PickedFood) {
    if (rows.length >= MAX_COMPONENTS) return;
    const grams = Math.round(Number(p.defaultGrams) || 100);
    setRows((rs) => [
      ...rs,
      {
        key: nextKey,
        name: p.name || "Продукт",
        gramsRaw: String(grams),
        // Зовнішні хіти (`source`) у локальній базі не живуть, посилатись нема на що.
        foodId: p.source || p.id == null ? null : String(p.id),
        per100: {
          kcal: p.per100?.kcal ?? null,
          protein_g: p.per100?.protein_g ?? null,
          fat_g: p.per100?.fat_g ?? null,
          carbs_g: p.per100?.carbs_g ?? null,
        },
      },
    ]);
    setNextKey((k) => k + 1);
  }

  // FoodPickerSection кладе обраний продукт у стейт-сеттер; тут це просто
  // подія «додано рядок».
  const setPickedFood: Dispatch<SetStateAction<PickedFood | null>> = (v) => {
    if (v && typeof v !== "function") addFood(v);
  };
  const ignoreGrams: Dispatch<SetStateAction<string>> = () => {};

  function save() {
    if (reason) return;
    // Часові мітки ставить `normalizeRecipeForSave` (0 = «візьми зараз»).
    onSave({
      id: initial?.id ?? "",
      title: title.trim(),
      timeMinutes: null,
      servings,
      ingredients: components.map((c) => `${c.name}, ${c.grams} г`),
      steps: [],
      tips: [],
      macros: perServing,
      components,
      cookedWeightG,
      createdAt: initial?.createdAt ?? 0,
      updatedAt: 0,
    });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={initial ? t.titleEdit : t.titleNew}
      description={t.description}
      panelClassName="nutrition-sheet"
      zIndex={120}
    >
      <div className="mb-3">
        <SectionHeading as="div" size="xs" variant="nutrition" className="mb-1">
          {t.nameLabel}
        </SectionHeading>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.namePlaceholder}
          maxLength={NAME_MAX_LEN}
          showCharCount={false}
          aria-label={t.nameAria}
        />
      </div>

      <FoodPickerSection
        foodQuery={query}
        setFoodQuery={setQuery}
        foodHits={search.foodHits}
        offHits={search.offHits}
        foodBusy={search.foodBusy}
        offBusy={search.offBusy}
        foodErr={search.foodErr}
        searchSettled={search.searchSettled}
        setPickedFood={setPickedFood}
        setPickedGrams={ignoreGrams}
      />

      {rows.length > 0 && (
        <ul className="mb-3 space-y-2">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-style-body text-text wrap-break-word">
                {r.name}
              </span>
              <Input
                value={r.gramsRaw}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((x) =>
                      x.key === r.key ? { ...x, gramsRaw: e.target.value } : x,
                    ),
                  )
                }
                inputMode="decimal"
                aria-label={`${t.gramsAriaPrefix} ${r.name}`}
                className="w-24"
                maxLength={7}
                showCharCount={false}
                error={rowGrams[i] == null}
              />
              <span className="text-style-caption text-muted">
                {t.gramUnit}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`${t.removeAriaPrefix} ${r.name}`}
                onClick={() =>
                  setRows((rs) => rs.filter((x) => x.key !== r.key))
                }
              >
                {t.remove}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <SectionHeading
            as="div"
            size="xs"
            variant="nutrition"
            className="mb-1"
          >
            {t.servingsLabel}
          </SectionHeading>
          <Input
            value={servingsRaw}
            onChange={(e) => setServingsRaw(e.target.value)}
            inputMode="numeric"
            maxLength={4}
            showCharCount={false}
            aria-label={t.servingsLabel}
          />
        </div>
        <div>
          <SectionHeading
            as="div"
            size="xs"
            variant="nutrition"
            className="mb-1"
          >
            {t.cookedLabel}
          </SectionHeading>
          <Input
            value={cookedRaw}
            onChange={(e) => setCookedRaw(e.target.value)}
            inputMode="decimal"
            maxLength={7}
            showCharCount={false}
            aria-label={t.cookedLabel}
          />
          {cookedInvalid ? (
            <p
              className="mt-1 text-style-caption text-danger-strong"
              role="alert"
            >
              {t.cookedErrorPrefix} {MAX_PORTION_GRAMS} {t.cookedErrorSuffix}
            </p>
          ) : (
            <p className="mt-1 text-style-caption text-muted">{t.cookedHint}</p>
          )}
        </div>
      </div>

      {components.length > 0 && (
        <div className="mt-3 rounded-2xl bg-panelHi p-3 text-style-caption text-text space-y-0.5">
          <div>
            {t.perServing} {macroLine(perServing, fmtMacro) || t.noData}
          </div>
          <div>
            {t.total} {macroLine(total, fmtMacro) || t.noData}
          </div>
          {cookedWeightG != null && (
            <div>
              {t.per100} {macroLine(per100, fmtMacro) || t.noData}
            </div>
          )}
        </div>
      )}

      {reason && (
        <p className="mt-3 text-style-caption text-muted" role="status">
          {reason}
        </p>
      )}
      <div className="mt-3">
        <Button
          type="button"
          className="h-12 min-h-[44px] w-full bg-nutrition-strong text-white hover:bg-nutrition-hover dark:bg-nutrition dark:text-bg dark:hover:bg-nutrition/90"
          disabled={!!reason}
          onClick={save}
        >
          {t.save}
        </Button>
      </div>
    </Sheet>
  );
}
