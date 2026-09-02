import { formatDateUk } from "../lib/dates";

/**
 * Видима дата оновлення сторінки з того самого `lastmod`, що йде в sitemap
 * і в JSON-LD `dateModified`: одне джерело, один формат. До цього гайди
 * тримали дату трьома копіями (текст, JSON-LD, routeMeta), і вони
 * розходились на день.
 */
export default function UpdatedOn({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  return (
    <time dateTime={iso} className={className}>
      {formatDateUk(iso)}
    </time>
  );
}
