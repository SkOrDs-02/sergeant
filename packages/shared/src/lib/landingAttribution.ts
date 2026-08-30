/**
 * Контракт передачі атрибуції з лендінга в Telegram-бот.
 *
 * Навіщо. Лендінг і застосунок стоять на різних доменах
 * (`sergeant-landing.vercel.app` ↔ хост апки), а лендінг свідомо cookieless:
 * `persistence: "memory"` + `person_profiles: "never"`. Наслідок, який видно
 * в даних (аудит 2026-08-16): `landing_viewed` дає 136 подій і рівно 136
 * різних персон, тобто кожен відвідувач — новий анонім, і жоден не зшивається
 * з користувачем апки. Воронка «лендінг → реєстрація» показує 0% — і це
 * артефакт вимірювання, а не поведінка людей: клік по CTA робили 39 із 136
 * (28%), просто слід обривається на межі Telegram.
 *
 * Рішення. Єдиний вихід лендінга — deep link у бота, а Telegram сам пропускає
 * `start`-payload наскрізь. Кладемо туди, крім місця кнопки, ще й одноразовий
 * непрозорий токен. Бот, отримавши `/start`, шле власну подію з тим самим
 * токеном — і дві половини воронки склеюються звичайним join-ом по `ref`.
 *
 * Чому це не ламає cookieless-позицію: токен генерується на КОЖНЕ
 * завантаження сторінки, ніде не зберігається (ні cookie, ні localStorage) і
 * помирає разом зі вкладкою. Це разова estafeta, а не ідентифікатор людини —
 * повторний захід на лендінг дає інший токен і не звʼязується з попереднім.
 *
 * Формат payload-а: `<placement>_<ref>`. Обмеження Telegram — до 64 символів
 * із набору `[A-Za-z0-9_-]`; `footer_` + 16 символів = 23, запас великий.
 */

/** Місце кнопки на лендінгу. Воно ж — канал у звіті `/stats` бота. */
export type LandingPlacement = "hero" | "footer" | "beta";

const PLACEMENTS: readonly LandingPlacement[] = ["hero", "footer", "beta"];

/**
 * Довжина токена. 16 символів base36 ≈ 82 біти — колізій на наших обсягах не
 * буде, а payload лишається читабельним у логах бота.
 */
const REF_LENGTH = 16;
const REF_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** `hero`/`footer` + `_` + рівно `REF_LENGTH` символів алфавіту. */
const START_PAYLOAD_RE = new RegExp(
  `^(${PLACEMENTS.join("|")})_([a-z0-9]{${REF_LENGTH}})$`,
);

/**
 * Одноразовий токен передачі. Криптографічно випадковий: `Math.random()` тут
 * не підходить, бо передбачуваний токен дозволив би стороннім підмішувати
 * події в чужу воронку.
 */
export function newLandingRef(): string {
  const bytes = new Uint8Array(REF_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    // Модуль по 36 дає мізерний зсув розподілу (256 % 36 ≠ 0) — для
    // токена-естафети, що живе хвилини, це не має значення.
    out += REF_ALPHABET[byte % REF_ALPHABET.length];
  }
  return out;
}

/** Збирає `start`-payload для deep link-а. */
export function formatLandingStartPayload(
  placement: LandingPlacement,
  ref: string,
): string {
  return `${placement}_${ref}`;
}

/**
 * Розбирає `start`-payload назад.
 *
 * Повертає `null` на всьому, що не наш формат — зокрема на історичних
 * payload-ах без токена (`hero`, `footer`), які лишились у базі з часів до
 * цього контракту, і на ручному вводі. Викликач має трактувати `null` як
 * «каналу не знаємо», а не як помилку.
 */
export function parseLandingStartPayload(
  payload: string | null | undefined,
): { placement: LandingPlacement; ref: string } | null {
  if (!payload) return null;
  const match = START_PAYLOAD_RE.exec(payload);
  if (!match) return null;
  return {
    placement: match[1] as LandingPlacement,
    ref: match[2] as string,
  };
}
