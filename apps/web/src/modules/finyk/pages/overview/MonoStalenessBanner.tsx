/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Банер «дані не оновлювались N днів» — контракт довіри §6.3 канону finyk.
 *
 * AI-CONTEXT: копія навмисно НЕ каже «звʼязок обірвався» і не звинувачує
 * банк. Канон §6.3 фіксує, що тиша webhook-а ззовні не відрізняється від
 * тиші користувача: «витрат не було» і «інтеграція впала» виглядають
 * однаково, бо обидва стани — це відсутність подій. Тому банер повідомляє
 * рівно перевірений факт (скільки днів немає оновлень) і пропонує дію,
 * яка допоможе в обох випадках. Не переписуй це на впевнене «Monobank
 * не працює» — це буде вигадкою в половині випадків.
 */
import { memo } from "react";

import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import { pluralize } from "../../../../core/hub/useHubDashboardState";

interface MonoStalenessBannerProps {
  /** Скільки повних днів немає оновлень. */
  readonly days: number;
  /** Перехід у налаштування банку. Без нього CTA не рендериться. */
  readonly onReconnect?: (() => void) | undefined;
}

function MonoStalenessBannerComponent({
  days,
  onReconnect,
}: MonoStalenessBannerProps) {
  const copy = messages.finyk.monoStaleness;
  const dayWord = pluralize(days, copy.days.one, copy.days.few, copy.days.many);

  return (
    <div
      role="status"
      className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3"
    >
      <p className="text-style-body text-content-primary">
        {`${copy.title} ${days} ${dayWord}.`}
      </p>
      <p className="text-style-caption text-content-secondary mt-1">
        {copy.hint}
      </p>
      {onReconnect && (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={onReconnect}
        >
          {copy.cta}
        </Button>
      )}
    </div>
  );
}

export const MonoStalenessBanner = memo(MonoStalenessBannerComponent);
