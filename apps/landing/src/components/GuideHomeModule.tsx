/**
 * «Рідний модуль» – лише для чотирьох модулів. Гайди про безпеку банку і
 * про звʼязки ведуть на сторінки, що модулями не є (`/data`, `/zvyazky`), і
 * підпис «Рідний модуль: Твої дані» казав неправду про устрій продукту
 * (аудит сайту 2026-10-08, T41).
 */
const MODULE_PAGES = new Set(["/hroshi", "/yizha", "/zvychky", "/trenuvannia"]);

/**
 * Рядок «рідний модуль» під заголовком гайда. Замикає hub-and-spoke:
 * доведена форма гайда починає годувати модульну сторінку, а модульна
 * сторінка перестає бути листям без зворотного звʼязку.
 */
interface GuideHomeModuleProps {
  href: string;
  label: string;
}

export default function GuideHomeModule({ href, label }: GuideHomeModuleProps) {
  return (
    <p className="mt-4 text-sm text-subtle">
      {MODULE_PAGES.has(href) ? "Рідний модуль:" : "Докладніше:"}{" "}
      <a
        href={href}
        className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {label}
      </a>
    </p>
  );
}
