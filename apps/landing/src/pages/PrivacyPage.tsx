import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";

/**
 * Політика приватності сайту. Коротка, бо сайт справді збирає мінімум:
 * cookieless-аналітика з трьома явними подіями і Telegram-естафета без
 * персистентних ідентифікаторів (див. lib/analytics.ts і
 * @sergeant/shared landingAttribution).
 */
export default function PrivacyPage() {
  usePageMeta(ROUTE_META["/privacy"]);

  const h2 =
    "mt-9 font-display text-lg font-extrabold uppercase tracking-tight text-foreground-strong";
  const p = "mt-3 max-w-2xl leading-relaxed text-foreground";

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-4xl">
          Політика приватності
        </h1>
        <p className="mt-3 text-sm text-subtle">Оновлено 28.08.2026</p>

        <h2 className={h2}>Що збирає цей сайт</h2>
        <p className={p}>
          Сайт не ставить кукі і не будує персональних профілів. Аналітика
          (PostHog, ЄС-сервери) отримує кілька анонімних подій: перегляд
          сторінки, перехід у Telegram, перемикання демо-віджета в hero і
          відкриття питання у FAQ. Жодна подія не несе введеного тексту. Кожне
          відвідування – новий анонім; повʼязати їх між собою чи з тобою
          особисто неможливо.
        </p>

        <h2 className={h2}>Черга в бету</h2>
        <p className={p}>
          Черга живе в Telegram. Сайт не збирає пошту і не має форм: у deep link
          передається лише місце кнопки та одноразовий випадковий токен, який
          помирає разом із вкладкою. Далі спілкування відбувається в Telegram за
          його правилами, і бот бачить тільки те, що ти сам йому напишеш.
        </p>

        <h2 className={h2}>Дані в застосунку</h2>
        <p className={p}>
          Це політика сайту. Про дані всередині застосунку коротко: токен
          Monobank – лише читання і зберігається зашифрованим, експорт доступний
          в один клік, і я не продаю і не передаю твої дані нікому.
        </p>

        <h2 className={h2}>Питання</h2>
        <p className={p}>
          Напиши в Telegram-бот або у Threads @sergeant.app – відповідаю сам.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
