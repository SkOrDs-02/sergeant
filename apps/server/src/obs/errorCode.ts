/**
 * Класифікатор помилки для ПУБЛІЧНОЇ відповіді.
 *
 * Навіщо окремий хелпер, коли поруч уже є `serializeError` (`obs/logger.ts`):
 * у них протилежні аудиторії. `serializeError` збирає максимум контексту для
 * логу — там повне `message`, `code`, `cause`-ланцюг, і це правильно, бо лог
 * читає ops. Цей хелпер віддає рівно навпаки: один короткий клас помилки для
 * того, хто по той бік HTTP і кого ми НЕ автентифікували.
 *
 * Чому це не параноя. `/healthz` і `/health/workers` змонтовані без auth і
 * без rate-limit (щоб probe платформи ніколи не голодували), а сирі
 * `e.message` від `pg` і `ioredis` носять внутрішню топологію:
 *   - `connect ECONNREFUSED 10.0.0.12:6379` — приватний хост і порт Redis;
 *   - `password authentication failed for user "sergeant_app"` — імʼя
 *     DB-користувача, тобто половина пари для брутфорсу;
 *   - `getaddrinfo ENOTFOUND postgres-abc123` — внутрішнє імʼя контейнера.
 * Усе це анонім отримував одним GET-ом. Клас помилки (`ECONNREFUSED`,
 * `28P01`) дає дашборду й алерту рівно те, що їм треба — «БД недоступна» vs
 * «БД відмовила в автентифікації», — і нічого зверх того.
 *
 * Контракт: повертає короткий ідентифікатор або `"unknown"`. Ніколи не
 * throw-ить і ніколи не повертає рядок, у якому міг би сховатись payload —
 * див. `SAFE_CODE_RE`.
 */

/**
 * Код приймаємо лише у формі ідентифікатора: латиниця, цифри, підкреслення,
 * до 40 символів. Це навмисно вужче за «будь-який рядок у `e.code`».
 *
 * Причина конкретна: `e.code` — не зарезервоване поле, і бібліотеки
 * (а надто обгортки над помилками HTTP-клієнтів) кладуть туди що завгодно,
 * інколи повне повідомлення. Allowlist гарантує, що навіть у такому разі в
 * публічну відповідь не просочиться ані хост (`10.0.0.12:6379` має `.` і
 * `:`), ані цитата з пробілами й лапками.
 */
const SAFE_CODE_RE = /^[A-Za-z0-9_]{1,40}$/;

interface ErrorLikeShape {
  code?: unknown;
  name?: unknown;
}

/**
 * Клас помилки, безпечний для анонімного клієнта.
 *
 * Пріоритет: `code` (найінформативніше для ops — `ECONNREFUSED`, `28P01`,
 * `ETIMEDOUT`) → `name` конструктора (`TypeError`, `AggregateError`) →
 * `"unknown"`. Повідомлення не бере участі взагалі: саме воно є носієм
 * витоку, і жодного «але якщо коротке» тут бути не може — довжина
 * повідомлення не корелює з його чутливістю.
 */
export function toPublicErrorCode(err: unknown): string {
  if (err == null || typeof err !== "object") return "unknown";
  const e = err as ErrorLikeShape;

  if (typeof e.code === "string" && SAFE_CODE_RE.test(e.code)) return e.code;
  // `pg` інколи віддає числовий errno замість рядкового коду.
  if (typeof e.code === "number" && Number.isFinite(e.code)) {
    return String(e.code);
  }
  if (typeof e.name === "string" && SAFE_CODE_RE.test(e.name)) return e.name;

  return "unknown";
}
