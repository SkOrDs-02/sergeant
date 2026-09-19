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
          Продукт працює з банківською випискою, фото чеків і їжею. Тому тут
          зібрано в одному місці: які доступи він має, де лежать дані і як їх
          забрати.
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
            Синк працює через персональний токен Monobank, який ти створюєш сам
            на api.monobank.ua і можеш відкликати там само в один клік. Токен
            зберігається зашифрованим.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Що саме бачить токен і чого не може, таблицею, і покроково про
            підключення й відкликання:{" "}
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
            Фото чека їде на сервер, де AI-модель розпізнає позиції. Ти бачиш
            чернетку з бейджем «перевір суми» і підтверджуєш або правиш її:
            нічого не записується мовчки. Чеки Сільпо підтягуються з твоєї
            програми лояльності після того, як ти сам її підключиш.
          </p>
        </section>

        <section className="max-w-3xl">
          <h2 className={h2}>AI-помічник</h2>
          <p className={p}>
            Повідомлення чату обробляє сторонній AI-провайдер. Модель
            добирається під задачу, тож конкретний обробник залежить від того,
            що саме ти зробив: текст чату, фото страви, фото чека й опис
            банківської операції можуть піти до різних провайдерів, частина –
            через шлюз-посередник. Усі вони обробники за призначенням: виконують
            запит і повертають результат. Перед відправкою вирізається пошта,
            телефон, номер картки й IBAN; суми, категорії і назви крамниць ідуть
            як є, бо без них порада порожня.
          </p>
          <p className={p}>
            Памʼять помічника, тобто факти, які він запамʼятав про тебе, можна
            переглянути і видалити по одному запису в налаштуваннях.
          </p>
        </section>

        <section className="max-w-3xl">
          <h2 className={h2}>Зберігання і сайт</h2>
          <p className={p}>
            Дані застосунку живуть на серверах у Європі (Hetzner), частина
            працює локально на твоєму пристрої. Сам сайт не ставить кукі і не
            будує профілів: аналітика отримує кілька анонімних подій. Деталі – у{" "}
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
            листів у підтримку. Експорт сьогодні живе двома поверхнями:
            акаунтські дані окремо від даних модулів. Як це працює і що буде,
            якщо продукт зупиниться, розписано{" "}
            <a
              href="/vyhid"
              className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              на сторінці про вихід
            </a>
            .
          </p>
          <p className={p}>
            {NO_SALE_CLAIM}; куди вони їдуть заради роботи AI, сказано вище.
            Питання про свої дані став у Telegram-бот або у Threads
            @sergeant.app, відповідаю сам.
          </p>
        </section>
      </div>
    </SiteLayout>
  );
}
