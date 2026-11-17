/**
 * Last validated: 2026-10-23
 * Status: Active
 *
 * `sec-18`: куди вести людину, у якої на цьому пристрої був акаунт, а сесія
 * завершилась (маркер ставить identity-wipe в `AuthContext`). Замість
 * анонімного хаба — `/sign-in?next=<поточний шлях>` з поясненням.
 *
 * Публічні сторінки (юридичні тексти, статус, ціни, скидання пароля тощо)
 * лишаються доступними: вони даних не показують і мають працювати без входу.
 */
import { hasSessionExpiredMarker } from "../auth/sessionExpiredMarker";
import {
  OFFLINE_PATH,
  PRICING_PATH,
  RESET_PASSWORD_PATH,
  SERVER_ERROR_PATH,
  SIGN_IN_ALIAS_PATHS,
  SIGN_IN_PATH,
  STATUS_PATH,
  VERIFY_EMAIL_PATH,
  WELCOME_PATH,
  isLegalRoutePath,
} from "./appPaths";

const EXEMPT_PATHS: ReadonlySet<string> = new Set([
  SIGN_IN_PATH,
  ...SIGN_IN_ALIAS_PATHS,
  RESET_PASSWORD_PATH,
  VERIFY_EMAIL_PATH,
  PRICING_PATH,
  STATUS_PATH,
  OFFLINE_PATH,
  SERVER_ERROR_PATH,
]);

/**
 * Адреса редіректу на повторний вхід або `null`, якщо вести нікуди.
 * Лише для `status === "unauthenticated"`: поки особистість невідома
 * (`loading`) або сервер недоступний, рішення не ухвалюється.
 */
export function sessionExpiredRedirectTarget(
  status: string,
  pathname: string,
  search: string,
): string | null {
  if (status !== "unauthenticated") return null;
  if (EXEMPT_PATHS.has(pathname) || isLegalRoutePath(pathname)) return null;
  if (!hasSessionExpiredMarker()) return null;
  // `/welcome` і корінь без запиту як `next` нічого не дають.
  const here = `${pathname}${search}`;
  if (pathname === WELCOME_PATH || here === "/") return SIGN_IN_PATH;
  return `${SIGN_IN_PATH}?next=${encodeURIComponent(here)}`;
}
