import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import {
  defaultNutritionPrefs,
  loadActivePantryId,
  loadNutritionPrefs,
  loadPantries,
  persistNutritionPrefs,
  persistPantries,
  type NutritionPrefs,
  type Pantry,
} from "../../modules/nutrition/lib/nutritionStorage";
import { SettingsGroup, SettingsSubGroup } from "./SettingsPrimitives";

function numberOrNullToInput(v: number | null): string {
  return v == null ? "" : String(Math.round(v));
}

function parseOptionalPositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

interface NumberFieldProps {
  label: string;
  suffix: string;
  value: number | null;
  placeholder?: string;
  onCommit: (next: number | null) => void;
}

function NumberField({
  label,
  suffix,
  value,
  placeholder,
  onCommit,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string>(() => numberOrNullToInput(value));

  // Keep the input in sync if `value` changes from the outside (e.g. user
  // imports prefs from another device). Avoid clobbering while the user is
  // mid-edit by comparing against the committed number.
  useEffect(() => {
    const canonical = numberOrNullToInput(value);
    if (parseOptionalPositiveInt(draft) !== value) {
      setDraft(canonical);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="flex items-center gap-3 min-h-[44px]">
      <span className="text-sm text-text flex-1 min-w-0">{label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          placeholder={placeholder}
          className={cn(
            "input-focus h-10 w-24 px-2.5 text-right text-sm",
            "bg-panelHi border border-line rounded-xl text-text",
            "placeholder:text-muted",
          )}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(parseOptionalPositiveInt(draft))}
        />
        <span className="text-xs text-muted w-10 text-left">{suffix}</span>
      </div>
    </label>
  );
}

export function NutritionSection() {
  const [prefs, setPrefs] = useState<NutritionPrefs>(() =>
    loadNutritionPrefs(),
  );
  const [storageErr, setStorageErr] = useState<string>("");

  // Pantry picker state (stored separately from prefs, in
  // NUTRITION_PANTRIES_KEY / NUTRITION_ACTIVE_PANTRY_KEY).
  const [pantries, setPantries] = useState<Pantry[]>(() => loadPantries());
  const [activePantryId, setActivePantryId] = useState<string>(() =>
    loadActivePantryId(),
  );

  // Persist prefs on every change. The actual NutritionApp also owns a
  // copy of prefs via `loadNutritionPrefs()` + `useEffect`; the next time
  // the Nutrition module mounts it will pick the updated prefs from LS.
  useEffect(() => {
    setStorageErr(
      persistNutritionPrefs(prefs)
        ? ""
        : "Не вдалося зберегти налаштування Харчування.",
    );
  }, [prefs]);

  const activePantry = useMemo(
    () => pantries.find((p) => p.id === activePantryId) || pantries[0] || null,
    [pantries, activePantryId],
  );

  const patchPrefs = useCallback(
    (patch: Partial<NutritionPrefs>) => {
      setPrefs((p) => ({ ...p, ...patch }));
    },
    [setPrefs],
  );

  const handleSetActivePantry = useCallback(
    (id: string) => {
      setActivePantryId(id);
      persistPantries(undefined, undefined, pantries, id);
    },
    [pantries],
  );

  const resetDailyTargets = useCallback(() => {
    const d = defaultNutritionPrefs();
    patchPrefs({
      dailyTargetKcal: d.dailyTargetKcal,
      dailyTargetProtein_g: d.dailyTargetProtein_g,
      dailyTargetFat_g: d.dailyTargetFat_g,
      dailyTargetCarbs_g: d.dailyTargetCarbs_g,
    });
  }, [patchPrefs]);

  const openPantryManager = useCallback(() => {
    // Hub routes the Nutrition module via the module picker; the pantry
    // manager itself is a sheet that opens from within the module. From
    // the settings page we send the user to the Nutrition → Комора tab;
    // they can tap «Керування» once there.
    try {
      window.location.hash = "#pantry";
    } catch {
      /* noop */
    }
    // Best-effort reload of freshly persisted pantry list so the UI
    // reflects any rename/add the user does through the manager.
    setPantries(loadPantries());
    setActivePantryId(loadActivePantryId());
  }, []);

  return (
    <SettingsGroup title="Харчування" emoji="🥗">
      {storageErr && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {storageErr}
        </div>
      )}

      <SettingsSubGroup title="Денні цілі (KБЖУ)" defaultOpen>
        <p className="text-xs text-subtle leading-snug">
          Значення показуються у прогрес-кільці на головному екрані Харчування і
          в денних підсумках. Залиш порожнім, щоб ціль не враховувалась.
        </p>
        <div className="space-y-1">
          <NumberField
            label="Калорії"
            suffix="ккал"
            value={prefs.dailyTargetKcal}
            placeholder="2000"
            onCommit={(v) => patchPrefs({ dailyTargetKcal: v })}
          />
          <NumberField
            label="Білки"
            suffix="г"
            value={prefs.dailyTargetProtein_g}
            placeholder="120"
            onCommit={(v) => patchPrefs({ dailyTargetProtein_g: v })}
          />
          <NumberField
            label="Жири"
            suffix="г"
            value={prefs.dailyTargetFat_g}
            placeholder="70"
            onCommit={(v) => patchPrefs({ dailyTargetFat_g: v })}
          />
          <NumberField
            label="Вуглеводи"
            suffix="г"
            value={prefs.dailyTargetCarbs_g}
            placeholder="230"
            onCommit={(v) => patchPrefs({ dailyTargetCarbs_g: v })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="border border-line"
          onClick={resetDailyTargets}
        >
          Скинути цілі
        </Button>
      </SettingsSubGroup>

      <SettingsSubGroup title="Вода">
        <p className="text-xs text-subtle leading-snug">
          Денна норма для трекера води в картці дня Харчування.
        </p>
        <NumberField
          label="Денна норма"
          suffix="мл"
          value={prefs.waterGoalMl}
          placeholder="2000"
          onCommit={(v) =>
            patchPrefs({
              waterGoalMl: v != null ? v : defaultNutritionPrefs().waterGoalMl,
            })
          }
        />
      </SettingsSubGroup>

      <SettingsSubGroup title="Підстановка з комори">
        <p className="text-xs text-subtle leading-snug">
          У діалозі «Додати прийом їжі» поряд з пошуком і штрихкодом показуються
          продукти з активної комори — їх можна вибрати одним тапом.
        </p>
        <label className="flex items-center gap-3 min-h-[44px]">
          <span className="text-sm text-text flex-1 min-w-0">
            Активна комора
          </span>
          <select
            className={cn(
              "input-focus h-10 px-2.5 text-sm min-w-[140px]",
              "bg-panelHi border border-line rounded-xl text-text",
            )}
            value={activePantry?.id || ""}
            onChange={(e) => handleSetActivePantry(e.target.value)}
          >
            {pantries.length === 0 && <option value="">Немає комор</option>}
            {pantries.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || "Без назви"}
                {Array.isArray(p.items) && p.items.length > 0
                  ? ` · ${p.items.length}`
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-subtle">
          Деталі продуктів і перейменування комор — у менеджері комори всередині
          модуля Харчування.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="border border-line"
          onClick={openPantryManager}
        >
          Відкрити менеджер комори →
        </Button>
      </SettingsSubGroup>

      <SettingsSubGroup title="Сканер штрихкодів">
        <p className="text-xs text-subtle leading-snug">
          Сканер запускається з діалогу «Додати прийом їжі» (іконка штрихкода).
          Продукт шукається послідовно: локальна база страв → Open Food Facts →
          USDA FoodData Central → UPCitemdb. Якщо макро знайдено, вони
          підтягуються у форму прийому їжі; якщо продукт не знайдено, можна
          прив&apos;язати штрихкод до існуючої страви кнопкою «Привʼязати».
        </p>
        <p className="text-xs text-subtle leading-snug">
          Камері потрібен дозвіл на використання в браузері / OS. У нативній
          збірці iOS/Android скан виконується ML Kit; у вебі — через
          <code className="mx-1 px-1 py-0.5 rounded bg-panelHi text-text">
            BarcodeDetector
          </code>
          API або відкриту камеру з розпізнаванням.
        </p>
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
