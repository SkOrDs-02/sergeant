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
  return (
    <>
      <SiteHeader />
      <main className={mainClassName}>{children}</main>
      <SiteFooter />
    </>
  );
}
