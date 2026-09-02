/**
 * Last validated: 2026-05-23
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
import { cn } from "@shared/lib/ui/cn";
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
import { WeeklyDigestCard } from "../insights/WeeklyDigestCard";
import { PaywallModal, useFeatureGate } from "../billing";
import {
  getPeriodRange,
  localDateKey,
  type Period,
} from "./hubReports.aggregation";
import { formatDayRangeUk } from "@shared/lib/time/dayKeyLabel";
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
    return formatDayRangeUk(localDateKey(start), localDateKey(end), {
      relative: false,
    });
  } else {
    return start.toLocaleDateString("uk-UA", {
      month: "long",
      year: "numeric",
    });
  }
}

// ── InsightCard (kept local — not a lazy chunk, always needed) ────────

interface InsightCardProps {
  iconName: IconName;
  title: string;
  stat: string;
  detail?: string;
}

function InsightCard({ iconName, title, stat, detail }: InsightCardProps) {
  return (
    <div className="bg-panel border border-line rounded-2xl p-4 flex gap-3 items-start">
      <Icon name={iconName} size={24} className="shrink-0 text-muted mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-style-label text-text leading-snug">{title}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-style-title text-brand-strong">{stat}</span>
          {detail && (
            <span className="text-style-caption text-muted truncate">
              {detail}
            </span>
          )}
        </div>
      </div>
    </div>
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
    <div className="space-y-4">
      {/*
        Звʼязки стоять НАД перемикачем періоду навмисно: вони рахуються за
        фіксоване 60-денне вікно і на «Тиждень / Місяць» не реагують. Під
        перемикачем секція читалась би так, ніби ігнорує контрол просто над
        собою; над ним — це окремий блок із власним вікном, яке підпис
        секції називає прямо. Сторінка названа «Звʼязки», тож головне на ній
        видно без прокрутки.
      */}
      <ChunkErrorBoundary minH={120}>
        <Suspense fallback={<CardSkeleton />}>
          <CrossModuleLinksSection />
        </Suspense>
      </ChunkErrorBoundary>

      {/*
        Сусід звʼязків, а не хвіст звітів. Обидва блоки рахуються за власним
        фіксованим вікном і перемикач періоду ігнорують, тож під ним читались
        би як зламані.

        Назва «Закономірності», а не «Інсайти»: цим словом на головній
        називається зовсім інше — тактичні модульні підказки за сьогодні
        (`HubInsightsBlock`). Один термін на дві сутності з різними вікнами
        читався як суперечність: «на головній інсайти вже є, а тут кажуть, що
        даних замало».

        Порожній стан прибрано свідомо. Сторінка вже має один — картку
        мовчання у «Звʼязках між сферами», з реальною найближчою парою і
        прогресом до порога. Пороги звʼязків НИЖЧІ за тутешні (10 спостережень
        проти ≥20 подій), тож поки мовчать звʼязки, закономірностей
        гарантовано немає: банер «Ще збираємо твої дані» нічого не додавав,
        лише казав те саме вдруге і слабшими словами.
      */}
      {insights.length > 0 && (
        <section className="space-y-3">
          <div className="space-y-1">
            <SectionHeading as="h2" size="xs">
              Закономірності
            </SectionHeading>
            <p className="text-style-body text-muted leading-relaxed">
              Що повторюється у твоїх даних за весь час спостережень. Перемикач
              періоду нижче на них не впливає.
            </p>
          </div>
          <div className="space-y-3">
            {insights.map((ins) => (
              <InsightCard key={ins.id} {...ins} />
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center justify-between gap-2">
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
          className="shrink-0"
        />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => setOffset((o) => o - 1)}
            aria-label="Попередній"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Button>
          <span className="text-style-caption text-muted min-w-[90px] text-center">
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
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Button>
        </div>
      </div>

      {/* AI-narrative «Звіт тижня» surfaced inside the Reports tab so
          users who tap «Звіти» looking for the weekly report can find
          the digest there (UX-feedback 2026-05-13). Only shown when
          the period selector is on «Тиждень» — the `WeeklyDigestCard`
          itself is week-shaped and exposes its own history nav, so it
          stays meaningful when the user navigates between weeks via
          the digest's internal selector. In «Місяць» view we don't
          render it because there's no monthly digest yet. */}
      {period === "week" && <WeeklyDigestCard />}

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

      {/* Phase 7 D2 — Premium-gated cross-module PDF export. Sits at the
          end of the reports view so it does not crowd the period picker;
          tap opens the paywall for free users (`useFeatureGate`). */}
      <button
        type="button"
        onClick={handleExportPdf}
        className={cn(
          "w-full h-11 rounded-2xl border border-line bg-panelHi",
          "text-style-label text-text hover:bg-panel transition-colors",
          "flex items-center justify-center gap-2",
        )}
      >
        <Icon name="download" size={16} aria-hidden />
        Експортувати PDF
      </button>

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
