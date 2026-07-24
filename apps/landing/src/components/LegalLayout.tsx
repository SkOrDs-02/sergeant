import type { ReactNode } from "react";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

interface LegalLayoutProps {
  title: string;
  updated: string;
  children: ReactNode;
}

export default function LegalLayout({
  title,
  updated,
  children,
}: LegalLayoutProps) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted">Оновлено: {updated}</p>
        <div className="mt-8 flex flex-col gap-6 leading-relaxed text-muted [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
