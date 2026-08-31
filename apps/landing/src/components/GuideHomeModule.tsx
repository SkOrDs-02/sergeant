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
      Рідний модуль:{" "}
      <a
        href={href}
        className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {label}
      </a>
    </p>
  );
}
