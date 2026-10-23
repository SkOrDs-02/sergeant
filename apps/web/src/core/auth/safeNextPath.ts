/**
 * Last validated: 2026-10-23
 * Status: Active
 *
 * Параметр `next` екрана входу (`/sign-in?next=<шлях>`): куди повернути
 * людину після входу. Приймається ЛИШЕ відносний внутрішній шлях; усе інше
 * (абсолютні URL, схеми, `//host`, зворотні скісні риски) відкидається —
 * інакше `next` стає open redirect (фішинг через довірений домен).
 */
import { SIGN_IN_ALIAS_PATHS, SIGN_IN_PATH } from "../app/appPaths";

const LOOP_PATHS: ReadonlySet<string> = new Set([
  SIGN_IN_PATH,
  ...SIGN_IN_ALIAS_PATHS,
]);

const BASE = "http://sergeant.invalid";

/**
 * Повертає безпечний внутрішній шлях (`/path?query#hash`) або `null`.
 * Шляхи самого екрана входу теж відкидаються: після входу повертати на
 * `/sign-in` означало б петлю.
 */
export function sanitizeNextPath(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) {
    return null;
  }
  // Лише шлях від кореня; `//host` і `/\host` браузер читає як інший origin.
  if (raw[0] !== "/" || raw[1] === "/" || raw[1] === "\\") return null;
  // Керівні символи й зворотні скісні риски.
  // eslint-disable-next-line no-control-regex -- саме їх і відсікаємо
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  if (LOOP_PATHS.has(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `next` з рядка запиту (`location.search`). */
export function readNextParam(search: string): string | null {
  try {
    return sanitizeNextPath(new URLSearchParams(search).get("next"));
  } catch {
    return null;
  }
}
