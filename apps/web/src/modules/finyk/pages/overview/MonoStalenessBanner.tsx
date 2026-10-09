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
import { Notice } from "@shared/components/ui/Notice";
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
    <Notice
      tone="ink"
      role="status"
      action={
        onReconnect && (
          <Button size="sm" variant="outline" onClick={onReconnect}>
            {copy.cta}
          </Button>
        )
      }
    >
      <p>{`${copy.title} ${days} ${dayWord}.`}</p>
      <p className="mt-0.5 font-normal text-muted">{copy.hint}</p>
    </Notice>
  );
}

export const MonoStalenessBanner = memo(MonoStalenessBannerComponent);
