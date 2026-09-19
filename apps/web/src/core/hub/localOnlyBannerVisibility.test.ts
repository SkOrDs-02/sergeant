import { describe, expect, it } from "vitest";

import { isLocalOnlyBannerVisible } from "./localOnlyBannerVisibility";

/**
 * Базовий стан — саме той, у якому банер durability справді видно:
 * анонім поза FTUX, сесія вже резолвлена, демо вимкнене.
 */
const VISIBLE = {
  inFtuxSession: false,
  hasUser: false,
  authStatus: "unauthenticated" as string | undefined,
};

describe("isLocalOnlyBannerVisible", () => {
  it("видно аноніму поза FTUX, коли сесія резолвлена", () => {
    expect(isLocalOnlyBannerVisible(VISIBLE)).toBe(true);
  });

  // Регресія, яку знайшло ревʼю #1128. Банер рендериться через
  // `useLocalUserId()`, а той під `loading` віддає `null` і нічого не малює.
  // Якщо прапорець у цей момент віддає `true`, `useOnboardingState` глушить
  // soft-auth hero — і анонім не бачить НІ банера, НІ запрошення увійти.
  it("НЕ видно, поки сесія ще завантажується — інакше soft-auth глушиться без банера", () => {
    expect(
      isLocalOnlyBannerVisible({ ...VISIBLE, authStatus: "loading" }),
    ).toBe(false);
  });

  it("не видно під час FTUX — перша сесія тримає один сигнал на екрані", () => {
    expect(isLocalOnlyBannerVisible({ ...VISIBLE, inFtuxSession: true })).toBe(
      false,
    );
  });

  it("не видно автентифікованому — його дані синкаються", () => {
    expect(isLocalOnlyBannerVisible({ ...VISIBLE, hasUser: true })).toBe(false);
  });

  // Рендер поза `AuthProvider` (так змонтовані власні тести
  // `useHubDashboardState`): `useAuthOptional()` віддає `null`, тож статусу
  // немає — поведінка має лишатись такою самою, як до додавання гварда.
  it("поза AuthProvider (статус undefined) поводиться як із резолвленою сесією", () => {
    expect(
      isLocalOnlyBannerVisible({ ...VISIBLE, authStatus: undefined }),
    ).toBe(true);
  });
});
