/**
 * Знак Sergeant: сержантські лички, що перетікають у літеру S.
 * Джерело геометрії – brand-vector айдентики (шеврони = полілінії,
 * S = дві дуги кіл однаковим штрихом); тут відтворено інлайном, бо
 * лендінг не має спільного asset-пакета з рештою поверхонь.
 */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden="true"
      className="stroke-foreground-strong"
    >
      <g strokeWidth="46" strokeLinejoin="miter">
        <polyline points="96,180 256,90 416,180" />
        <polyline points="96,260 256,170 416,260" />
      </g>
      <path
        strokeWidth="48"
        d="M 322,306 A 66 66 0 1 0 256,372 A 66 66 0 1 1 190,438"
      />
    </svg>
  );
}

export default function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <a
      href="/"
      className="inline-flex min-h-11 items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <LogoMark size={small ? 18 : 24} />
      <span
        className={`font-display font-extrabold uppercase tracking-[0.06em] text-foreground-strong ${small ? "text-xs" : "text-[15px]"}`}
      >
        Sergeant
      </span>
    </a>
  );
}
