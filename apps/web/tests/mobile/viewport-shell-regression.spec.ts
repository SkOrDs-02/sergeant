import { expect, test } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";

async function documentScrollTop(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      window.scrollY ||
      document.scrollingElement?.scrollTop ||
      document.documentElement.scrollTop,
  );
}

// PR-H7 (design-audit 2026-09-13) інвертував контракт цього спека, і це
// навмисно. Раніше «У мене вже є акаунт» закривало локальний гейт онбордингу
// ДО того, як стало відомо, чи має відвідувач акаунт: один помилковий тап плюс
// «Поки що пропустити» лишав новачка на порожньому хабі — без сплешу, без
// hero «З чого почнемо?», назавжди. Тепер гейт закривається рівно в одному
// місці — у гілці підтвердженої сесії `SIGN_IN_PATH` (`StandaloneRoutes.tsx`),
// яка покриває і свіжий вхід, і відновлену сесію (захист від циклу
// `/welcome → /sign-in → / → /welcome`, заради якого стару позначку й ставили).
//
// Наслідок, який і перевіряє цей тест: неавтентифікований відвідувач після
// «Поки що пропустити» повертається на `/welcome`, а не на хаб. Це не глухий
// кут — сплеш несе і демо, і онбординг, тобто FTUX відновлюється; шлях у хаб
// лишається через сам онбординг, а не повз нього.
//
// Справжня мета файлу — регресії shell-у viewport-а, тож чотири перевірки
// `documentScrollTop === 0` лишились недоторканими: саме вони тут цінні.
test("@critical welcome auth CTA leaves the onboarding gate open until sign-in confirms a session", async ({
  page,
}) => {
  await seedFTUX(page, "cold");
  await page.goto("/welcome");

  const authCta = page.getByRole("button", {
    name: "У мене вже є акаунт",
  });
  await expect(authCta).toBeVisible();
  await expect.poll(() => documentScrollTop(page)).toBe(0);

  await authCta.tap();

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { name: "Вхід в акаунт" }),
  ).toBeVisible();
  await expect.poll(() => documentScrollTop(page)).toBe(0);

  // Гейт онбордингу лишився відкритим, бо сесії так і не сталося: `/sign-in`
  // робить `navigate(-1)` на `/welcome`, і `shouldShowOnboarding()` там усе ще
  // істинний, тож сплеш рендериться замість редиректу на хаб.
  await page.getByRole("button", { name: "Поки що пропустити" }).tap();
  await expect(page).toHaveURL(/\/welcome$/);
  // FTUX справді відновлено, а не просто «інша адреса»: той самий CTA знову на
  // екрані, отже людина може піти будь-яким першим кроком зі сплешу.
  await expect(authCta).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Розділи хабу" }),
  ).not.toBeVisible();
  await expect.poll(() => documentScrollTop(page)).toBe(0);
});

test("settings privacy hash scroll keeps the Hub shell pinned", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");
  await page.goto("/?tab=settings#settings-privacy");

  await expect(
    page.getByRole("tablist", { name: "Групи налаштувань" }),
  ).toBeVisible();
  await expect.poll(() => documentScrollTop(page)).toBe(0);

  const nav = page.getByRole("navigation", { name: "Розділи хабу" });
  await expect(nav).toBeVisible();
  const geometry = await nav.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const root = document.querySelector<HTMLElement>("#root");
    const rootRect = root?.getBoundingClientRect();
    const underlay = getComputedStyle(element, "::before");
    const apron = getComputedStyle(element, "::after");
    return {
      height: rect.height,
      navBottomGap: (rootRect?.bottom ?? window.innerHeight) - rect.bottom,
      rootBottomGap: window.innerHeight - (rootRect?.bottom ?? 0),
      rootPosition: root ? getComputedStyle(root).position : null,
      underlayContent: underlay.content,
      apronContent: apron.content,
    };
  });

  expect(geometry.height).toBeLessThan(140);
  expect(Math.abs(geometry.navBottomGap)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.rootBottomGap)).toBeLessThanOrEqual(1);
  expect(geometry.rootPosition).not.toBe("fixed");
  expect(["none", "normal"]).toContain(geometry.underlayContent);
  expect(["none", "normal"]).toContain(geometry.apronContent);
});
