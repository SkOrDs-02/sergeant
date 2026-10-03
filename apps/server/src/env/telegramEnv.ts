import { coerceInt, stringWithDefault } from "./envHelpers.js";

/**
 * Telegram waitlist/beta-invite env fields — split out of `env.ts` purely
 * to shave lines (Hard Rule #18 — `max-lines: 600`, `skipBlankLines` +
 * `skipComments`) after a security-audit merge on `main` pushed it over
 * the limit. Zero behaviour change: spread into `envSchema`'s shape in
 * `env.ts` (`...telegramEnvShape`), so `env.TELEGRAM_*` fields resolve
 * identically to before this split — no external import changes.
 */
export const telegramEnvShape = {
  TELEGRAM_TOPIC_ENGINEERING: stringWithDefault(""),

  TELEGRAM_WAITLIST_BOT_TOKEN: stringWithDefault(""),

  TELEGRAM_WAITLIST_WEBHOOK_SECRET: stringWithDefault(""),

  TELEGRAM_BETA_INVITE_LINK: stringWithDefault(""),
  /**
   * Адреса застосунку бети. Окремий Vercel-проєкт із власним доменом
   * (`docs/work/specs/beta-launch/run-beta-wave.md` § Фаза 0.3), тому НЕ
   * виводиться з `BETTER_AUTH_URL` — це різні хости.
   *
   * **Дефолт порожній — і це навмисно (рішення власника 2026-09-17).**
   * До того тут стояв хост першої хвилі, `beta-tau-gilt.vercel.app`. Сенс
   * дефолта був у тому, що змінна живе поза репо (Coolify env), і без неї
   * бот мовчить у єдиний момент, коли він потрібен. Насправді вийшло
   * гірше за мовчання: гілка `beta`, з якої збирався той Vercel-проєкт
   * (`run-beta-wave.md` § 0.3), зникла при переїзді репо 2026-09-14, хост
   * півтора місяця віддавав серпневу збірку без жодного пізнішого фіксу —
   * а `/app` і `/install` далі впевнено вели туди людей. Зламаний
   * фронтенд про свій вік не повідомляє ніяк: він працює рівно так, як
   * його зібрали. Розбір: `apps/server/AGENTS.md` § «Бета-контур».
   *
   * AI-DANGER: не став сюди адресу, поки не переконався, що за нею стоїть
   * ЖИВИЙ деплой, який оновлюється. Хост, який більше ні з чого не
   * збирається, гірший за порожній рядок: на порожньому бот чесно каже про
   * паузу, а на мертвому — веде в застиглу збірку, і виглядає це як
   * зламаний продукт, а не як закритий набір.
   *
   * Порожній рядок легальний і зараз є робочим станом: `/app` та
   * `/install` віддають текст про паузу й новий раунд
   * (`betaTexts.ts` → `NO_APP_URL_REPLY`). Відкриється наступна хвиля —
   * значення з оточення перекриє цей рядок, правити код не доведеться.
   */
  TELEGRAM_BETA_APP_URL: stringWithDefault(""),
  /**
   * Контакт founder-а разом із `@` (наприклад `@skords`). Використовується
   * лише в `/install` — куди написати, якщо потрібний пункт меню не
   * знаходиться. У `/help` контактів немає: єдиний канал там — група бети.
   */
  TELEGRAM_BETA_FOUNDER_USERNAME: stringWithDefault(""),
  /**
   * Розмір першої хвилі бети. Хто прийшов пізніше — отримує від бота номер у
   * черзі замість «ти в списку». Це лише ТЕКСТ відповіді: кого реально
   * запрошувати, вирішує `--limit` у `broadcast-waitlist.mjs`, і ці два числа
   * навмисно не звʼязані — розсилати можна меншими партіями, ніж оголошена
   * хвиля, не переписуючи те, що бачать нові підписники.
   */
  TELEGRAM_BETA_WAVE_SIZE: coerceInt.positive().default(35),
  /**
   * `chat_id` власника — єдиний, кому бот відповідає на `/stats`. Порожній →
   * команда інертна для всіх, включно з власником: сліпий режим безпечніший,
   * ніж випадково відкрита статистика.
   */
  TELEGRAM_WAITLIST_ADMIN_CHAT_ID: stringWithDefault(""),
};
