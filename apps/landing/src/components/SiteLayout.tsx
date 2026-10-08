import type { ReactNode } from "react";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

interface SiteLayoutProps {
  children: ReactNode;
  /**
   * Класи `<main>`. Текстові сторінки центрують колонку самі
   * (`mx-auto w-full max-w-3xl …`); сторінки з повношириними секціями
   * не передають нічого – ширину тримають самі секції.
   */
  mainClassName?: string;
}

/**
 * Спільна оболонка сторінки: шапка, `<main>`, підвал. До неї кожна з 13
 * сторінок імпортувала хедер і футер сама, тож будь-яка зміна навігації
 * означала правку в кожному файлі.
 */
export default function SiteLayout({
  children,
  mainClassName,
}: SiteLayoutProps) {
  // Посилання «Перейти до змісту»: без нього клавіатура проходила вісім
  // зупинок шапки на кожній сторінці, перш ніж дістатись тексту (аудит сайту
  // 2026-10-08, V8). Видиме лише у фокусі.
  return (
    <>
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-3 focus-visible:top-3 focus-visible:z-20 focus-visible:inline-flex focus-visible:min-h-11 focus-visible:items-center focus-visible:bg-foreground-strong focus-visible:px-4 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Перейти до змісту
      </a>
      <SiteHeader />
      <main
        id="main"
        tabIndex={-1}
        className={["focus:outline-none", mainClassName]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
