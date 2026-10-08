import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import { EXPORT_CLAIM } from "../content/exportClaim";
import { NO_SALE_CLAIM } from "../content/noSaleClaim";
import UpdatedOn from "../components/UpdatedOn";
import { TELEGRAM_BOT_URL } from "../lib/links";

/**
 * Політика приватності сайту. Коротка, бо сайт збирає мало: аналітика без
 * кукі з чотирма явними подіями, тепловою картою і швидкістю завантаження
 * (lib/analytics.ts), і код атрибуції в посиланні на бота, який бот черги
 * зберігає разом із профілем Telegram (@sergeant/shared landingAttribution,
 * apps/server/src/modules/telegram/waitlistBot.ts).
 *
 * До 2026-10-08 текст обіцяв, що код «зникає із закриттям вкладки» і візит
 * неможливо повʼязати з людиною, і мовчав про теплову карту, яку вмикав
 * remote config PostHog (аудит сайту 2026-10-08, T2-T3, priv-27, priv-28).
 */
export default function PrivacyPage() {
  usePageMeta({
    ...ROUTE_META["/privacy"],
    // До 2026-09-17 — одна з чотирьох сторінок без розмітки: для краулера
    // текст без типу й дати. `WebPage`, а не `Article`: це документ сайту,
    // не авторський матеріал, тож author тут не ставиться.
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: ROUTE_META["/privacy"].title,
      description: ROUTE_META["/privacy"].description,
      inLanguage: "uk",
      dateModified: ROUTE_META["/privacy"].lastmod,
      publisher: { "@type": "Organization", name: "Sergeant" },
    },
  });

  const h2 =
    "mt-9 font-display text-lg font-extrabold uppercase tracking-tight text-foreground-strong";
  const p = "mt-3 max-w-2xl leading-relaxed text-foreground";

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-3xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-4xl">
        Політика приватності
      </h1>
      <p className="mt-3 text-sm text-subtle">
        Оновлено <UpdatedOn iso={ROUTE_META["/privacy"].lastmod} />
      </p>

      <h2 className={h2}>Що збирає цей сайт</h2>
      <p className={p}>
        Сайт не ставить кукі і не будує персональних профілів. Аналітика
        (PostHog, сервери в ЄС) отримує чотири події: перегляд сторінки, перехід
        у Telegram, перемикання демо-віджета на першому екрані і відкриття
        питання у FAQ. Ще вона записує теплову карту сторінки, тобто де клікають
        і як рухається курсор, і швидкість завантаження. Разом із цим PostHog
        бачить технічні дані запиту: адресу сторінки, сайт, з якого ти прийшов,
        тип пристрою, браузер і IP-адресу. Жодна подія не несе введеного тексту.
        Між візитами сайт тебе не впізнає: кожне відвідування починається з
        нуля. Повʼязати візит із тобою може лише код у посиланні на бота, про
        нього нижче.
      </p>

      <h2 className={h2}>Черга в бету</h2>
      <p className={p}>
        Черга живе в Telegram. Сайт не збирає пошту і не має форм. Кнопка «Стати
        в чергу» відкриває бота з коротким кодом у посиланні: він показує, з
        якої кнопки ти прийшов, і такий самий код потрапляє в подію переходу в
        аналітиці. Коли ти натискаєш «Почати», бот зберігає цей код разом із
        даними, які Telegram передає сам: номером чату, імʼям, @ніком і мовою
        інтерфейсу. Так ми бачимо, які сторінки приводять людей у чергу, і цим
        кодом твій візит на сайті повʼязується із записом у черзі. Далі
        спілкування йде в Telegram за його правилами.
      </p>

      <h2 className={h2}>Дані в застосунку</h2>
      <p className={p}>
        Це політика сайту. Про дані всередині застосунку коротко: токен Monobank
        – лише читання і зберігається зашифрованим. {NO_SALE_CLAIM}. Виняток
        один, і він не про торгівлю: щоб працював Сержант, частина даних їде до
        стороннього AI-провайдера. {EXPORT_CLAIM} Повна мапа доступів (що бачить
        банківський токен, куди їдуть фото чеків, як працює Сержант) зібрана на
        сторінці{" "}
        <a
          href="/data"
          className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          «Твої дані»
        </a>
        .
      </p>

      <h2 className={h2}>Питання</h2>
      <p className={p}>
        Напиши нам у{" "}
        <a
          href={TELEGRAM_BOT_URL}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Telegram-бот
        </a>
        , відповімо.
      </p>
    </SiteLayout>
  );
}
