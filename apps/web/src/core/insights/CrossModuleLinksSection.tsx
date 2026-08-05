/**
 * Last validated: 2026-08-05
 * Status: Active
 *
 * Секція «Звʼязки між сферами» на `/insights` — власне місце для головного
 * диференціатора продукту (`docs/01-product/model/product-overview.md` §1:
 * «зв'язки між сферами — головна цінність»). До цього зв'язки доставлялись
 * рядком усередині тижневого звіту й були видимі лише в period=week.
 *
 * Рішення власника 2026-08-05: зв'язки живуть тут, а не в хабі; сторінка
 * перейменована зі «Звіти» на «Звʼязки», бо саме це на ній найцінніше.
 *
 * Секція НЕ ховається, коли зв'язків не видно — показує стан мовчання з
 * реальною найближчою до порога парою і реальним прогресом. Ховати означало б
 * зробити з «даних поки замало» невидимий стан, а це рівно та поведінка, яку
 * канон §6 забороняє.
 */
import { useMemo } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { messages } from "@shared/i18n/uk";
import {
  CrossModuleLinkCard,
  type CrossModuleLinkCardProps,
} from "./CrossModuleLinkCard";
import { CrossModuleLinkRow } from "./CrossModuleLinkRow";
import {
  buildCrossModuleSeries,
  notablePairsFromSeries,
  type NotablePair,
} from "./digestCorrelations";
import {
  linkFromPair,
  closestCrossModulePair,
  silentPoles,
} from "./crossModuleLinkData";

const MAX_CARDS = 3;

/**
 * Ключ списку — пара МЕТРИК, а не модулів і не `n`.
 *
 * AI-CONTEXT: спершу ключ був `модульA-модульB-n`, і це ламалось на двох
 * фронтах одночасно. По-перше, різні куровані пари лягають на ту саму пару
 * модулів (`workout_volume × spending` і `wellbeing × spending` — обидві
 * Фізрук×Фінік). По-друге, після фіксу структурних нулів `n` став ОДНАКОВИМ
 * для всіх пар (див. `ABSENCE_MEANS` у `dailySeries.ts`), тож він більше не
 * розрізняє нічого — раніше саме `n` випадково рятував ключ від колізії.
 * Два записи з однаковим `key` — це React, що перевикористовує стан не тієї
 * картки: розгорнутий рядок «переїжджає» на сусідній зв'язок.
 *
 * Пара метрик унікальна за побудовою `PAIRS`, тож ключ стабільний.
 */
function linkKey(pair: NotablePair): string {
  return `${pair.a}-${pair.b}`;
}

export default function CrossModuleLinksSection() {
  // Один прохід по рядах на весь рендер: `buildCrossModuleSeries` читає
  // 60 днів × 10 метрик зі сховища, тож і картки, і стан мовчання беруть
  // дані з ОДНОГО обчислення, а не з двох незалежних.
  const { links, silent } = useMemo(() => {
    const series = buildCrossModuleSeries();
    const found: { key: string; link: CrossModuleLinkCardProps }[] = [];
    for (const pair of notablePairsFromSeries(series)) {
      const link = linkFromPair(series, pair);
      if (link) found.push({ key: linkKey(pair), link });
      if (found.length >= MAX_CARDS) break;
    }
    if (found.length > 0) return { links: found, silent: null };

    const closest = closestCrossModulePair(series);
    return {
      links: found,
      silent: closest
        ? { ...silentPoles(closest.a, closest.b), observations: closest.n }
        : null,
    };
  }, []);

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <SectionHeading as="h2" size="sm">
          {messages.crossModuleLink.sectionTitle}
        </SectionHeading>
        <p className="text-style-caption text-muted leading-relaxed">
          {messages.crossModuleLink.sectionHint}
        </p>
      </div>

      {links.length > 0 ? (
        <div className="space-y-3">
          {links.map(({ key, link }, i) =>
            // Перший — повна картка, решта — компактні рядки, що
            // розгортаються на тапі. Це ієрархія густини (П2), а не
            // економія місця: `notablePairsFromSeries` віддає пари
            // впорядкованими за силою, тож три однакові картки
            // стверджували б рівноцінність, якої немає. Заразом секція
            // перестає займати цілий екран над звітами (≈860 → ≈540 px).
            i === 0 ? (
              <CrossModuleLinkCard key={key} {...link} />
            ) : (
              <CrossModuleLinkRow key={key} {...link} />
            ),
          )}
        </div>
      ) : silent ? (
        // `strength: 0` нижче — не заглушка, а точне твердження: сили зв'язку
        // не виміряно. `gradeCrossModuleLink` віддасть `null`, і картка сама
        // перейде в стан мовчання з прогресом до порога.
        <CrossModuleLinkCard
          poleA={silent.poleA}
          poleB={silent.poleB}
          observations={silent.observations}
          strength={0}
        />
      ) : null}
    </section>
  );
}
