import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import { NO_SALE_CLAIM } from "../content/noSaleClaim";
import { EXPORT_CLAIM } from "../content/exportClaim";
import TelegramCta from "../components/TelegramCta";
import { AUTHOR_JSON_LD } from "../content/author";

/**
 * Сторінка про вихід. Найтонша за матеріалом і найбільша спокуса дописати
 * обсяг обіцянками, тому правило одне: жодного зобовʼязання, якого немає в
 * коді. Sunset – зобовʼязання автора: попередити щонайменше за 30 днів
 * (рішення 2026-09-15); механізму в коді немає (`product-overview.md` §11),
 * і це названо прямо, бо сторінка про вихід, яка замовчує найгірший
 * сценарій, не варта нічого.
 */
export default function VyhidPage() {
  usePageMeta({
    ...ROUTE_META["/vyhid"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Як забрати свої дані з Sergeant",
      inLanguage: "uk",
      dateModified: ROUTE_META["/vyhid"].lastmod,
      author: AUTHOR_JSON_LD,
      publisher: { "@type": "Organization", name: "Sergeant" },
    },
  });

  const h2 =
    "font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl";
  const h3 = "mt-8 text-lg font-bold text-foreground-strong";
  const body = "mt-3 max-w-2xl leading-relaxed text-muted";

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-6xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <h1 className="font-display text-4xl font-extrabold uppercase leading-[1.06] tracking-tight text-foreground-strong sm:text-5xl">
        Як забрати своє
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted">
        Як вивантажити свої дані і що буде з ними, якщо продукт зупиниться.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Оновлено{" "}
        <UpdatedOn
          iso={ROUTE_META["/vyhid"].lastmod}
          className="font-semibold"
        />
      </p>

      <section className="mt-14">
        <h2 className={h2}>Експорт двома файлами</h2>
        <div className="mt-8 grid gap-px bg-cardline-strong sm:grid-cols-2">
          <div className="bg-background p-6">
            <h3 className="text-xl font-bold leading-tight text-foreground-strong">
              Акаунтські дані
            </h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Усе, що знає сервер: витрати й операції, тренування, звички,
              харчування, підключення банку, оплати. Вивантажується з профілю
              одним файлом, і він сам перелічує, чого в ньому немає.
            </p>
          </div>
          <div className="bg-background p-6">
            <h3 className="text-xl font-bold leading-tight text-foreground-strong">
              Те, що сервер не бачив
            </h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Записи без входу в акаунт і все, що ще не синхронізувалось із
              пристрою. Знімається окремим локальним бекапом.
            </p>
          </div>
        </div>

        <h3 className={h3}>Чому це не одна кнопка</h3>
        <p className={body}>
          Сервер бачить лише те, що синхронізувалось із твоїм акаунтом. Записи,
          зроблені до першого входу, переїдуть в акаунт, коли ти увійдеш на тому
          самому пристрої. Несинхронізоване лишається тільки на пристрої.
        </p>
        <p className={body}>
          Один файл на обидві частини стоїть у списку «в розробці» на{" "}
          <a
            href="/stan"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            сторінці стану
          </a>
          .
        </p>

        <h3 className={h3}>У якому форматі</h3>
        <p className={body}>
          {EXPORT_CLAIM} Обидва файли відкриваються без Sergeant.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Видалити акаунт можна самому</h2>
        <p className={body}>
          Без листів у підтримку і вмовлянь залишитись. Видалення скасовує
          підписку, стирає історію AI-запитів, памʼять Сержанта і сам акаунт.
        </p>
        <p className={body}>
          Памʼять Сержанта можна чистити й не видаляючи акаунт: по одному запису
          або цілком.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Що буде, якщо продукт зупиниться</h2>
        <p className={body}>
          Попереджу щонайменше за 30 днів до зупинки, і весь цей час експорт
          працюватиме. Політики зберігання даних після зупинки поки немає.
        </p>
        <p className="mt-5 max-w-2xl border-l-2 border-foreground-strong pl-5 text-sm leading-relaxed text-foreground">
          30 днів – це моє зобовʼязання, не автоматика.
        </p>

        <h3 className={h3}>Що це означає практично</h3>
        <p className={body}>
          Продукт робить одна людина, тож найнадійніше знімати експорт час від
          часу, не чекаючи попередження. Файл на твоєму диску від долі продукту
          не залежить.
        </p>

        <h3 className={h3}>Чого не станеться</h3>
        <p className={body}>{NO_SALE_CLAIM}: ні зараз, ні після зупинки.</p>
        <p className={body}>
          Застереження одне: щоб працював Сержант, частина даних їде до
          сторонніх обробників (текст чату, фото страви й чека, опис банківської
          операції). Вони виконують запит і повертають відповідь, але дані при
          цьому виходять за межі моїх серверів. Що куди їде, розписано{" "}
          <a
            href="/data"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            на сторінці про дані
          </a>
          .
        </p>
        <p className="mt-8 text-sm text-subtle">
          Решта зобовʼязань –{" "}
          <a
            href="/obitsyanky"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            у «Що обіцяю»
          </a>
          .
        </p>
        <div className="mt-6">
          <TelegramCta placement="footer" label="Стати в чергу" />
        </div>
      </section>
    </SiteLayout>
  );
}
