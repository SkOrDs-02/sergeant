/**
 * Last validated: 2026-08-05
 * Status: Active
 *
 * Секція «Звʼязки між сферами» на `/insights` — власне місце для головного
 * диференціатора продукту (`docs/product/model/product-overview.md` §1:
 * «звʼязки між сферами — головна цінність»). До цього звʼязки доставлялись
 * рядком усередині тижневого звіту й були видимі лише в period=week.
 *
 * Рішення власника 2026-08-05: звʼязки живуть тут, а не в хабі; сторінка
 * перейменована зі «Звіти» на «Звʼязки», бо саме це на ній найцінніше.
 *
 * Секція НЕ ховається, коли звʼязків не видно — показує стан мовчання з
 * реальною найближчою до порога парою і реальним прогресом. Ховати означало б
 * зробити з «даних поки замало» невидимий стан, а це рівно та поведінка, яку
 * канон §6 забороняє.
 */
import { useMemo } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { messages } from "@shared/i18n/uk";
import { useHubStorageBump } from "../hub/useHubStorageBump";
import { useFinykSqliteReadTick } from "../../modules/finyk/lib/sqliteReadGate";
import { useFizrukSqliteReadTick } from "../../modules/fizruk/lib/sqliteReadGate";
import { useNutritionSqliteReadTick } from "../../modules/nutrition/lib/sqliteReadGate";
import {
  CrossModuleLinkCard,
  type CrossModuleLinkCardProps,
} from "./CrossModuleLinkCard";
import { CrossModuleLinkRow } from "./CrossModuleLinkRow";
import {
  buildCrossModuleSeries,
  notablePairsFromSeries,
  MIN_N,
  WINDOW_DAYS,
  type NotablePair,
} from "./digestCorrelations";
import {
  linkFromPair,
  closestCrossModulePair,
  silentPoles,
  bestSingleMetric,
  singleMetricPole,
} from "./crossModuleLinkData";
import { MODULE_TEXT_CLASS } from "./CrossModuleLinkCard";
import { pairHistoryKey, recordAndCountChecks } from "./crossModuleLinkHistory";
import { formatDayKeyUk } from "@shared/lib/time/dayKeyLabel";
import { quietLinks, recordNotableLinks, type QuietLink } from "./quietLinks";

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
 * картки: розгорнутий рядок «переїжджає» на сусідній звʼязок.
 *
 * Пара метрик унікальна за побудовою `PAIRS`, тож ключ стабільний.
 */
function quietLinkText(q: QuietLink): string {
  const T = messages.crossModuleLink;
  const base = q.since
    ? T.quietSince.replace(
        "{date}",
        formatDayKeyUk(q.since, { relative: false }),
      )
    : T.quietWindow.replace("{days}", String(WINDOW_DAYS));
  return base
    .replace("{phrase}", q.phrase)
    .replace("{module}", T.moduleLabel[q.module]);
}

function linkKey(pair: NotablePair): string {
  return `${pair.a}-${pair.b}`;
}

