import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import { THREADS_URL, TELEGRAM_BOT_URL } from "../lib/links";
import TelegramCta from "../components/TelegramCta";
import UpdatedOn from "../components/UpdatedOn";

/**
 * Сторінка звʼязку. Досі контакт жив у футері й на /about одним лінком, і
 * зовнішня перевірка на готовність до агентів це помітила: моделі шукають
 * саме /contact, коли зважують, чи продукт узагалі існує і кому писати.
 *
 * Тут навмисно немає ні пошти, ні телефону, ні адреси: їх у продукту
 * публічно немає, і вигадати їх заради повноти розмітки означало б збрехати
 * рівно тим, хто цю розмітку читає без людини.
 */
export default function ContactPage() {
  usePageMeta({
    ...ROUTE_META["/contact"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ContactPage",
      inLanguage: "uk",
      url: "/contact",
      dateModified: ROUTE_META["/contact"].lastmod,
      mainEntity: {
        "@type": "Organization",
        name: "Sergeant",
        url: "/",
        logo: "/apple-touch-icon.png",
        sameAs: [THREADS_URL],
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            url: TELEGRAM_BOT_URL,
            availableLanguage: ["uk"],
            areaServed: "UA",
          },
        ],
      },
    },
  });

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-3xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-5xl">
        Звʼязок
      </h1>
      <p className="mt-5 leading-relaxed text-muted">
        Продукт робить одна людина, тож і відповідає одна людина. Каналів два,
        обидва публічні, обидва читаються щодня.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Оновлено{" "}
        <UpdatedOn
          iso={ROUTE_META["/contact"].lastmod}
          className="font-semibold"
        />
      </p>

      <h2 className="mt-12 font-display text-2xl font-bold text-foreground-strong">
        Telegram, основний канал
      </h2>
      <p className="mt-4 leading-relaxed text-muted">
        Бот тримає чергу закритої бети й приймає повідомлення. Через нього ж
        ідуть запити на доступ, повідомлення про поламане і питання, яких немає
        у{" "}
        <a className="underline" href="/pytannya">
          відповідях
        </a>
        . Пиши як людині: що робив, що очікував побачити, що побачив насправді.
        Скриншот прискорює розбір більше за будь-який опис.
      </p>
      <p className="mt-4 leading-relaxed text-muted">
        Про строки: відповідь зазвичай того самого дня, іноді наступного. Нічних
        чергувань і служби підтримки тут немає, і вдавати їх не буду.
      </p>
      <div className="mt-6">
        <TelegramCta placement="footer" label="Написати в Telegram" />
      </div>

      <h2 className="mt-12 font-display text-2xl font-bold text-foreground-strong">
        Threads, публічні оголошення
      </h2>
      <p className="mt-4 leading-relaxed text-muted">
        Те, що змінилось у продукті, зʼявляється{" "}
        <a
          className="underline"
          href={THREADS_URL}
          target="_blank"
          rel="noreferrer"
        >
          у Threads
        </a>
        . Особисті питання туди краще не писати: там немає приватності, і
        відповідь усе одно переїде в Telegram.
      </p>

      <h2 className="mt-12 font-display text-2xl font-bold text-foreground-strong">
        Чого тут немає
      </h2>
      <p className="mt-4 leading-relaxed text-muted">
        Ні пошти підтримки, ні телефону, ні поштової адреси: юридичної особи
        поки немає, а вигадувати реквізити я не буду. Коли зʼявиться ФОП чи ТОВ,
        реквізити стануть тут і в{" "}
        <a className="underline" href="/terms">
          умовах
        </a>{" "}
        одночасно.
      </p>
      <p className="mt-4 leading-relaxed text-muted">
        Що стосується даних: забрати їх можна самостійно, без листування – у
        налаштуваннях застосунку є вивантаження всього акаунта і видалення. Як
        це влаштовано, описано на сторінках{" "}
        <a className="underline" href="/data">
          про дані
        </a>{" "}
        і{" "}
        <a className="underline" href="/vyhid">
          про вихід
        </a>
        .
      </p>
    </SiteLayout>
  );
}
