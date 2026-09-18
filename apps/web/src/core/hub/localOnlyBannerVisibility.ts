/**
 * Чи видно зараз `LocalOnlyDataBanner` — чиста функція, винесена з
 * `useHubDashboardState` (PR-H4, design-audit 2026-09-13, і виправлення
 * ревʼю #1128).
 *
 * Навіщо окремий модуль. Прапорець потрібен `useOnboardingState`, щоб
 * soft-auth hero відступав, поки банер уже ставить те саме питання «увійди»
 * (чотири однакові заклики на першому екрані аноніма — сама знахідка H4).
 * Але сам предикат мусить збігатися з тим, за яким банер справді
 * рендериться, інакше глушіння спрацьовує там, де глушити нічого. Тримати
 * його чистим і поруч із власними тестами дешевше, ніж двічі виводити ту
 * саму умову в двох місцях — і не роздуває `useHubDashboardState.ts`, який
 * стоїть під стелею `max-lines: 600`.
 *
 * Дзеркалить три гейти справжнього банера:
 *   1. рендер-гвард у `HubMainContent.tsx` — `!inFtuxSession`;
 *   2. `useLocalUserId()` всередині банера: `null` під час завантаження
 *      сесії і для автентифікованого користувача (той завжди syncable);
 *   3. демо-гейт (PR-H5 тієї ж хвилі).
 *
 * **Чому `authStatus` тут обовʼязковий.** `useLocalUserId()` віддає `null`,
 * поки `status === "loading"`, тож банер у цей момент не малює нічого. Без
 * цієї умови прапорець був би `true` уже тоді (бо `user` ще `null`), і анонім
 * у вікні завантаження сесії не бачив би НІ банера, НІ soft-auth. Саме цю
 * дірку знайшло ревʼю #1128 — глушіння без того, заради чого воно існує.
 *
 * Чого функція свідомо НЕ робить: не звіряє `isSyncableUserId` для
 * анонімного id. Коли `user === null`, `useLocalUserId()` може повернути
 * лише `local-anon`, і він несинкабельний — тож окремий випадок був би
 * мертвою гілкою.
 */
export function isLocalOnlyBannerVisible(args: {
  /** Перша сесія: FTUX тримає рівно один сигнал на екрані, банера немає. */
  inFtuxSession: boolean;
  /** Автентифікований користувач — його дані синкаються, банер не про нього. */
  hasUser: boolean;
  /** `status` з `AuthContext`; `undefined` — рендер поза `AuthProvider`. */
  authStatus: string | undefined;
}): boolean {
  const { inFtuxSession, hasUser, authStatus } = args;
  if (inFtuxSession) return false;
  if (hasUser) return false;
  if (authStatus === "loading") return false;
  return true;
}
