import { useCallback, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { useToast } from "@shared/hooks/useToast";
import {
  safeReadStringLS,
  safeWriteLS,
  webKVStore,
} from "@shared/lib/storage/storage";
import {
  ALL_MODULES,
  DASHBOARD_MODULE_LABELS as SHARED_DASHBOARD_MODULE_LABELS,
  DASHBOARD_DENSITIES,
  DASHBOARD_DENSITY_LABELS,
  DASHBOARD_DENSITY_DESCRIPTIONS,
  DASHBOARD_DENSITY_EVENT,
  DEFAULT_DASHBOARD_DENSITY,
  normalizeDashboardDensity,
  STORAGE_KEYS,
  getActiveModules,
  setActiveModules,
  type DashboardDensity,
  type DashboardModuleId,
} from "@sergeant/shared";
import { pushActiveModules } from "../hub/activeModulesSync";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";
import { useHubPref } from "./hubPrefs";

export function DashboardSection() {
  const [calmMode, setCalmMode] = useHubPref<boolean>("calmMode", false);
  const [adaptiveBento, setAdaptiveBento] = useHubPref<boolean>(
    "adaptiveBento",
    true,
  );
  const [showTodayFocus, setShowTodayFocus] = useHubPref<boolean>(
    "showTodayFocus",
    true,
  );
  const [showInsights, setShowInsights] = useHubPref<boolean>(
    "showInsights",
    true,
  );
  const [showMotivational, setShowMotivational] = useHubPref<boolean>(
    "showMotivational",
    true,
  );
  const [density, setDensityState] = useState<DashboardDensity>(() => {
    const raw = safeReadStringLS(STORAGE_KEYS.DASHBOARD_DENSITY);
    return raw === null
      ? DEFAULT_DASHBOARD_DENSITY
      : normalizeDashboardDensity(raw);
  });
  const handleDensityChange = useCallback((next: DashboardDensity) => {
    setDensityState(next);
    safeWriteLS(STORAGE_KEYS.DASHBOARD_DENSITY, next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(DASHBOARD_DENSITY_EVENT, { detail: next }),
      );
    }
  }, []);
  const toast = useToast();

  const [activeModules, setActiveModulesState] = useState<DashboardModuleId[]>(
    () => getActiveModules(webKVStore),
  );
  const toggleActive = useCallback(
    (id: DashboardModuleId) => {
      setActiveModulesState((prev) => {
        const isActive = prev.includes(id);
        if (isActive && prev.length === 1) {
          // Не помилка, а заблокована дія: користувач нічого не зламав і
          // нічого не «повторює» — він просто впорядковує дашборд далі.
          // `warning` без дії, за tone-таблицею toast-policy.
          toast.warning("Щонайменше один модуль має бути активним");
          return prev;
        }
        const next = isActive
          ? prev.filter((x) => x !== id)
          : ALL_MODULES.filter((x) => prev.includes(x) || x === id);
        setActiveModules(webKVStore, next);
        // Знахідка B2 (аудит 2026-08-05): вибір їде й на акаунт, щоб на
        // наступному пристрої не показувати дефолт. Fire-and-forget —
        // локальний KV уже оновлено, і мережа не має блокувати тумблер.
        pushActiveModules(next);
        return next;
      });
    },
    [toast],
  );

  return (
    <SettingsGroup title="Дашборд" icon="compass" anchorId="settings-dashboard">
      <SettingsSubGroup title="Вигляд">
        <ToggleRow
          label="Чистий режим"
          description="Ховає підказки, інсайти й мотиваційні блоки, лишає на головній лише модулі."
          checked={calmMode === true}
          onChange={setCalmMode}
        />
        {/* L-10 (аудит 2026-08-08): перемикач «Показувати підказки» писав
         * `showHints` у HUB_PREFS, але жоден web-код це поле не читав —
         * grep по apps/web/src не дав жодного читача, окрім самого
         * useHubPref-виклику вище. У apps/mobile є власний незалежний
         * `showHints` (GeneralSection.tsx / core/hints/useHints.ts), але
         * mobile і web мають окремі стори (MMKV vs localStorage), тож
         * web-тумблер нічого там не вмикав і не вимикав. Прибрано лише
         * UI+хук на web; поле лишається у вже збережених HUB_PREFS-блобах
         * користувачів — hubPrefs.schema.ts валідує лише структурний
         * конверт (open z.record), тож зайвий ключ безпечний і не потребує
         * міграції. */}
        <ToggleRow
          label="Адаптивний порядок"
          description="Піднімає в топ модуль, актуальний зараз, за часом дня та сигналами. Твій порядок зберігається."
          checked={adaptiveBento !== false}
          onChange={setAdaptiveBento}
        />
        <ToggleRow
          label="Картка «Сьогодні»"
          description="Фокус дня над модулями. Вимкни, щоб головна починалася одразу з модулів."
          checked={showTodayFocus !== false}
          onChange={setShowTodayFocus}
        />
        <ToggleRow
          label="Що зараз важливо"
          description="Згорнутий блок з підказками, порадою Сержанта та звітом тижня внизу головної."
          checked={showInsights !== false}
          onChange={setShowInsights}
        />
        <ToggleRow
          label="Мотиваційний підпис"
          description="Короткий заохочувальний рядок у самому низу головної."
          checked={showMotivational !== false}
          onChange={setShowMotivational}
        />
        <div className="space-y-2">
          <p className="text-style-caption text-subtle leading-snug">
            Скільки простору між картками на головному екрані.
          </p>
          <div className="flex gap-2">
            {DASHBOARD_DENSITIES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDensityChange(d)}
                aria-pressed={d === density}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  d === density
                    ? "border-brand bg-brand/8 ring-1 ring-brand/30 shadow-soft"
                    : "border-line bg-panel shadow-soft hover:bg-panelHi hover:border-brand/40",
                )}
              >
                <span
                  className={cn(
                    "block text-style-label",
                    d === density ? "text-brand-strong" : "text-text",
                  )}
                >
                  {DASHBOARD_DENSITY_LABELS[d]}
                </span>
                <span className="block text-style-caption text-muted mt-0.5">
                  {DASHBOARD_DENSITY_DESCRIPTIONS[d]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </SettingsSubGroup>
      <SettingsSubGroup title="Розділи на головній">
        {/* UX-feedback 2026-05-08: removed the manual «Порядок модулів»
         * reorder list (chevron-up / chevron-down + reset button). The
         * dashboard already exposes a drag-to-reorder bento via the
         * «Налаштувати» button next to the «Модулі» heading, so a second
         * settings-side reorder UI was a confusing duplicate. Active /
         * inactive checkboxes stay here because that toggle has no
         * dashboard-side equivalent. */}
        <p className="text-style-caption text-subtle leading-snug">
          Які розділи показувати на головній. Неактивні розділи виглядають
          приглушено, без кнопки швидкого додавання. Принаймні один має
          залишатися активним. Порядок змінюється на головній через кнопку
          «Налаштувати» поруч із заголовком «Розділи».
        </p>
        <ul className="rounded-xl border border-line divide-y divide-line/60 overflow-hidden">
          {ALL_MODULES.map((id) => {
            const checked = activeModules.includes(id);
            return (
              <li key={id} className="px-3 py-2 bg-panel">
                <label className="flex items-center gap-3 cursor-pointer touch-target">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleActive(id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="flex-1 text-style-label text-text">
                    {SHARED_DASHBOARD_MODULE_LABELS[id]}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
