import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Select } from "@shared/components/ui/Select";
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
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (parseOptionalPositiveInt(draft) !== value) {
      setDraft(numberOrNullToInput(value));
    }
  }

  return (
    <label className="flex items-center gap-3 min-h-[44px]">
      <span className="text-style-label text-text flex-1 min-w-0">{label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          placeholder={placeholder}
          className={cn(
            "input-focus h-10 w-24 px-2.5 text-right text-style-body",
            "bg-panelHi border border-line rounded-xl text-text",
            "placeholder:text-muted",
          )}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(parseOptionalPositiveInt(draft))}
        />
        <span className="text-style-caption text-muted w-10 text-left">
          {suffix}
        </span>
      </div>
    </label>
  );
}

const STORAGE_ERR_MSG = "Не вдалося зберегти налаштування Їжі.";

function persistAndCaptureErr(prefs: NutritionPrefs): string {
  return persistNutritionPrefs(prefs) ? "" : STORAGE_ERR_MSG;
}

export function NutritionSection() {
  const [prefs, setPrefs] = useState<NutritionPrefs>(() =>
    loadNutritionPrefs(),
  );
  // Persist initial prefs at mount and capture any storage error synchronously.
  // Subsequent persists happen in the `patchPrefs` event handler to avoid
  // calling setState in a useEffect body (react-hooks/set-state-in-effect).
  const [storageErr, setStorageErr] = useState<string>(() =>
    persistAndCaptureErr(loadNutritionPrefs()),
  );

  // Pantry picker state (stored separately from prefs, in
  // NUTRITION_PANTRIES_KEY / NUTRITION_ACTIVE_PANTRY_KEY).
  const [pantries, setPantries] = useState<Pantry[]>(() => loadPantries());
  const [activePantryId, setActivePantryId] = useState<string>(() =>
    loadActivePantryId(),
  );

  const activePantry = useMemo(
    () => pantries.find((p) => p.id === activePantryId) || pantries[0] || null,
    [pantries, activePantryId],
  );

  // Persist on every change and update the error banner. Called from event
  // handlers (not effects) so setState is safe without the microtask deferral.
  const patchPrefs = useCallback(
    (patch: Partial<NutritionPrefs>) => {
      const next = { ...prefs, ...patch };
      setPrefs(next);
      setStorageErr(persistAndCaptureErr(next));
    },
    [prefs],
  );

  const handleSetActivePantry = useCallback(
    (id: string) => {
      setActivePantryId(id);
      persistPantries(undefined, undefined, pantries, id);
    },
    [pantries],
  );

  const navigate = useNavigate();

  const openPantryManager = useCallback(() => {
    // Hub routes the Nutrition module via the module picker; the pantry
    // manager itself is a sheet that opens from within the module. From
    // the settings page we send the user to the Nutrition → Комора tab;
    // they can tap «Керування» once there.
    navigate("/nutrition/pantry");
    // Best-effort reload of freshly persisted pantry list so the UI
    // reflects any rename/add the user does through the manager.
    setPantries(loadPantries());
    setActivePantryId(loadActivePantryId());
  }, [navigate]);

  return (
    // V-13 — акцент бейджа вимагає пари `icon` + `module`; чому саме так,
    // розписано у `FinykSection.tsx`.
    <SettingsGroup title="Їжа" icon="utensils" module="nutrition">
      {storageErr && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-style-body text-danger-strong dark:text-danger">
          {storageErr}
        </div>
      )}

      <SettingsSubGroup title="Вода">
        <p className="text-style-body text-subtle leading-snug">
          Денна норма для трекера води в картці дня Їжі.
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
        <p className="text-style-body text-subtle leading-snug">
          У діалозі «Додати прийом їжі» поряд з пошуком і штрихкодом показуються
          продукти з активної комори, їх можна вибрати одним тапом.
        </p>
        <label className="flex items-center gap-3 min-h-[44px]">
          <span className="text-style-label text-text flex-1 min-w-0">
            Активна комора
          </span>
          {/* Shared Select (default variant = той самий brand-focus, що й
              колишній `input-focus`); геометрію сайту збережено через
              className (last-wins у cn): h-10, лівий відступ 10px,
              min-w-[140px], rounded-xl. pr лишаємо від size="sm" (pr-9) —
              місце під декоративну каретку, як раніше під нативну стрілку. */}
          <Select
            size="sm"
            className="h-10 pl-2.5 min-w-[140px]"
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
          </Select>
        </label>
        <p className="text-style-caption text-subtle">
          Деталі продуктів і перейменування комор – у менеджері комори всередині
          модуля Їжі.
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
    </SettingsGroup>
  );
}
