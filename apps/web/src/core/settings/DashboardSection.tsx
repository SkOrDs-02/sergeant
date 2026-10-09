import { useCallback, useState } from "react";
import { useToast } from "@shared/hooks/useToast";
import { webKVStore } from "@shared/lib/storage/storage";
import {
  ALL_MODULES,
  DASHBOARD_MODULE_LABELS as SHARED_DASHBOARD_MODULE_LABELS,
  getActiveModules,
  setActiveModules,
  type DashboardModuleId,
} from "@sergeant/shared";
import { pushActiveModules } from "../hub/activeModulesSync";
import { settingsSectionTitle } from "../hub/settingsSectionsCatalog";
import { ThemeSwitcher } from "@shared/components/ui/ThemeSwitcher";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";
import { useHubPref } from "./hubPrefs";

export function DashboardSection() {
  // Головна за віссю дії (спека `hub-action-axis.md`, рішення власника
  // 2026-09-17): купи й рейок не вимикаються, тож у «Вигляді» лишаються два
  // тумблери — «Порада й тиждень» і «Мотиваційний підпис».
  const [showInsights, setShowInsights] = useHubPref<boolean>(
    "showInsights",
    true,
  );
  const [showMotivational, setShowMotivational] = useHubPref<boolean>(
    "showMotivational",
    true,
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
    <SettingsGroup
      title={settingsSectionTitle("dashboard")}
      icon="grid"
      anchorId="settings-dashboard"
    >
      <SettingsSubGroup title="Вигляд">
        {/* Тема переїхала сюди з меню «⋯» у шапці (огляд 2026-09-04): це
            єдина підгрупа про вигляд, і саме тут її шукали — пошук
            «тема» доти давав порожнечу. */}
        <div className="flex flex-col gap-2" data-row>
          <span className="text-style-label text-text">Тема</span>
          <ThemeSwitcher className="w-full" />
        </div>
        <ToggleRow
          label="Порада й тиждень"
          description="Згорнутий блок із порадою Сержанта та звітом тижня внизу головної."
          checked={showInsights !== false}
          onChange={setShowInsights}
        />
        <ToggleRow
          label="Лічильник записів"
          description="Скільки записів у тебе всього, у самому низу головної."
          checked={showMotivational !== false}
          onChange={setShowMotivational}
        />
      </SettingsSubGroup>
      <SettingsSubGroup title="Розділи на головній">
        <p className="text-style-body text-subtle leading-snug">
          Які розділи показувати на головній. Неактивні розділи лишаються в
          рейку приглушеними і не потрапляють у «Закрито сьогодні». Принаймні
          один має залишатися активним.
        </p>
        {/* Огляд 2026-09-04: тут стояв нативний чекбокс 16px, тоді як
            решта «увімкнути/вимкнути» на сторінці — `Switch`. Один
            словник для однієї дії. */}
        {ALL_MODULES.map((id) => (
          <ToggleRow
            key={id}
            label={SHARED_DASHBOARD_MODULE_LABELS[id]}
            checked={activeModules.includes(id)}
            onChange={() => toggleActive(id)}
          />
        ))}
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
