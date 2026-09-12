/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * «Що болить» на сторінці Атласа — **лише читання**.
 *
 * AI-CONTEXT: до 2026-08-08 тут жив ПОВНИЙ пікер зон (кнопка «Позначити зону»
 * + дві групи чипів), тобто другий екземпляр того, що вже є в `InjuryManager`
 * на сторінці «Моє тіло». Дві поверхні для однієї дії розійшлися й механікою:
 * тут тап по чипу позначав ЗРАЗУ, там — накопичував вибір до «Позначити біль».
 * Людина не могла знати, чи її вибір збережено, доки не гляне на інший екран.
 * Канонічний дім позначок — «Моє тіло»; Атлас візуалізує відновлення, а
 * позначки болю його силует навіть не малює. Тому пікер прибрано (скарга
 * власника 2026-08-08), а лишився рівно той зріз, який пояснює карту поруч:
 * що саме зараз позначено і як це зняти.
 *
 * AI-DANGER: The copy here must never promise safety. The product does not
 * diagnose and does not treat (канон fizruk §5) — it only stops recommending
 * what overlaps a mark. Wording that implies more is a product bug, not a
 * style nit.
 */
import { Card } from "@shared/components/ui/Card";
import { Button } from "@shared/components/ui/Button";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { injurySiteLabelUk } from "@sergeant/fizruk-domain/data";

import { messages } from "@shared/i18n/uk";

import { useInjuries } from "../hooks/useInjuries";

const t = messages.fizruk.injuries;

function formatSince(startedAt: string): string {
  const ts = Date.parse(startedAt);
  if (!Number.isFinite(ts)) return "";
  const days = Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
  if (days === 0) return t.today;
  if (days === 1) return t.yesterday;
  return `${days} дн. тому`;
}

export interface InjurySectionProps {
  /**
   * Перехід на «Моє тіло» — єдине місце, де позначку СТАВЛЯТЬ. Без цього
   * колбека секція лишається чисто інформативною (посилання не рендериться),
   * що коректно для будь-якого майбутнього колсайту без навігації.
   */
  onOpenBody?: (() => void) | undefined;
}

export function InjurySection({ onOpenBody }: InjurySectionProps = {}) {
  const { active, clear } = useInjuries();

  return (
    <Card as="section" radius="lg" padding="lg" aria-label={t.title}>
      <SectionHeading size="xs" variant="fizruk" as="h2">
        {t.title}
      </SectionHeading>

      {active.length === 0 ? (
        <p className="text-style-body text-muted mt-2">{t.empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {active.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block text-style-label font-medium truncate">
                  {injurySiteLabelUk(m.site)}
                </span>
                <span className="block text-style-caption text-muted">
                  {formatSince(m.startedAt)}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => clear(m.id)}
                aria-label={`${t.clearCta}: ${injurySiteLabelUk(m.site)}`}
              >
                {t.clearCta}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {onOpenBody && (
        <div className="mt-3">
          <Button
            size="sm"
            variant="secondary"
            module="fizruk"
            onClick={onOpenBody}
          >
            {t.markOnBodyCta}
          </Button>
        </div>
      )}

      <p className="text-style-caption text-muted mt-4 leading-relaxed">
        {t.disclaimer}
      </p>
    </Card>
  );
}
