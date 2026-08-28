import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";

export default function TermsPage() {
  usePageMeta(ROUTE_META["/terms"]);

  const h2 =
    "mt-9 font-display text-lg font-extrabold uppercase tracking-tight text-foreground-strong";
  const p = "mt-3 max-w-2xl leading-relaxed text-foreground";

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-4xl">
          Умови використання
        </h1>
        <p className="mt-3 text-sm text-subtle">Оновлено 28.08.2026</p>

        <h2 className={h2}>Це бета</h2>
        <p className={p}>
          Sergeant у закритій беті: щось може ламатись, змінюватись чи зникати
          без попередження. Чесний стан – у розділі «Доповідь про стан» на
          головній. Сервіс надається «як є», без гарантій безперервної роботи.
        </p>

        <h2 className={h2}>Що обіцяю</h2>
        <p className={p}>
          Ядро і банк-синк безкоштовні назавжди. Твої дані належать тобі:
          експорт у стандартні формати доступний в один клік, а якщо бета
          закриється – даних це не стосується, забереш усе.
        </p>

        <h2 className={h2}>Що не варто робити</h2>
        <p className={p}>
          Не ламай сервіс навмисно, не намагайся дістати чужі дані і не
          використовуй Sergeant для незаконного. За таке доступ закривається без
          черги.
        </p>

        <h2 className={h2}>Не порада</h2>
        <p className={p}>
          Sergeant показує твої власні цифри і звʼязки між ними. Це не
          фінансова, не медична і не будь-яка інша професійна порада.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
