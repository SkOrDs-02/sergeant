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

  // Ті самі заголовки і посилання, що на «Твої дані» і «Вихід»: до
  // 2026-10-08 сторінка мала власні H2 без капсу і сірі посилання без
  // фокус-рамки (аудит сайту 2026-10-08, V15).
  const h2 =
    "mt-12 font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl";
  const link =
    "font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-3xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-5xl">
        Звʼязок
      </h1>
      <p className="mt-5 leading-relaxed text-muted">
        Продукт робить одна людина, тож і відповідає одна людина. Каналів два:
        Telegram-бот для питань і Threads для оголошень. Обидва читаю щодня.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Оновлено{" "}
        <UpdatedOn
          iso={ROUTE_META["/contact"].lastmod}
          className="font-semibold"
        />
      </p>

      <h2 className={h2}>Telegram, основний канал</h2>
      <p className="mt-4 leading-relaxed text-muted">
        Бот тримає чергу закритої бети й приймає повідомлення. Через нього ж
        ідуть запити на доступ, повідомлення про поламане і питання, яких немає
        у{" "}
        <a className={link} href="/pytannya">
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

      <h2 className={h2}>Threads, публічні оголошення</h2>
      <p className="mt-4 leading-relaxed text-muted">
        Те, що змінилось у продукті, зʼявляється{" "}
        <a className={link} href={THREADS_URL} target="_blank" rel="noreferrer">
          у Threads
        </a>
        . Особисті питання туди краще не писати: там немає приватності, і
        відповідь усе одно переїде в Telegram.
      </p>

      <h2 className={h2}>Чого тут немає</h2>
      <p className="mt-4 leading-relaxed text-muted">
        Ні пошти підтримки, ні телефону, ні поштової адреси: юридичної особи
        поки немає, а вигадувати реквізити я не буду. Коли зʼявиться ФОП чи ТОВ,
        реквізити зʼявляться тут і в{" "}
        <a className={link} href="/terms">
          умовах
        </a>{" "}
        одночасно.
      </p>
      <p className="mt-4 leading-relaxed text-muted">
        Щодо даних: забрати їх можна самостійно, без листування – у
        налаштуваннях застосунку є вивантаження всього акаунта і видалення. Як
        це влаштовано, описано на сторінках{" "}
        <a className={link} href="/data">
          про дані
        </a>{" "}
        і{" "}
        <a className={link} href="/vyhid">
          про вихід
        </a>
        .
      </p>
    </SiteLayout>
  );
}
