/**
 * Аркуш «Модулі» (redesign v3.1, PR1): відкривається тапом по назві модуля
 * в шапці. Чотири рядки модулів і останнім рядок налаштувань поточного
 * модуля, який раніше відкривала шестерня в шапці. Рядки поводяться як
 * панель модулів хаба: вимкнений модуль веде в налаштування дашборда.
 *
 * Last validated: 2026-10-19
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { hapticTap } from "@shared/lib/adapters/haptic";
import {
  openHubModule,
  openHubSettingsSection,
  type HubModuleId,
} from "@shared/lib/modules/hubNav";
import { MODULE_LABELS } from "@shared/lib/modules/moduleLabels";
import {
  MODULE_HUE,
  MODULE_ORDER,
  readActiveModules,
  readModuleFact,
} from "@shared/lib/modules/moduleFacts";
import { messages } from "@shared/i18n/uk";
import { Sheet } from "@shared/components/ui/Sheet";

export interface ModuleSwitcherSheetProps {
  open: boolean;
  onClose: () => void;
  current: HubModuleId;
  onOpenSettings?: (() => void) | undefined;
}

const ROW =
  "flex min-h-[56px] w-full items-center gap-3 rounded-lg px-3 text-left focus-ring";

export function ModuleSwitcherSheet({
  open,
  onClose,
  current,
  onOpenSettings,
}: ModuleSwitcherSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={messages.modules.switcherTitle}>
      <ModuleRows
        current={current}
        onClose={onClose}
        onOpenSettings={onOpenSettings}
      />
    </Sheet>
  );
}

function ModuleRows({
  current,
  onClose,
  onOpenSettings,
}: Omit<ModuleSwitcherSheetProps, "open">) {
  const active = readActiveModules();
  return (
    <ul>
      {MODULE_ORDER.map((id) => {
        const isCurrent = id === current;
        const enabled = isCurrent || active.includes(id);
        const label = MODULE_LABELS[id];
        const fact = enabled ? readModuleFact(id) : null;
        return (
          <li key={id}>
            <button
              type="button"
              aria-current={isCurrent ? "true" : undefined}
              aria-label={
                enabled
                  ? undefined
                  : `${label}: ${messages.modules.inactiveHint}`
              }
              data-inactive={enabled ? undefined : "true"}
              onClick={() => {
                hapticTap();
                onClose();
                if (isCurrent) return;
                // Той самий вхід, що й рядок панелі модулів хаба.
                if (!enabled) openHubSettingsSection("dashboard");
                else openHubModule(id, undefined, "module_switcher");
              }}
              className={cn(
                ROW,
                isCurrent
                  ? "bg-text text-bg"
                  : cn("hover:bg-panel", enabled ? "text-text" : "text-subtle"),
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-mark",
                  MODULE_HUE[id],
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-style-body font-semibold">
                  {label}
                </span>
                {fact ? (
                  <span
                    className={cn(
                      "block text-style-label tnum",
                      isCurrent ? "text-bg" : "text-muted",
                    )}
                  >
                    {fact}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
      {onOpenSettings ? (
        <li className="mt-2 border-t border-line pt-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className={cn(
              ROW,
              "text-style-body font-semibold text-text hover:bg-panel",
            )}
          >
            {messages.modules.openSettings}
          </button>
        </li>
      ) : null}
    </ul>
  );
}