export default function CrossModuleLinksSection() {
  // AI-DANGER: тіки трьох модулів — не оптимізація, а умова коректності.
  //
  // `buildCrossModuleSeries` читає ряди з кешів SQLite Фініка, Їжі та
  // Фізрука, а ці кеші — синглтони ДОКУМЕНТА: після повного завантаження
  // сторінки вони порожні й наповнюються асинхронно, вже після першого
  // рендера. З `useMemo(..., [])` секція рахувала рівно один раз — по
  // холодному кешу — і більше ніколи, тож при повній базі впевнено
  // заявляла «Поки що звʼязків не бачу · 0 з N спостережень». Той самий
  // екран, відкритий SPA-переходом із модуля (кеш уже теплий), показував
  // реальний звʼязок — тобто відповідь залежала від шляху навігації:
  // закладка, hard reload і холодний старт PWA давали неправду.
  //
  // Знахідка B1 прийомного прогону бети 2026-08-09
  // (`docs/work/specs/audits/2026-08-09-beta-acceptance-run.md`). Раніше той
  // самий симптом бачили в репетиції 2026-08-07, але списали на методику
  // прогону — і навчили лейн ходити в обхід замість того, щоб завести баг.
  //
  // Тіки бампаються `notify*SqliteCacheRefresh` рівно тоді, коли кеш
  // наповнився чи змінився, тож перерахунок відбувається за подією даних,
  // а не за кожним рендером. Не прибирай їх із deps «для швидкості».
  // `useHubStorageBump` — канонічний hub-сигнал «сховище змінилось»
  // (routine пише через `emitRoutineStorage` → hubBus, плюс крос-табовий
  // `window "storage"`). Його документація описує рівно наш збій: hub-картка
  // агрегує крос-модульні дані в `useMemo` і лишається протухлою. Ряди
  // Рутини читаються НЕ з SQLite, тож самих тіків для них не досить.
  const storageBump = useHubStorageBump();
  const finykTick = useFinykSqliteReadTick();
  const nutritionTick = useNutritionSqliteReadTick();
  const fizrukTick = useFizrukSqliteReadTick();

  // Один прохід по рядах на весь рендер: `buildCrossModuleSeries` читає
  // 60 днів × 10 метрик зі сховища, тож і картки, і стан мовчання беруть
  // дані з ОДНОГО обчислення, а не з двох незалежних.
  const { links, silent, smallData, quiet } = useMemo(() => {
    // Ключі інвалідації «використано» явно — див. коментар до deps нижче.
    void storageBump;
    void finykTick;
    void nutritionTick;
    void fizrukTick;
    const series = buildCrossModuleSeries();
    const pairs = notablePairsFromSeries(series);

    // F-5: памʼять про помітні звʼязки пишеться тут із тієї ж причини, що
    // й тижнева перевірка нижче (синхронне читання під час рендера), і
    // пояснення рахуються з тих самих рядів, без другого 60-денного проходу.
    const quiet = quietLinks(
      series,
      pairs,
      recordNotableLinks(pairs, series.to),
    );

    // Запис перевірки живе саме ТУТ, у тілі мемо, а не в ефекті. Ступінь
    // читається синхронно під час рендера, тож із ефектом перший показ
    // тижня рахував би поточну перевірку відсутньою й рівно раз на тиждень
    // показував би ступінь нижчий за справжній. Виклик ідемпотентний у
    // межах тижня, тож повторний прогін мемо нічого не додає.
    const checksByPair = recordAndCountChecks(pairs);

    const found: { key: string; link: CrossModuleLinkCardProps }[] = [];
    for (const pair of pairs) {
      const link = linkFromPair(series, pair);
      if (link) {
        found.push({
          key: linkKey(pair),
          link: {
            ...link,
            checks: checksByPair.get(pairHistoryKey(pair.a, pair.b)) ?? 0,
          },
        });
      }
      if (found.length >= MAX_CARDS) break;
    }
    if (found.length > 0) {
      return { links: found, silent: null, smallData: null, quiet };
    }

    const closest = closestCrossModulePair(series);

    // Малі дані - окремий стан, а не мʼякший варіант мовчання: доки спільних
    // днів менше за поріг, картка з ДВОМА полюсами вже називала б пару, про
    // яку нічого не доведено (ADR-0097).
    if (closest === null || closest.n < MIN_N) {
      const single = bestSingleMetric(series);
      return {
        links: found,
        silent: null,
        smallData: single
          ? {
              pole: singleMetricPole(single.metric, single.mean),
              observations: single.n,
            }
          : { pole: null, observations: 0 },
        quiet,
      };
    }

    return {
      links: found,
      silent: {
        ...silentPoles(closest.a, closest.b),
        observations: closest.n,
      },
      smallData: null,
      quiet,
    };
    // deps нижче — це КЛЮЧІ ІНВАЛІДАЦІЇ, а не значення, які читає тіло:
    // `buildCrossModuleSeries` бере дані з модульних кешів і сховища, тобто
    // ззовні React. Правило їх не бачить і зве «unnecessary» — але без них
    // секція застигає на холодному першому рендері (B1). Не прибирай.
  }, [storageBump, finykTick, nutritionTick, fizrukTick]);

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <SectionHeading as="h2" size="xs">
          {messages.crossModuleLink.sectionTitle}
        </SectionHeading>
        <p className="text-style-body text-muted leading-relaxed">
          {messages.crossModuleLink.sectionHint}
        </p>
      </div>

      {quiet.length > 0 && (
        <div className="space-y-1">
          {quiet.map((q) => (
            <p
              key={`${q.phrase}|${q.module}`}
              className="text-style-caption text-muted leading-relaxed"
            >
              {quietLinkText(q)}
            </p>
          ))}
        </div>
      )}

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
      ) : smallData ? (
        <div className="space-y-2 rounded-2xl border border-dashed border-line bg-panel p-4">
          <p className="text-style-label font-bold text-text">
            {messages.crossModuleLink.smallDataTitle}
          </p>
          <p className="text-style-body leading-relaxed text-muted">
            {smallData.pole
              ? messages.crossModuleLink.smallDataBody
              : messages.crossModuleLink.smallDataEmpty}
          </p>
          {smallData.pole ? (
            <p className="text-style-body text-text">
              <span className={MODULE_TEXT_CLASS[smallData.pole.module]}>
                {smallData.pole.label}
              </span>
              {` · ${smallData.pole.value} ${smallData.pole.unit} · ${smallData.observations} ${messages.crossModuleLink.smallDataDaysNote}`}
            </p>
          ) : null}
        </div>
      ) : silent ? (
        // `strength: 0` нижче — не заглушка, а точне твердження: сили звʼязку
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
