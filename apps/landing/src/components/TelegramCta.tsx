import { useState } from "react";
import {
  formatLandingStartPayload,
  newLandingRef,
  type LandingPlacement,
} from "@sergeant/shared";
import { ANALYTICS_EVENTS, LANDING_LOCALE, track } from "../lib/analytics";
import { telegramStartLink } from "../lib/links";

/**
 * Значення `source` з контракту `LANDING_TELEGRAM_CLICKED` у
 * `@sergeant/shared`; водночас це частина `start`-payload-а у deep link, тож
 * канал видно і в PostHog, і в базі бота.
 */
export type CtaPlacement = LandingPlacement;

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
 *
 * `ref` — одноразовий токен естафети (див. `landingAttribution.ts`). Він іде
 * ОДНАКОВИЙ у два місця: в `href` deep link-а і в payload події кліку. Саме це
 * дозволяє зшити «клікнув на лендінгу» з «натиснув Start у боті», не заводячи
 * жодного персистентного ідентифікатора — лендінг лишається cookieless.
 *
 * Токен береться через ініціалізатор `useState`, а не рахується на кожен
 * рендер: інакше `href` і подія могли б розійтись, якби React перемалював
 * кнопку між рендером і кліком.
 */
export default function TelegramCta({ placement, label }: TelegramCtaProps) {
  const [ref] = useState(newLandingRef);

  return (
    <a
      href={telegramStartLink(formatLandingStartPayload(placement, ref))}
      target="_blank"
      rel="noreferrer"
      onClick={() =>
        track(ANALYTICS_EVENTS.LANDING_TELEGRAM_CLICKED, {
          source: placement,
          locale: LANDING_LOCALE,
          ref,
        })
      }
      className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-7 py-3 text-base font-bold text-accent-ink shadow-sm transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {label ?? "Приєднатися через Telegram"}
    </a>
  );
}
