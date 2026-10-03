import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import {
  defaultNutritionPrefs,
  patchNutritionPrefs,
  type NutritionPrefs,
} from "../../modules/nutrition/lib/nutritionStorage";
import { useNutritionPrefsSnapshot } from "../../modules/nutrition/hooks/useNutritionPrefsHydration";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";

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
  disabled?: boolean;
  onCommit: (next: number | null) => void;
}

function NumberField({
  label,
  suffix,
  value,
  placeholder,
  disabled = false,
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
          disabled={disabled}
          className={cn(
            "input-focus h-10 w-24 px-2.5 text-right text-style-body",
            "bg-panelHi border border-line rounded-xl text-text",
            "placeholder:text-muted",
            "disabled:opacity-60 disabled:cursor-not-allowed",
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

export function NutritionSection() {
  // data-04: prefs читаються з кешу живцем (тік), а не один раз у `useState`,
  // а до гідратації (кеш без рядка prefs і початковий pull ще не завершено)
  // контроли заблоковані: запис із дефолтів стер би шаблони страв, ціль і
  // нагадування на всіх пристроях.
  const { prefs, hydrated } = useNutritionPrefsSnapshot();
  const [storageErr, setStorageErr] = useState<string>("");

  // Пишемо ЛИШЕ змінене поле: решту `patchNutritionPrefs` бере з актуального
  // кешу в момент виклику, а не зі стану цього компонента.
  const patchPrefs = useCallback((patch: Partial<NutritionPrefs>) => {
    setStorageErr(patchNutritionPrefs(patch) ? "" : STORAGE_ERR_MSG);
  }, []);

  const navigate = useNavigate();

  const openPantryManager = useCallback(() => {
    // Hub routes the Nutrition module via the module picker; the pantry
    // manager itself is a sheet that opens from within the module. From
    // the settings page we send the user to the Nutrition → Комора tab;
    // they can tap «Керування» once there.
    navigate("/nutrition/pantry");
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

      {!hydrated && (
        <p className="text-style-body text-subtle leading-snug">
          Налаштування Їжі ще завантажуються з акаунта. Зміни стануть доступні
          за кілька секунд.
        </p>
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
          disabled={!hydrated}
          onCommit={(v) =>
            patchPrefs({
              waterGoalMl: v != null ? v : defaultNutritionPrefs().waterGoalMl,
            })
          }
        />
      </SettingsSubGroup>

      <SettingsSubGroup title="Автокалібрування цілі">
        <ToggleRow
          label="Автокалібрування"
          description="Щотижня уточнює ціль за журналом їжі та зміною ваги. Ручна правка полів денного плану призупиняє його."
          checked={prefs.adaptiveGoalEnabled}
          disabled={!hydrated}
          onChange={(checked) =>
            patchPrefs({
              adaptiveGoalEnabled: checked,
              adaptiveGoalLastUpdatedAt: null,
            })
          }
        />
      </SettingsSubGroup>

      <SettingsSubGroup title="Підстановка з комори">
        <p className="text-style-body text-subtle leading-snug">
          У діалозі «Додати прийом їжі» поряд з пошуком і штрихкодом показуються
          продукти з усіх комор, їх можна вибрати одним тапом.
        </p>
        <p className="text-style-body text-subtle">
          Деталі продуктів і перейменування комор – у менеджері комори всередині
          модуля Їжі.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openPantryManager}
        >
          Відкрити менеджер комори →
        </Button>
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
