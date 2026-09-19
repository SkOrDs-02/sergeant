/**
 * Хвіст модульної сторінки: два посилання, що замикають hub-and-spoke
 * (кожен модуль лінкує /zvyazky і /stan), без речення-обгортки. До
 * 2026-09-17 чотири сторінки несли те саме речення «Як X звʼязаний з рештою
 * сфер – на сторінці про звʼязки, що вже працює – у доповіді про стан»
 * чотирма копіями; рішення власника (аудит копії §8 п. 10) – один компонент.
 */
export default function ModuleFooterLinks() {
  const link =
    "font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <p className="mt-8 text-sm text-subtle">
      <a href="/zvyazky" className={link}>
        Звʼязки між сферами
      </a>
      {" · "}
      <a href="/stan" className={link}>
        Стан розробки
      </a>
    </p>
  );
}
