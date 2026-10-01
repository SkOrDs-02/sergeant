import type { Page } from "@playwright/test";

/**
 * Дочекатись, поки доїдуть entry-анімації, і лише тоді знімати кольори.
 *
 * axe міряє контраст по computed-стилях у момент виклику, а `opacity`
 * предка домножує foreground на альфу. Блоки хаба заїжджають через
 * `stagger-in` (`StaggerChild`, 320 ms, opacity 0 → 1), lazy-контент —
 * через `SuspenseWithMinDelay` (`animate-fade-in`, 220 ms). Скан, що
 * потрапив у хвіст такої анімації, бачить «розбавлений» текст: на #72
 * (run 35117972018, 2026-09-16) заголовок «Модулі» дав 3.75:1 із
 * foreground `#6e756f` — це `--c-muted` #535c56 при opacity ≈0.83 на столі
 * хаба, а підказки карток — 4.49:1 із `#79736d` замість `--c-subtle`
 * #605a54. Той самий коміт на другому прогоні зелений: різниця лише в
 * тому, коли мережа затихла відносно маунту сітки.
 *
 * Чекаємо лише СКІНЧЕННІ анімації (лупи shimmer/pulse ніколи не
 * закінчуються) і кількома проходами, бо stagger-діти стартують із
 * затримкою до 150 ms, а Suspense-контент може змонтуватись після першого
 * проходу. Стеля — 3 с: анімація, яку хтось поставив на паузу, не має
 * вішати тест. Та сама схема, що в `tests/mobile/audit.ts` (там rect-и,
 * тут кольори — мотив один: міряти кадр, який уже приземлився).
 *
 * Спільний для `axe.spec.ts` і `low-vision.spec.ts`: обидва роблять
 * скан/замір по стилях, і обидва однаково брешуть у хвості анімації.
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const deadline = performance.now() + 3_000;
    for (let pass = 0; pass < 5; pass++) {
      const pending = document
        .getAnimations()
        .filter(
          (a) =>
            a.playState !== "finished" &&
            a.effect?.getComputedTiming().iterations !== Infinity,
        );
      const budget = deadline - performance.now();
      if (pending.length === 0 || budget <= 0) return;
      await Promise.race([
        Promise.all(pending.map((a) => a.finished.catch(() => undefined))),
        new Promise((resolve) => setTimeout(resolve, budget)),
      ]);
    }
  });
}
