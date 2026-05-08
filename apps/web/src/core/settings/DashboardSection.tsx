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
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";
import { useHubPref } from "./hubPrefs";

export function DashboardSection() {
  const [showHints, setShowHints] = useHubPref<boolean>("showHints", true);
  const [adaptiveBento, setAdaptiveBento] = useHubPref<boolean>(
    "adaptiveBento",
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
          toast.error("Щонайменше один модуль має бути активним");
          return prev;
        }
        const next = isActive
          ? prev.filter((x) => x !== id)
          : ALL_MODULES.filter((x) => prev.includes(x) || x === id);
        setActiveModules(webKVStore, next);
        return next;
      });
    },
    [toast],
  );

  return (
    <SettingsGroup title="Дашборд" emoji="🧭" anchorId="settings-dashboard">
      <SettingsSubGroup title="Вигляд">
        <ToggleRow
          label="Показувати підказки"
          description="Короткі підказки в моменті (без спаму)."
          checked={showHints !== false}
          onChange={setShowHints}
        />
        <ToggleRow
          label="Адаптивний порядок"
          description="Піднімає в топ модуль, актуальний зараз — за часом дня та сигналами. Ваш порядок зберігається."
          checked={adaptiveBento !== false}
          onChange={setAdaptiveBento}
        />
        <div className="space-y-2">
          <p className="text-xs text-subtle leading-snug">
            Скільки простору між картками на головному екрані.
          </p>
          <div className="flex gap-2">
            {DASHBOARD_DENSITIES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDensityChange(d)}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  d === density
                    ? "border-brand bg-brand/8 ring-1 ring-brand/30"
                    : "border-line bg-panel hover:bg-panelHi",
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
                <span className="block text-xs text-muted mt-0.5">
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
        <p className="text-xs text-subtle leading-snug">
          Які розділи показувати на головній. Неактивні розділи виглядають
          приглушено — без кнопки швидкого додавання. Принаймні один має
          залишатися активним. Порядок змінюється на головній через кнопку
          «Налаштувати» поруч із заголовком «Розділи».
        </p>
        <ul className="rounded-xl border border-line divide-y divide-line/60 overflow-hidden">
          {ALL_MODULES.map((id) => {
            const checked = activeModules.includes(id);
            return (
              <li key={id} className="px-3 py-2 bg-panel">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleActive(id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="flex-1 text-sm text-text">
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
