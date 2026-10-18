/**
 * Аркуш «Модулі» (redesign v3.1, PR1): відкривається тапом по назві модуля
 * в шапці. Чотири рядки модулів і останнім рядок налаштувань поточного
 * модуля, який раніше відкривала шестерня в шапці.
 *
 * Last validated: 2026-10-18
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { openHubModule, type HubModuleId } from "@shared/lib/modules/hubNav";
import { MODULE_LABELS } from "@shared/lib/modules/moduleLabels";
import { messages } from "@shared/i18n/uk";
import { Sheet } from "@shared/components/ui/Sheet";
import {
  MODULE_HUE,
  MODULE_ORDER,
  readModuleFact,
} from "../../../core/hub/ModulePanel";

export interface ModuleSwitcherSheetProps {
  open: boolean;
  onClose: () => void;
  current: HubModuleId;
  onOpenSettings?: (() => void) | undefined;
}

const ROW =
  "flex min-h-[56px] w-full items-center gap-3 px-3 text-left focus-ring";

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
  return (
    <ul>
      {MODULE_ORDER.map((id) => {
        const isCurrent = id === current;
        const fact = readModuleFact(id);
        return (
          <li key={id}>
            <button
              type="button"
              aria-current={isCurrent ? "true" : undefined}
              onClick={() => {
                hapticTap();
                onClose();
                // Той самий вхід, що й рядок панелі модулів хаба.
                if (!isCurrent) openHubModule(id, undefined, "module_switcher");
              }}
              className={cn(ROW, "rounded-lg", isCurrent && "bg-text text-bg")}
            >
              <span
                aria-hidden
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-sm",
                  MODULE_HUE[id],
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-style-body font-semibold">
                  {MODULE_LABELS[id]}
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
              "rounded-lg text-style-body font-semibold text-text hover:bg-panel",
            )}
          >
            {messages.modules.openSettings}
          </button>
        </li>
      ) : null}
    </ul>
  );
}
