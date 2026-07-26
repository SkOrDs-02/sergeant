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
      className="inline-flex items-center gap-2.5 rounded-2xl bg-accent px-7 py-4 text-base font-bold text-accent-ink shadow-sm transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="currentColor"
      >
        <path d="M21.7 3.4 18.9 20c-.2 1-.8 1.2-1.6.8l-4.4-3.2-2.1 2c-.24.24-.43.43-.88.43l.3-4.4 8.1-7.3c.35-.31-.08-.49-.55-.18l-10 6.3-4.3-1.35c-.94-.3-.96-.94.2-1.4L20.5 2.1c.78-.28 1.46.18 1.2 1.3z" />
      </svg>
      {label ?? "Приєднатись через Telegram"}
    </a>
  );
}
