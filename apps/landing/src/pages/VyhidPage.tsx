import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import TelegramCta from "../components/TelegramCta";

/**
 * Сторінка про вихід. Найтонша за матеріалом і найбільша спокуса дописати
 * обсяг обіцянками, тому правило одне: жодного зобовʼязання, якого немає в
 * коді. Відсутність sunset-механізму названа прямо (`product-overview.md`
 * §11), бо сторінка про вихід, яка замовчує найгірший сценарій, не варта
 * нічого.
 */
export default function VyhidPage() {
  usePageMeta({
    ...ROUTE_META["/vyhid"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Як забрати свої дані з Sergeant",
      inLanguage: "uk",
      dateModified: "2026-08-31",
      author: { "@type": "Person", name: "Автор Sergeant" },
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
        Дві речі, які варто знати до того, як почнеш: як вивантажити свої дані і
        що буде з ними, якщо продукт зупиниться. Обидві відповіді нижче чесні, і
        друга з них незручна.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Оновлено{" "}
        <time dateTime="2026-08-31" className="font-semibold">
          31 серпня 2026
        </time>
      </p>

      <section className="mt-14">
        <h2 className={h2}>Експорт живе двома поверхнями</h2>
        <p className={body}>
          Сьогодні даних дві купи, і забираються вони окремо.
        </p>
        <div className="mt-8 grid gap-px bg-cardline-strong sm:grid-cols-2">
          <div className="bg-background p-6">
            <h3 className="text-xl font-bold leading-tight text-foreground-strong">
              Акаунтські дані
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Підключення банку, рахунки і транзакції, білінг, історія
              AI-запитів і памʼять AI-помічника. Вивантажуються з профілю одним
              файлом.
            </p>
          </div>
          <div className="bg-background p-6">
            <h3 className="text-xl font-bold leading-tight text-foreground-strong">
              Дані модулів
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Витрати, тренування, звички, харчування. Знімаються окремим
              локальним бекапом.
            </p>
          </div>
        </div>

        <h3 className={h3}>Чому це не одна кнопка</h3>
        <p className={body}>
          Тому що це чесний опис поточного стану, а не задум. Дві поверхні з
          різною історією: акаунтські дані живуть на сервері, модульні –
          переважно на пристрої. Єдиного експорту, що зводить обидві в один
          файл, поки немає, і це записано в каноні продукту як відкритий борг, а
          не як фіча.
        </p>
        <p className={body}>
          Він у списку «в розробці» на{" "}
          <a
            href="/stan"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            сторінці стану
          </a>
          . Коли зʼявиться – цей абзац зникне.
        </p>

        <h3 className={h3}>У якому форматі</h3>
        <p className={body}>
          У відкритому машинно-читабельному форматі, який відкриється без
          Sergeant. CSV сьогодні немає – це також чесна межа, а не «скоро буде».
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Видалити акаунт можна самому</h2>
        <p className={body}>
          Без листів у підтримку і без розмови «а може, залишитесь». Видалення
          скасовує підписку, чистить історію AI-запитів і памʼять помічника і
          видаляє сам акаунт.
        </p>
        <p className={body}>
          Памʼять AI-помічника можна чистити й не видаляючи акаунт: по одному
          запису або цілком.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Що буде, якщо продукт зупиниться</h2>
        <p className={body}>Тут починається незручна частина.</p>
        <p className={body}>
          Намір такий: попередити заздалегідь і дати час забрати дані. Але
          механізму, який це гарантує, у продукті сьогодні немає: ні
          автоматичного попередження, ні політики зберігання даних після
          зупинки, ні заздалегідь визначеного строку.
        </p>
        <p className="mt-5 max-w-2xl border-l-2 border-foreground-strong pl-5 text-sm leading-relaxed text-foreground">
          Тобто це намір автора, а не інженерна гарантія. Я пишу це прямо, бо
          сторінка про вихід, на якій замовчують найгірший сценарій, не варта
          нічого.
        </p>

        <h3 className={h3}>Що це означає практично</h3>
        <p className={body}>
          Продукт робить одна людина. Найнадійніше, що ти можеш зробити, – не
          покладатись на майбутню обіцянку, а зняти експорт зараз і повторювати
          це час від часу. Дані, які лежать у тебе на диску, переживуть будь-яке
          рішення про долю продукту.
        </p>

        <h3 className={h3}>Чого тут точно не станеться</h3>
        <p className={body}>
          Дані не продаються і не передаються третім сторонам – ні зараз, ні при
          зупинці. Це та обіцянка, яку я можу дати без застережень, бо вона не
          потребує майбутньої роботи.
        </p>
        <p className="mt-8 text-sm text-subtle">
          Які доступи має продукт –{" "}
          <a
            href="/data"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            на сторінці про дані
          </a>
          , решта зобовʼязань –{" "}
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
