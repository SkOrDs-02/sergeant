/**
 * Last validated: 2026-10-18
 * Status: Active
 */
import {
  ModuleHeader,
  ModuleHeaderAssistantButton,
  ModuleHeaderHubButton,
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
  onGoToHub?: (() => void) | undefined;
  /** Останній рядок аркуша «Модулі» (раніше шестерня в шапці). */
  onOpenSettings?: (() => void) | undefined;
}

// Підзаголовка немає (redesign v3.1, В2): мітка активної вкладки дублювала
// нижню навігацію, а контекстного рядка (період, лічильник) у Їжі поки нема.
export function NutritionHeader({
  busy: _busy,
  onGoToHub,
  onOpenSettings,
}: NutritionHeaderProps) {
  return (
    <ModuleHeader
      module="nutrition"
      switcher="nutrition"
      onOpenSettings={onOpenSettings}
      left={
        typeof onGoToHub === "function" ? (
          <ModuleHeaderHubButton onClick={onGoToHub} />
        ) : (
          <AppleBadge />
        )
      }
      title={MODULE_LABELS.nutrition}
      right={<ModuleHeaderAssistantButton />}
    />
  );
}
