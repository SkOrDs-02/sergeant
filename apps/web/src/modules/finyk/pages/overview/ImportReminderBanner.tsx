/**
 * Last validated: 2026-08-29
 * Status: Active
 *
 * Плашка «залий документи» (спека
 * `docs/90-work/planning/specs/finyk-import-reminders.md`).
 *
 * AI-CONTEXT: заголовок безособовий («виписку не додавали»), бо минулий
 * час в українській має рід — «ти не додав» було б неправдою половині
 * користувачів. Підзаголовок у теперішньому часі, де роду немає.
 *
 * AI-CONTEXT: «Не нагадувати» живе в overflow, а не третьою кнопкою в
 * ряду. Це рішення назавжди (автозняття немає навмисно), і воно не має
 * бути так само легко натиснутим, як «Пізніше».
 */
import { memo } from "react";

import { Banner } from "@shared/components/ui/Banner";
import { Button } from "@shared/components/ui/Button";
import { DropdownMenu } from "@shared/components/ui/DropdownMenu";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { pluralize } from "../../../../core/hub/useHubDashboardState";

interface ImportReminderBannerProps {
  /** Тип документа: `bank_statement` | `bank_screenshot`. */
  readonly source: string;
  /** Скільки повних днів від останнього імпорту цього типу. */
  readonly daysSince: number;
  /** Вивчений (або дефолтний) інтервал — для підзаголовка про ритм. */
  readonly expectedIntervalDays: number;
  readonly onAddDocuments: () => void;
  readonly onSnooze: () => void;
  readonly onMute: () => void;
}

type SourceKey = keyof typeof messages.finyk.importReminder.title;

function isKnownSource(source: string): source is SourceKey {
  return source in messages.finyk.importReminder.title;
}

function ImportReminderBannerComponent({
  source,
  daysSince,
  expectedIntervalDays,
  onAddDocuments,
  onSnooze,
  onMute,
}: ImportReminderBannerProps) {
  const copy = messages.finyk.importReminder;

  // Невідомий тип документа — не рендеримо нічого замість того, щоб
  // показати плашку без назви. Порожній заголовок гірший за відсутність
  // плашки: він нічого не каже, але вчить її ігнорувати.
  if (!isKnownSource(source)) return null;

  const dayWord = (n: number) =>
    pluralize(n, copy.days.one, copy.days.few, copy.days.many);

  return (
    <Banner role="status" variant="info" className="rounded-2xl">
      <p className="text-style-body text-content-primary">
        {`${copy.title[source]} ${daysSince} ${dayWord(daysSince)}`}
      </p>
      <p className="text-style-caption text-content-secondary mt-1">
        {`${copy.rhythmPrefix} ${expectedIntervalDays} ${dayWord(expectedIntervalDays)}`}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onAddDocuments}>
          {copy.cta}
        </Button>
        <Button size="sm" variant="ghost" onClick={onSnooze}>
          {copy.snooze}
        </Button>
        <DropdownMenu
          ariaLabel={copy.moreActionsAriaLabel}
          placement="bottom-end"
          items={[
            {
              type: "item",
              id: "mute",
              label: copy.mute[source],
              onSelect: onMute,
            },
          ]}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              type="button"
              aria-label={copy.moreActionsAriaLabel}
            >
              <Icon name="more-horizontal" size={16} aria-hidden />
            </Button>
          }
        />
      </div>
    </Banner>
  );
}

export const ImportReminderBanner = memo(ImportReminderBannerComponent);
