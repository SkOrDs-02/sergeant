import { ANALYTICS_EVENTS, LANDING_LOCALE, track } from "../lib/analytics";
import { telegramStartLink } from "../lib/links";

/**
 * Значення `source` з контракту `LANDING_TELEGRAM_CLICKED` у
 * `@sergeant/shared`; водночас це `start`-payload у deep link, тож канал
 * видно і в PostHog, і в базі бота.
 */
export type CtaPlacement = "hero" | "footer";

interface TelegramCtaProps {
  placement: CtaPlacement;
  label?: string;
}

/**
 * Єдина точка конверсії лендінга.
 *
 * Тут навмисно немає форми: Telegram-бот не може написати першим, тому
 * зібраний контакт має сенс лише тоді, коли людина сама відкриє діалог.
 * Клік — остання подія, яку бачить клієнт; далі все відбувається в Telegram.
 */
export default function TelegramCta({ placement, label }: TelegramCtaProps) {
  return (
    <a
      href={telegramStartLink(placement)}
      target="_blank"
      rel="noreferrer"
      onClick={() =>
        track(ANALYTICS_EVENTS.LANDING_TELEGRAM_CLICKED, {
          source: placement,
          locale: LANDING_LOCALE,
        })
      }
      className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-7 py-3 text-base font-bold text-accent-ink shadow-sm transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {label ?? "Приєднатися через Telegram"}
    </a>
  );
}
