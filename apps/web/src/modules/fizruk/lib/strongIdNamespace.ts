/**
 * Last validated: 2026-09-03
 * Status: Active
 *
 * Неймспейс детермінованих id Strong-імпорту.
 *
 * AI-DANGER: рядки імпорту дістають id, порахований із хешу (див.
 * `strongImport.ts`), а `id` у `fizruk_workouts`, `fizruk_workout_items` і
 * `fizruk_measurements` — ГЛОБАЛЬНИЙ первинний ключ. Неймспейс — єдине, що
 * тримає id двох різних людей нарізно; помилка тут не падає, а мовчки
 * з'їдає чужу історію на сервері (`200 OK` з `{"accepted":0}`).
 *
 * Правило вибору:
 *
 * - **Є справжній акаунт** → беремо його id. Він же поїде в `user_id` на
 *   сервер, тож id рядка і його власник рахуються з одного значення. Бонус,
 *   заради якого детермінізм узагалі існує: той самий CSV, імпортований на
 *   телефоні й ноуті, дедуплікується — обидва пристрої дадуть один id.
 *
 * - **Анонімна або демо-сесія** → id пристрою (`resolveOriginDeviceId`),
 *   бо `LOCAL_ANON_USER_ID` і `DEMO_LOCAL_USER_ID` — СПІЛЬНІ константи для
 *   всіх таких сесій. Через них двоє незнайомих людей, що імпортували той
 *   самий експорт зі Strong анонімно, отримали б однакові id; і оскільки
 *   `core/durability/anonymousDataMigration.ts` переносить рядки в акаунт,
 *   НЕ перегенеровуючи id, колізія дожила б до сервера після реєстрації.
 *   `resolveOriginDeviceId` уже існує для sync-оп-логу, персиститься під
 *   уже дозволеним ключем і унікальний на інсталяцію — тобто дає рівно ту
 *   гарантію, якої бракує, без нового сховища.
 *
 * Ціна анонімної гілки: імпорт до реєстрації і повторний імпорт того самого
 * файлу ПІСЛЯ неї дадуть різні id, тобто дублікати. Це свідомий розмін —
 * дублікат видно і виправно, мовчазна втрата історії ні.
 */

import { resolveOriginDeviceId } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import { LOCAL_ANON_USER_ID } from "../../../core/auth/localIdentity";
import { DEMO_LOCAL_USER_ID } from "../../../core/onboarding/onboardingGate";

/** Ідентичності, спільні для багатьох інсталяцій — на них солити не можна. */
const SHARED_LOCAL_IDENTITIES: ReadonlySet<string> = new Set([
  LOCAL_ANON_USER_ID,
  DEMO_LOCAL_USER_ID,
]);

export interface StrongIdNamespaceDeps {
  /** Підміна для тестів; у проді — стабільний id інсталяції. */
  readonly deviceId?: () => string;
}

/**
 * Повертає неймспейс для id Strong-імпорту або `null`, поки сесія ще
 * резолвиться. `null` мусить блокувати імпорт: рядки, пораховані під одним
 * неймспейсом і записані під іншим, повертають саме той баг, від якого цей
 * модуль і захищає.
 */
export function resolveStrongIdNamespace(
  localUserId: string | null,
  deps: StrongIdNamespaceDeps = {},
): string | null {
  if (!localUserId) return null;
  if (!SHARED_LOCAL_IDENTITIES.has(localUserId)) return localUserId;
  const deviceId =
    deps.deviceId ?? (() => resolveOriginDeviceId({ store: webKVStore }));
  return `device:${deviceId()}`;
}
