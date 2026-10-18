/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import {
  ModuleHeader,
  ModuleHeaderAssistantButton,
  ModuleHeaderBackButton,
  ModuleHeaderHubButton,
  ModuleHeaderSettingsButton,
} from "@shared/components/layout";
import { MODULE_LABELS } from "@shared/lib/modules/moduleLabels";

function AppleBadge() {
  // Гліф модуля в шапці без тонованого квадрата (мова H, як `FinykHeaderIcon`).
  return (
    <span className="shrink-0 text-text" aria-hidden>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 11c0 6 4 10 8 10s8-4 8-10" />
        <path d="M12 21V11" />
        <path d="M7 5c0 2 1 3 2 4M17 5c0 2-1 3-2 4" />
        <path d="M7 5c0-1 1-2 2-2s2 1 2 2c0 2-2 4-2 6" />
        <path d="M17 5c0-1-1-2-2-2s-2 1-2 2c0 2 2 4 2 6" />
      </svg>
    </span>
  );
}

interface NutritionHeaderProps {
  busy?: boolean | undefined;
  onBackToHub?: (() => void) | undefined;
  onGoToHub?: (() => void) | undefined;
  onOpenSettings?: (() => void) | undefined;
  /**
   * N-12 (аудит 2026-09-16): раніше тут завжди стояло статичне «Мій
   * раціон», хоча активна вкладка нижньої навігації називалась інакше
   * («Меню», «Комора», «Журнал»…) - три різні назви одного екрана.
   * Викликач передає мітку активної вкладки (`NUTRITION_NAV_LABELS`).
   */
  subtitle?: string | undefined;
}

export function NutritionHeader({
  busy: _busy,
  onBackToHub,
  onGoToHub,
  onOpenSettings,
  subtitle,
}: NutritionHeaderProps) {
  const left =
    typeof onBackToHub === "function" ? (
      <div className="flex items-center gap-1">
        <ModuleHeaderBackButton onClick={onBackToHub} />
        {typeof onGoToHub === "function" && (
          <ModuleHeaderHubButton onClick={onGoToHub} />
        )}
      </div>
    ) : (
      <AppleBadge />
    );

  return (
    <ModuleHeader
      module="nutrition"
      left={left}
      title={MODULE_LABELS.nutrition}
      subtitle={subtitle}
      right={
        <div className="flex items-center gap-2">
          <ModuleHeaderAssistantButton />
          {onOpenSettings && (
            <ModuleHeaderSettingsButton onClick={onOpenSettings} />
          )}
        </div>
      }
    />
  );
}
