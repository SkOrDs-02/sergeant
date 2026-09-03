/**
 * Last validated: 2026-09-03
 * Status: Active
 *
 * Sprint 2 (0017): per-domain lazy decomposition. Each domain card is a
 * separate lazy chunk so the page renders skeletons immediately and each
 * card loads independently without blocking the others.
 */
import { useState, useMemo, useCallback, lazy, Suspense } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Segmented } from "@shared/components/ui/Segmented";
import { Icon, type IconName } from "@shared/components/ui/Icon";
import { generatePDFReport } from "@shared/lib/ui/export";
import { messages } from "@shared/i18n/uk";
import { useLocale } from "@shared/i18n/useLocale";
import {
  getActiveModules,
  isActiveModule,
  type DashboardModuleId,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import { generateInsights } from "../lib/insightsEngine";
import { PaywallModal, useFeatureGate } from "../billing";
import {
  getPeriodRange,
  localDateKey,
  type Period,
} from "./hubReports.aggregation";
import { formatDayRangeUk } from "@shared/lib/time/dayKeyLabel";
import { deviceDayKey } from "@sergeant/shared";
import ChunkErrorBoundary from "./ChunkErrorBoundary";
import { PdfPreviewModal } from "./PdfPreviewModal";

// ── Lazy card chunks ──────────────────────────────────────────────────

const FitnessCard = lazy(() => import("./FitnessCard"));
const ExpensesCard = lazy(() => import("./ExpensesCard"));
const RoutineCard = lazy(() => import("./RoutineCard"));
const NutritionCard = lazy(() => import("./NutritionCard"));
const CrossModuleLinksSection = lazy(
  () => import("../insights/CrossModuleLinksSection"),
);

// ── Card skeleton fallback ────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div
      className="h-[56px] animate-pulse bg-panel border border-line rounded-2xl"
      role="status"
      aria-label={messages.loaders.loadingSection}
      aria-busy="true"
    />
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatPeriodLabel(period: Period, offset: number): string {
  const { start, end } = getPeriodRange(period, offset);
  if (period === "week") {
    // `todayKey` — щоб рік не дописувався в поточному році: «31 серп – 6 вер»
    // замість «31 серп 2026 – 6 вер 2026», який на 393 px переносився на два
    // рядки посеред смуги навігації.
    return formatDayRangeUk(localDateKey(start), localDateKey(end), {
      relative: false,
      todayKey: deviceDayKey(),
    });
  } else {
    return start.toLocaleDateString("uk-UA", {
      month: "long",
      year: "numeric",
    });
  }
}

// ── InsightRow (kept local — not a lazy chunk, always needed) ─────────

interface InsightRowProps {
  iconName: IconName;
  title: string;
  stat: string;
  detail?: string;
}

/**
 * Рядок закономірності — щільний список без карток (П2, `anti-slop-strategy.md`
 * §4: «контекст — щільний список без карток, на hairline-роздільниках;
 * картка лишається тільки там, де вона несе семантику окремого обʼєкта,
 * який можна взяти»).
 *
 * AI-CONTEXT (2026-09-03): до цього кожна закономірність була окремою
 * `rounded-2xl` карткою — тією ж формою, що й картка звʼязку над нею і
 * звітні аркуші під нею. Закономірність не тапається, не розгортається і
 * не є «річчю, яку можна взяти» — це один рядок факту. Чотири однакові
 * картки поспіль додавали сторінці третій ряд контейнерів між звʼязками
 * і звітами, і саме на це власник поскаржився як на «шумно, купа всього».
 * Це НЕ ієрархія густини (`generateInsights` не ранжує) — це зняття
 * контейнера, якому немає що означати.
 */
function InsightRow({ iconName, title, stat, detail }: InsightRowProps) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon
        name={iconName}
        size={16}
        className="mt-0.5 shrink-0 text-subtle"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-style-body leading-snug text-text">{title}</p>
        {detail && (
          <p className="mt-0.5 text-style-caption text-muted">{detail}</p>
        )}
      </div>
      <span className="shrink-0 text-style-label font-bold tabular-nums text-text">
        {stat}
      </span>
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function HubReports() {
  const [period, setPeriod] = useState<Period>("week");
  const [offset, setOffset] = useState(0);
  // Holds the generated report HTML while the in-app PDF preview is open.
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  // Locale-resolved paywall copy. `loadingSection` aria-label у CardSkeleton
  // (module-scope) лишається на UK fallback — це screen-reader hint, не
  // user-visible copy, low priority для translation. Paywall surface — це
  // conversion-critical, тому йде через `useLocale`.
  const { messages: i18n } = useLocale();

  const label = formatPeriodLabel(period, offset);
  const isCurrentPeriod = offset === 0;

  /**
   * Звіт показує лише ті модулі, які людина лишила активними.
   *
   * AI-CONTEXT: беремо `getActiveModules`, а НЕ `getVibePicks` напряму.
   * Різниця принципова і вже описана в `activeModules.ts`: порожній вибір
   * означає «ми не знаємо, що вона обрала» (акаунт до візарда, новий
   * пристрій), а не «вона обрала нічого». `getActiveModules` у цьому разі
   * повертає всі чотири, тож сторінка ніколи не порожніє через
   * невідомість — рівно та поведінка, яку тут і треба.
   *
   * Читаємо один раз на маунт — так само, як `useHubDashboardState.ts:251`
   * і `DashboardSection.tsx:69`. Вибір міняється в налаштуваннях, тобто
   * на іншому екрані, і повернення сюди перемонтовує вкладку.
   */
  const activeModules = useMemo(() => getActiveModules(webKVStore), []);
  const shows = useCallback(
    (id: DashboardModuleId) => isActiveModule(activeModules, id),
    [activeModules],
  );

  /**
   * AI-CONTEXT (2026-08-07): раніше сюди дописувався суфікс «(за тиждень)» /
   * «(за місяць)» — нібито щоб дати контекст незалежно від позиції
   * перемикача. Насправді підпис брехав: `generateInsights()` не приймає
   * аргументів, його вікна зашиті (≥4 тижні, ≥20 подій, ≥2 місяці) і на
   * перемикач не реагують. Той самий текст їхав у PDF-експорт.
   *
   * Замість підпису секція переїхала НАД перемикач — туди, де вже стоять
   * звʼязки, і рівно з тієї ж причини.
   */
  const insights = useMemo(() => generateInsights(), []);

  // Phase 7 D2 — cross-module PDF export is Premium. Free users see
  // the button but tapping it opens the paywall instead of generating
  // the report.
  const exportGate = useFeatureGate("analytics-export-pdf");
  const handleExportPdf = useCallback(() => {
    if (!exportGate.requireAccess()) return;
    // Escape any `<`/`&`/`>` before embedding insight strings into the report
    // HTML. Today insight fields are engine-formatted (numbers + fixed UA
    // copy), but escaping keeps the report robust if a future insight ever
    // interpolates user-entered text (e.g. a habit or transaction label).
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Render the real insights (title / stat / detail) rather than just their
    // count — the earlier export only stated "Доступно інсайтів: N", which
    // left the exported page nearly empty even when the user had data.
    const insightsContent =
      insights.length > 0
        ? `<table>
            <thead>
              <tr><th>Показник</th><th>Значення</th><th>Деталі</th></tr>
            </thead>
            <tbody>
              ${insights
                .map(
                  (ins) =>
                    `<tr><td>${esc(ins.title)}</td><td>${esc(ins.stat)}</td><td>${esc(ins.detail)}</td></tr>`,
                )
                .join("")}
            </tbody>
          </table>`
        : "<p>Поки замало даних для закономірностей. Додай записи в модулях, щоб наступний експорт містив більше висновків.</p>";

    setPreviewHtml(
      generatePDFReport({
        title: "Sergeant · звіт",
        subtitle: label,
        sections: [
          {
            title: "Період",
            content: `<p>${esc(label)}</p>`,
          },
          {
            // Вікно в заголовку названо прямо: інсайти рахуються за весь час
            // спостережень, а не за вибраний період, і сусідство з секцією
            // «Період» раніше натякало на протилежне.
            title: `Закономірності за весь час (${insights.length})`,
            content: insightsContent,
          },
        ],
      }),
    );
  }, [exportGate, insights, label]);

  return (
    <div className="space-y-6">
      {/*
        Три блоки з ТРЬОМА різними вікнами, і кожен названий один раз:
        звʼязки (60 днів), закономірності (весь час), звіти (тиждень або
        місяць за перемикачем). До 2026-09-03 сторінка мала лише два кікери
        на три блоки, а третій — перемикач періоду — плавав над аркушами без
        імені, тож підписи перших двох мусили пояснювати, що перемикач
        «на них не впливає». Названий блок робить ці речення зайвими.

        Звʼязки стоять першими навмисно: вони рахуються за фіксоване 60-денне
        вікно і на «Тиждень / Місяць» не реагують. Сторінка названа «Звʼязки»,
        тож головне на ній видно без прокрутки.
      */}
      <ChunkErrorBoundary minH={120}>
        <Suspense fallback={<CardSkeleton />}>
          <CrossModuleLinksSection />
        </Suspense>
      </ChunkErrorBoundary>

      {/*
        Назва «Закономірності», а не «Інсайти»: цим словом на головній
        називається зовсім інше — тактичні модульні підказки за сьогодні
        (`HubInsightsBlock`). Один термін на дві сутності з різними вікнами
        читався як суперечність.

        Порожній стан прибрано свідомо. Сторінка вже має один — картку
        мовчання у «Звʼязках між сферами», з реальною найближчою парою і
        прогресом до порога. Пороги звʼязків НИЖЧІ за тутешні (10 спостережень
        проти ≥20 подій), тож поки мовчать звʼязки, закономірностей
        гарантовано немає.
      */}
      {insights.length > 0 && (
        <section className="space-y-1">
          <SectionHeading as="h2" size="xs">
            Закономірності
          </SectionHeading>
          <p className="text-style-caption text-muted">
            Що повторюється у твоїх даних за весь час.
          </p>
          <ul className="divide-y divide-line">
            {insights.map((ins) => (
              <InsightRow key={ins.id} {...ins} />
            ))}
          </ul>
        </section>
      )}

      {/*
        Звіти за період — чотири модульні аркуші. Кікер і перемикач в одному
        рядку, смуга навігації по періодах — під ними: два ряди різного роду (заголовок + контрол,
        потім навігація), а не два ряди контролів, які читались би як панель
        налаштувань (застереження власника 2026-08-05 щодо табу
        «Звʼязки / Звіти» — те саме міркування).
      */}
      <section className="space-y-3">
        <SectionHeading
          as="h2"
          size="xs"
          action={
            <Segmented<Period>
              size="sm"
              style="solid"
              ariaLabel="Період звіту"
              value={period}
              onChange={(p) => {
                setPeriod(p);
                setOffset(0);
              }}
              items={[
                { value: "week", label: "Тиждень" },
                { value: "month", label: "Місяць" },
              ]}
            />
          }
        >
          Звіти
        </SectionHeading>

        <div className="flex items-center justify-between gap-1">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => setOffset((o) => o - 1)}
            aria-label="Попередній"
          >
            <Icon name="chevron-left" size={16} aria-hidden />
          </Button>
          <span className="text-style-label text-text text-center tabular-nums">
            {label}
          </span>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={isCurrentPeriod}
            aria-label="Наступний"
          >
            <Icon name="chevron-right" size={16} aria-hidden />
          </Button>
        </div>

        {/* Картка модуля, який людина вимкнула, не рендериться взагалі —
            не «порожній стан», не «підключити». Вимкнений модуль не має
            що звітувати, і рядок про це був би шумом, а не інформацією. */}
        <div className="grid grid-cols-1 gap-3">
          {shows("fizruk") && (
            <ChunkErrorBoundary minH={56}>
              <Suspense fallback={<CardSkeleton />}>
                <FitnessCard period={period} offset={offset} />
              </Suspense>
            </ChunkErrorBoundary>
          )}
          {shows("finyk") && (
            <ChunkErrorBoundary minH={56}>
              <Suspense fallback={<CardSkeleton />}>
                <ExpensesCard period={period} offset={offset} />
              </Suspense>
            </ChunkErrorBoundary>
          )}
          {shows("routine") && (
            <ChunkErrorBoundary minH={56}>
              <Suspense fallback={<CardSkeleton />}>
                <RoutineCard period={period} offset={offset} />
              </Suspense>
            </ChunkErrorBoundary>
          )}
          {shows("nutrition") && (
            <ChunkErrorBoundary minH={56}>
              <Suspense fallback={<CardSkeleton />}>
                <NutritionCard period={period} offset={offset} />
              </Suspense>
            </ChunkErrorBoundary>
          )}
        </div>

        {/*
          Тижневого дайджесту тут більше немає (рішення власника 2026-09-03).
          Він приходить сам — понеділковою автогенерацією
          (`useMondayAutoDigest`) — і живе внизу головної (`HubInsightsBlock`
          → `WeeklyDigestFooter` → `WeeklyDigestCard`). Друга копія на цій
          вкладці була найважчою поверхнею сторінки і дублювала те, що за
          один тап на головній. З 2026-05-13 до 2026-09-03 картка стояла тут,
          щоб той, хто шукає «звіт», знайшов його у «Звітах»; тепер вкладка
          називається «Звʼязки», і причина зникла разом із назвою.
        */}

        {/* Phase 7 D2 — Premium-gated cross-module PDF export. Тихий
            ghost-рядок наприкінці блоку звітів, а не ще одна кнопка на всю
            ширину: експорт — дія другого плану, і повноширинна рамка
            робила з нього пʼятий аркуш. Тап відкриває paywall для free
            (`useFeatureGate`). */}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={handleExportPdf}>
            <Icon name="download" size={16} aria-hidden />
            Експортувати PDF
          </Button>
        </div>
      </section>

      <PaywallModal
        open={exportGate.paywallOpen}
        onClose={exportGate.closePaywall}
        surface={exportGate.paywallSurface}
        title={i18n.paywall["analytics-export-pdf"].title}
        description={i18n.paywall["analytics-export-pdf"].description}
      />

      {previewHtml !== null && (
        <PdfPreviewModal
          html={previewHtml}
          onClose={() => setPreviewHtml(null)}
        />
      )}
    </div>
  );
}
