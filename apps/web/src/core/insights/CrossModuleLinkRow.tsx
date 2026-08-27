/**
 * Last validated: 2026-08-05
 * Status: Active
 *
 * Компактний рядок звʼязку — згорнутий вигляд другого й наступних звʼязків
 * у секції на `/insights`. Тап розгортає його у повну `CrossModuleLinkCard`
 * на місці.
 *
 * AI-CONTEXT: це реалізація принципу П2 анти-слоп плану («ієрархія густини
 * замість однорідної сітки», `docs/05-design/design/anti-slop-strategy.md`),
 * а не просто економія пікселів. Три однакові картки стверджують, що три
 * звʼязки рівноцінні, — а вони не рівноцінні: `notablePairsFromSeries`
 * повертає їх упорядкованими за силою. Густина ранжує, однорідна сітка
 * зрівнює.
 *
 * Чому не таб «Звʼязки / Звіти» (розглядалось і відхилено власником
 * 2026-08-05): таб зрівняв би звʼязки зі звітами одразу після того, як
 * сторінку перейменували на «Звʼязки» саме через їхню цінність, і сховав би
 * стан мовчання — а він має бути видимим за каноном §6. Рядок не ховає
 * нічого: видно, що звʼязок є, з ким він і наскільки впевнений.
 */
import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import {
  CrossModuleLinkCard,
  MODULE_TEXT_CLASS,
  type CrossModuleLinkCardProps,
} from "./CrossModuleLinkCard";
import {
  gradeCrossModuleLink,
  tierMeta,
  tierWord,
} from "./crossModuleLinkTiers";

/**
 * Згорнутий звʼязок, який розгортається в повну картку.
 *
 * Стан живе тут, а не в секції: рядки незалежні один від одного, тож
 * розгортання другого не має нічого знати про третій.
 */
export function CrossModuleLinkRow(props: CrossModuleLinkCardProps) {
  const [open, setOpen] = useState(false);
  const { poleA, poleB, observations, strength, phrase } = props;

  // Той самий градієнт, що і в картці. Якщо звʼязку не видно, ступеня немає
  // — рядок тоді не стверджує нічого, крім самої пари.
  const tier = gradeCrossModuleLink(observations, strength);

  if (open) return <CrossModuleLinkCard {...props} />;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-expanded={false}
      className={cn(
        "w-full rounded-2xl border border-line bg-panel px-4 py-3 text-left",
        // `panel-hi` — зареєстрований токен «трохи піднятої» панелі
        // (`tailwind-preset.js` → `panelHi`). `panel-hover` у токенах немає.
        "transition-colors hover:bg-panel-hi",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-style-caption font-semibold">
          <span className={MODULE_TEXT_CLASS[poleA.module]}>{poleA.label}</span>
          <span className="text-subtle" aria-hidden="true">
            {" × "}
          </span>
          <span className={MODULE_TEXT_CLASS[poleB.module]}>{poleB.label}</span>
        </span>
        {tier !== null && (
          <span className="shrink-0 text-style-caption text-subtle tabular-nums">
            {tierWord(tier)}
          </span>
        )}
      </div>
      {phrase !== undefined && (
        <p className="mt-1 text-style-body leading-snug text-text">{phrase}</p>
      )}
      {tier !== null && (
        <p className="mt-0.5 text-style-caption text-muted tabular-nums">
          {tierMeta(tier, observations)}
        </p>
      )}
    </button>
  );
}
