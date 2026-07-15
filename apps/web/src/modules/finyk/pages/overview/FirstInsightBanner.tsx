/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { memo } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";

interface FirstInsightBannerProps {
  onSetBudget: () => void;
  onDismiss: () => void;
}

/**
 * Одноразовий банер-підказка, що з'являється коли юзер вперше бачить Overview
 * з реальними даними (mono/manual-витрата). CTA веде у бюджети.
 * State та Аналитика-івент керується з Overview; тут — чиста презентація.
 */
const FirstInsightBannerImpl = function FirstInsightBanner({
  onSetBudget,
  onDismiss,
}: FirstInsightBannerProps) {
  return (
    <div className="rounded-2xl border border-finyk/25 bg-finyk/10 p-4 flex items-start gap-3">
      <div
        className="w-10 h-10 shrink-0 rounded-2xl bg-finyk/15 flex items-center justify-center text-xl"
        aria-hidden
      >
        <Icon name="lightbulb" size={20} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-style-label text-text">
          Ось куди йдуть твої гроші
        </div>
        <div className="text-xs text-muted mt-0.5">
          Хочеш поставити бюджет — і бачити, коли починаєш виходити за рамки?
        </div>
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={onSetBudget}
            className="px-3 py-1.5 rounded-xl bg-finyk-strong text-white text-style-caption hover:bg-finyk-strong/80 transition"
          >
            Поставити бюджет
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-xl text-xs text-muted hover:text-text hover:bg-panelHi transition"
          >
            Пізніше
          </button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="xs"
        iconOnly
        onClick={onDismiss}
        aria-label="Закрити підказку"
        className="shrink-0 -mr-1 text-muted hover:text-text"
      >
        <Icon name="close" size={16} />
      </Button>
    </div>
  );
};

export const FirstInsightBanner = memo(FirstInsightBannerImpl);
