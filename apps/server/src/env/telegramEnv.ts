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
   * (`docs/90-work/beta-launch/run-beta-wave.md` § Фаза 0.3), тому НЕ
   * виводиться з `BETTER_AUTH_URL` — це різні хости.
   *
   * Порожній рядок легальний: бот скаже, що адреси ще немає, замість того
   * щоб надіслати `/install` із діркою посеред інструкції.
   */
  TELEGRAM_BETA_APP_URL: stringWithDefault(""),
  /**
   * Анонімна форма зворотного звʼязку бети (Google Form / Tally). Окремий
   * канал від групи саме тому, що анонімний: частина відгуків не звучить,
   * поки під ними стоїть імʼя.
   */
  TELEGRAM_BETA_FEEDBACK_FORM_URL: stringWithDefault(""),
  /**
   * Контакт founder-а разом із `@` (наприклад `@skords`). Останній канал у
   * `/help` — для особистого й термінового.
   */
  TELEGRAM_BETA_FOUNDER_USERNAME: stringWithDefault(""),
  /**
   * Розмір першої хвилі бети. Хто прийшов пізніше — отримує від бота номер у
   * черзі замість «ти в списку». Це лише ТЕКСТ відповіді: кого реально
   * запрошувати, вирішує `--limit` у `broadcast-waitlist.mjs`, і ці два числа
   * навмисно не зв'язані — розсилати можна меншими партіями, ніж оголошена
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
