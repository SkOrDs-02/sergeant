import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import { NO_SALE_CLAIM } from "../content/noSaleClaim";
import { AUTHOR_JSON_LD } from "../content/author";

/**
 * «Твої дані» – одна сторінка про доступи, зберігання і контроль. До неї
 * ця тема була розпилена між статутом, FAQ, гайдом Monobank і /privacy:
 * хто боявся за банківський токен, мусив збирати відповідь по шматках.
 */
export default function DataPage() {
  usePageMeta({
    ...ROUTE_META["/data"],
    // Єдина контентна сторінка без розмітки до 2026-09-15: для краулера
    // вона була текстом без типу й дати. Та сама Article-форма, що й на
    // модульних сторінках, дата – з lastmod маршруту.
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: ROUTE_META["/data"].title,
      inLanguage: "uk",
      dateModified: ROUTE_META["/data"].lastmod,
      author: AUTHOR_JSON_LD,
      publisher: { "@type": "Organization", name: "Sergeant" },
    },
  });

  const h2 =
    "font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl";
  const p = "mt-4 max-w-2xl leading-relaxed text-foreground";

  return (
    <SiteLayout>
      <section className="mx-auto w-full max-w-6xl px-5 pb-10 pt-12 sm:px-8 sm:pt-16">
        <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
          Твої дані
        </p>
        <h1 className="mt-4 font-display text-3xl font-extrabold uppercase leading-[1.08] tracking-tight text-foreground-strong sm:text-5xl">
          Що бачить Sergeant
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-foreground">
          Sergeant працює з банківською випискою, фото чеків і їжею. Тут
          зібрано, які доступи він має, де лежать дані і як їх забрати.
        </p>
        <p className="mt-3 text-sm text-subtle">
          Оновлено{" "}
          <UpdatedOn
            iso={ROUTE_META["/data"].lastmod}
            className="font-semibold"
          />
        </p>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 pb-20 sm:px-8">
        <section className="max-w-3xl">
          <h2 className={h2}>Банк: токен лише читає</h2>
          <p className={p}>
            Синхронізація працює через персональний токен Monobank, який ти
            створюєш сам на api.monobank.ua і можеш відкликати там само в один
            клік. Токен зберігається зашифрованим.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            Що бачить токен і як його підключити чи відкликати:{" "}
            <a
              href="/guides/monobank"
              className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              гайд про Monobank
            </a>
            .
          </p>
        </section>

        <section className="max-w-3xl">
          <h2 className={h2}>Чеки і фото</h2>
          <p className={p}>
            Фото чека йде на сервер, а звідти до ШІ-моделі стороннього
            провайдера, яка розпізнає позиції. Кадр іде цілим, без маскування,
            тож перевір, що в ньому немає нічого особистого. Далі ти бачиш
            чернетку з позначкою «перевір суми» і підтверджуєш або правиш її.
            Чеки Сільпо підтягуються з твоєї програми лояльності, якщо ти сам її
            підключиш.
          </p>
        </section>

        <section className="max-w-3xl">
          <h2 className={h2}>Сержант</h2>
          <p className={p}>
            Повідомлення чату обробляє сторонній ШІ-провайдер. Модель
            добирається під задачу: текст чату, голосове повідомлення, фото
            страви, фото чека, опис банківської операції і пошук у памʼяті
            Сержанта можуть піти до різних провайдерів, частина – через
            шлюз-посередник OpenRouter. Усі вони обробники за призначенням:
            виконують запит і повертають результат. Через шлюз запити йдуть лише
            до постачальників, які за його умовами не зберігають запити і не
            навчаються на них.
          </p>
          <p className={p}>
            З тексту перед відправкою вирізаються пошта, телефон, номер картки й
            IBAN. Суми, категорії і назви крамниць ідуть як є, без них поради не
            буде. Фото страви чи чека модель бачить таким, яким ти його зняв.
          </p>
          <p className={p}>
            Факти, які Сержант запамʼятав про тебе, можна переглянути в
            налаштуваннях і видалити по одному. Що він уміє і скільки це коштує
            – на{" "}
            <a
              href="/pomichnyk"
              className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              сторінці Сержанта
            </a>
            .
          </p>
        </section>

        <section className="max-w-3xl">
          <h2 className={h2}>Зберігання і сайт</h2>
          <p className={p}>
            Дані застосунку живуть на серверах у Європі (Hetzner), частина
            працює локально на твоєму пристрої. Історія чату й памʼять Сержанта
            в браузері зашифровані, з файлів браузера їх не прочитати. Сайт не
            ставить кукі і не будує профілів. Що бачать аналітика сайту і бот
            черги – у{" "}
            <a
              href="/privacy"
              className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              політиці приватності
            </a>
            .
          </p>
        </section>

        <section className="max-w-3xl">
          <h2 className={h2}>Забрати і стерти</h2>
          <p className={p}>
            Дані експортуються у відкритому форматі, акаунт видаляєш сам, без
            листів у підтримку. Експорт – це два файли: серверний із профілю і
            локальний бекап із пристрою. Що буде, якщо продукт зупиниться –{" "}
            <a
              href="/vyhid"
              className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              на сторінці про вихід
            </a>
            .
          </p>
          <p className={p}>
            {NO_SALE_CLAIM}; до ШІ-провайдерів вони йдуть лише для обробки, як
            описано вище. Питання про свої дані пиши в Telegram-бот, відповідаю
            сам.
          </p>
        </section>
      </div>
    </SiteLayout>
  );
}
