import { useCallback, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
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
  DASHBOARD_MODULE_LABELS,
  loadDashboardOrder,
  resetDashboardOrder,
  saveDashboardOrder,
} from "../hub/HubDashboard";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";
import { useHubPref } from "./hubPrefs";

type ModuleId = keyof typeof DASHBOARD_MODULE_LABELS;

interface ModuleReorderListProps {
  order: ModuleId[];
  onMove: (index: number, direction: -1 | 1) => void;
}

function ModuleReorderList({ order, onMove }: ModuleReorderListProps) {
  return (
    <ul className="rounded-xl border border-line divide-y divide-line/60 overflow-hidden">
      {order.map((id, index) => {
        const isFirst = index === 0;
        const isLast = index === order.length - 1;
        return (
          <li key={id} className="flex items-center gap-2 px-3 py-2 bg-panel">
            <span className="text-xs font-semibold text-muted tabular-nums w-4">
              {index + 1}
            </span>
            <span className="flex-1 text-sm text-text truncate">
              {DASHBOARD_MODULE_LABELS[id]}
            </span>
            <button
              type="button"
              onClick={() => onMove(index, -1)}
              disabled={isFirst}
              aria-label={`Підняти ${DASHBOARD_MODULE_LABELS[id]} вище`}
              className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center",
                "text-muted hover:text-text hover:bg-panelHi transition-colors",
                "disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed",
              )}
            >
              <Icon name="chevron-up" size={16} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => onMove(index, 1)}
              disabled={isLast}
              aria-label={`Опустити ${DASHBOARD_MODULE_LABELS[id]} нижче`}
              className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center",
                "text-muted hover:text-text hover:bg-panelHi transition-colors",
                "disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed",
              )}
            >
              <Icon name="chevron-down" size={16} strokeWidth={2.5} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardSection() {
  const [orderReset, setOrderReset] = useState(false);
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
  const [order, setOrder] = useState<ModuleId[]>(
    () => loadDashboardOrder() as ModuleId[],
  );
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

  const handleMove = useCallback((index: number, direction: -1 | 1) => {
    setOrder((prev) => {
      const next = prev.slice();
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      saveDashboardOrder(next);
      return next;
    });
  }, []);

  const handleResetOrder = () => {
    resetDashboardOrder();
    setOrder(loadDashboardOrder() as ModuleId[]);
    setOrderReset(true);
    setTimeout(() => setOrderReset(false), 2000);
  };

  return (
    <SettingsGroup title="Дашборд" emoji="🧭">
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
      <SettingsSubGroup title="Модулі дашборду">
        <p className="text-xs text-subtle leading-snug">
          Які модулі показувати на дашборді й у якому порядку. Неактивні модулі
          відображаються приглушено — без кнопки швидкого додавання. Щонайменше
          один модуль має залишатися активним.
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
        <div className="space-y-2 pt-2 border-t border-line/40">
          <p className="text-xs text-subtle leading-snug">
            Порядок модулів у списку «Сьогодні» на дашборді.
          </p>
          <ModuleReorderList order={order} onMove={handleMove} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-full"
            onClick={handleResetOrder}
            disabled={orderReset}
          >
            {orderReset ? "✓ Порядок скинуто" : "Скинути до за промовчання"}
          </Button>
        </div>
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
