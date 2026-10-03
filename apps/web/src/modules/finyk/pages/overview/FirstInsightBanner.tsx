/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { memo } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";

interface FirstInsightBannerProps {
  onSetBudget: () => void;
  onDismiss: () => void;
}

/**
 * Одноразовий банер-підказка, що зʼявляється коли юзер вперше бачить Overview
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
        className="w-10 h-10 shrink-0 rounded-2xl bg-finyk/15 flex items-center justify-center"
        aria-hidden
      >
        <Icon name="lightbulb" size="lg" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-style-label text-text">
          Ось куди йдуть твої гроші
        </div>
        <div className="text-style-body text-muted mt-0.5">
          Хочеш поставити бюджет, і бачити, коли починаєш виходити за рамки?
        </div>
        {/* `Button`, а не ручні кнопки: той дає кільце фокусу, `-strong`
            заливку без розбавлення на hover і 44px на coarse-pointer. */}
        <div className="flex gap-2 mt-3">
          <Button variant="solid" tone="finyk" size="sm" onClick={onSetBudget}>
            Поставити бюджет
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Пізніше
          </Button>
        </div>
      </div>
    </div>
  );
};

export const FirstInsightBanner = memo(FirstInsightBannerImpl);
