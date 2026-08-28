import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import MonoAccessTable from "../components/MonoAccessTable";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";

/**
 * «Твої дані» – одна сторінка про доступи, зберігання і контроль. До неї
 * ця тема була розпилена між статутом, FAQ, гайдом Monobank і /privacy:
 * хто боявся за банківський токен, мусив збирати відповідь по шматках.
 */
export default function DataPage() {
  usePageMeta(ROUTE_META["/data"]);

  const h2 =
    "font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl";
  const p = "mt-4 max-w-2xl leading-relaxed text-foreground";

  return (
    <>
      <SiteHeader />

      <main>
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
        </section>

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 pb-20 sm:px-8">
          <section className="max-w-3xl">
            <h2 className={h2}>Банк: токен лише читає</h2>
            <p className={p}>
              Синк працює через персональний токен Monobank, який ти створюєш
              сам на api.monobank.ua і можеш відкликати там само в один клік.
              Токен зберігається зашифрованим.
            </p>
            <div className="mt-6">
              <MonoAccessTable />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Покроково про підключення і відкликання:{" "}
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
              чернетку з бейджем «перевір суми» і підтверджуєш або правиш її –
              нічого не записується мовчки. Чеки Сільпо підтягуються з твоєї
              програми лояльності після того, як ти сам її підключиш.
            </p>
          </section>

          <section className="max-w-3xl">
            <h2 className={h2}>AI-помічник</h2>
            <p className={p}>
              Повідомлення чату обробляє AI-провайдер (Anthropic). Памʼять
              помічника – те, що він запамʼятав про тебе – можна переглянути і
              видалити по одному запису в налаштуваннях.
            </p>
          </section>

          <section className="max-w-3xl">
            <h2 className={h2}>Зберігання і сайт</h2>
            <p className={p}>
              Дані застосунку живуть на серверах у Європі (Hetzner), частина
              працює локально на твоєму пристрої. Сам сайт не ставить кукі і не
              будує профілів: аналітика отримує кілька анонімних подій. Деталі –
              у{" "}
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
            <h2 className={h2}>Експорт і контроль</h2>
            <p className={p}>
              Експорт у стандартні формати доступний в один клік, без листів у
              підтримку. Дані не продаються і не передаються нікому. Питання про
              свої дані став у Telegram-бот або у Threads @sergeant.app –
              відповідаю сам.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
