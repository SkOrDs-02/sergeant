/**
 * Панель модулів хаба (мова H, redesign v3): чотири рядки 44 px у панелі -
 * свотч 10 px у hue модуля, назва, бар 5 px і значення дня табличними
 * цифрами. Заміна рейка пігулок під шапкою; тап по рядку відкриває модуль.
 *
 * Неактивний модуль лишається рядком (форма панелі стала), але веде в
 * налаштування дашборда, як і раніше рейок.
 *
 * Last validated: 2026-10-09
 * Status: Active
 */
import { useMemo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { hapticTap } from "@shared/lib/adapters/haptic";
import {
  openHubModule,
  openHubSettingsSection,
} from "@shared/lib/modules/hubNav";
import {
  MODULE_LABELS,
  type HubModuleId,
} from "@shared/lib/modules/moduleLabels";
import { coreMessages } from "@shared/i18n/uk.core";
import { MODULE_CONFIGS } from "./dashboard/moduleConfigs";

const ORDER: readonly HubModuleId[] = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
];

const HUE: Record<HubModuleId, string> = {
  finyk: "bg-chart-finyk",
  fizruk: "bg-chart-fizruk",
  routine: "bg-chart-routine",
  nutrition: "bg-chart-nutrition",
};

export interface ModulePanelProps {
  activeModules: readonly string[];
  /** Тік сховища з батька: перечитати значення після запису в модулі. */
  storageBump?: number | undefined;
}

export function ModulePanel({ activeModules, storageBump }: ModulePanelProps) {
  const rows = useMemo(() => {
    void storageBump;
    return ORDER.map((id) => ({
      id,
      preview: MODULE_CONFIGS[id].getPreview(),
    }));
  }, [storageBump]);

  return (
    <nav aria-label={coreMessages.hub.moduleRail} data-testid="module-panel">
      <ul className="rounded-xl bg-panel px-4">
        {rows.map(({ id, preview }, i) => {
          const enabled = activeModules.includes(id);
          const label = MODULE_LABELS[id];
          const progress =
            typeof preview.progress === "number"
              ? Math.max(0, Math.min(100, preview.progress))
              : null;
          return (
            <li key={id} className={cn(i > 0 && "border-t border-line")}>
              <button
                type="button"
                data-inactive={enabled ? undefined : "true"}
                aria-label={
                  enabled
                    ? `Перейти до модуля ${label}`
                    : `${label}: неактивний, увімкнути в налаштуваннях`
                }
                onClick={() => {
                  hapticTap();
                  if (!enabled) {
                    openHubSettingsSection("dashboard");
                    return;
                  }
                  openHubModule(id, undefined, "module_rail");
                }}
                className="flex h-11 w-full items-center gap-3 text-left focus-ring"
              >
                <span
                  aria-hidden
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", HUE[id])}
                />
                <span
                  className={cn(
                    "w-24 shrink-0 truncate text-style-body font-semibold",
                    enabled ? "text-text" : "text-subtle",
                  )}
                >
                  {label}
                </span>
                <span
                  aria-hidden
                  className="h-[5px] flex-1 overflow-hidden rounded-sm bg-track"
                >
                  {progress !== null && (
                    <span
                      className={cn("block h-full", HUE[id])}
                      style={{ width: `${progress}%` }}
                    />
                  )}
                </span>
                <span className="w-20 shrink-0 text-right text-style-body font-medium tnum text-text">
                  {preview.main ?? "–"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
