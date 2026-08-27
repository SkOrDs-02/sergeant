/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useEffect, useMemo, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import {
  DataState,
  type DataStateQueryLike,
} from "@shared/components/ui/DataState";
import { Skeleton, SkeletonText } from "@shared/components/ui/Skeleton";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { Badge } from "@shared/components/ui/Badge";
import { messages } from "@shared/i18n/uk";
import { STORAGE_KEYS } from "@sergeant/shared";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import {
  useWeeklyDigest,
  useDigestHistory,
  getWeekKey,
  aggregateNutrition,
} from "./useWeeklyDigest";
import { WeeklyDigestStories } from "./WeeklyDigestStories";
import {
  adviceIdForScope,
  markAdviceShown,
  trackAdviceReaction,
  type AdviceSurface,
} from "../observability/adviceTelemetry";

// `hasLiveWeeklyDigest` now lives in `@sergeant/shared` (DOM-free, reused by
// mobile). The web-side adapter in `@shared/lib/weeklyDigestStorage` binds
// the shared helper to `localStorage`. We re-export it from here so that
// existing call-sites (`HubDashboard`, tests) keep their historical import
// path without touching either module.
export { hasLiveWeeklyDigest } from "@shared/lib/storage/weeklyDigestStorage";

// Блок одного модуля винесено у `WeeklyDigestModuleBlock.tsx`: картка
// підійшла впритул до `max-lines: 600` (Hard Rule #18). Типи ре-експортуємо,
// щоб історичні шляхи імпорту не змінювались.
export {
  ModuleBlock,
  coverageBadge,
  type ModuleKey,
  type DigestModuleData,
  type DigestPayload,
} from "./WeeklyDigestModuleBlock";
import {
  ModuleBlock,
  coverageBadge,
  type DigestPayload,
} from "./WeeklyDigestModuleBlock";

// Shape-aware loader: matches the real digest layout — 4 module rows
// (icon + 2 lines of summary text). When the digest lands, only the
// content swaps in; the rough shape is already on screen.
function LoadingSpinner() {
  return (
    <div
      className="px-4 pb-4 space-y-2.5"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Генерую звіт тижня"
    >
      <span className="sr-only">Генерую звіт тижня…</span>
      {Array(4)
        .fill(0)
        .map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 p-3 rounded-2xl border border-line bg-panel",
              i === 0
                ? "opacity-100"
                : i === 1
                  ? "opacity-85"
                  : i === 2
                    ? "opacity-65"
                    : "opacity-45",
            )}
          >
            <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
              <SkeletonText className="w-1/3 h-3" />
              <SkeletonText className="w-2/3 h-2.5" />
            </div>
          </div>
        ))}
    </div>
  );
}

/** Чи має дайджест хоч один модульний блок (та сама умова, що `isEmpty`). */
function hasDigestBody(d: DigestPayload | null | undefined): boolean {
  return !!(d && (d.finyk || d.fizruk || d.nutrition || d.routine));
}

/**
 * Довжина AI-тексту дайджесту. У payload події їде ЛИШЕ це число — сам текст
 * не існує на рівні події (Hard Rule #21; `scrubPII` чистить за іменами
 * ключів і поле з текстом не вирізав би).
 */
function digestChars(d: DigestPayload | null | undefined): number {
  if (!d) return 0;
  let total = 0;
  for (const key of ["finyk", "fizruk", "nutrition", "routine"] as const) {
    const block = d[key];
    if (!block) continue;
    total += (block.summary ?? "").length + (block.comment ?? "").length;
    for (const rec of block.recommendations ?? []) total += rec.length;
  }
  for (const rec of d.overallRecommendations ?? []) total += rec.length;
  return total;
}

interface DigestContentProps {
  digest: DigestPayload | null | undefined;
  loading: boolean;
  error: string | null | undefined;
  /**
   * Поріг публікації (hub-coach §6.2 / Хвиля 4 § G2) відмовив ЧЕСНО: даних
   * за тиждень замало для звіту. Це НЕ помилка (мережа/5xx/парсинг) і НЕ
   * звичайний порожній стан — окрема гілка, щоб не показати ані
   * error-банер, ані порожню картку без пояснення.
   */
  insufficientData: boolean;
  isCurrentWeek: boolean;
  onGenerate: () => void;
  onUpdate: () => void;
  onPlayStories: () => void;
  /** `advice_id` цього дайджесту; `null` доки тіла звіту немає. */
  adviceId: string | null;
  /** Поверхня показу — property `surface` події `ai_advice_shown`. */
  surface: AdviceSurface;
  /** Чи розгорнута зовнішня `CollapsibleSection` (див. `AssistantAdviceCard`). */
  sectionOpen: boolean;
  /** Скільки днів тижня залоговано в харчуванні — знаменник coverage. */
  nutritionCoverage?: { logged: number; total: number } | null;
  /** Юзер розгорнув тіло звіту — знімає бейдж «новий звіт». */
  onOpened?: (() => void) | undefined;
}

function DigestContent({
  digest,
  loading,
  error,
  insufficientData,
  isCurrentWeek,
  onGenerate,
  onUpdate,
  onPlayStories,
  adviceId,
  surface,
  sectionOpen,
  nutritionCoverage,
  onOpened,
}: DigestContentProps) {
  const [expanded, setExpanded] = useState(false);

  // Impression дайджесту. Тіло звіту живе ВСЕРЕДИНІ `expanded`-регіону
  // (`grid-rows-[0fr]` доки згорнуто), тож «картка змонтована» ≠ «пораду
  // прочитали». Плюс зовнішній collapse секції — той самий подвійний
  // collapse, що й у `AssistantAdviceCard`.
  useEffect(() => {
    if (!adviceId || !sectionOpen || !expanded || loading) return;
    if (!hasDigestBody(digest)) return;
    markAdviceShown({
      adviceId,
      source: "weekly_digest",
      surface,
      chars: digestChars(digest),
    });
  }, [adviceId, sectionOpen, expanded, loading, digest, surface]);

  // Розгортання/згортання тіла звіту — наявні афорданси «Переглянути звіт» /
  // «Згорнути». Нових кнопок не додаємо.
  const setExpandedTracked = (next: boolean) => {
    setExpanded(next);
    if (next) onOpened?.();
    trackAdviceReaction(adviceId, next ? "expand" : "collapse");
  };

  const handleRegenerate = (fn: () => void) => () => {
    trackAdviceReaction(adviceId, "refresh");
    fn();
  };

  // Поріг публікації відмовив (§6.2) — окрема гілка ПЕРЕД `DataState`:
  // ні error-банер (це не збій), ні generic порожній стан (не пояснював би
  // ЧОМУ звіту немає). Рендериться лише коли нема тіла звіту — стейл-кеш
  // минулого разу лишається видимим, якщо він є (`hasDigestBody(digest)`).
  if (!loading && insufficientData && !hasDigestBody(digest)) {
    return (
      <div className="px-4 pb-4">
        <p className="text-style-body text-muted mb-3 leading-relaxed">
          Замало даних за цей тиждень, AI-звіт вийшов би занадто загальним.
          Запиши хоча б одну транзакцію, тренування, прийом їжі чи звичку і
          спробуй ще раз.
        </p>
        {isCurrentWeek && (
          <button
            type="button"
            onClick={handleRegenerate(onGenerate)}
            className="w-full h-9 min-h-[44px] rounded-xl border border-line text-style-label text-muted hover:text-text hover:bg-panelHi transition-colors"
          >
            Спробувати знову
          </button>
        )}
      </div>
    );
  }

  // DataState contract: `data === undefined` → render skeleton slot,
  // otherwise content/empty/error are evaluated. We force `data` to
  // `undefined` while `loading` is true so a stale/cached digest is
  // hidden during regeneration (matches the prior `if (loading)`
  // short-circuit). When `loading` is false but an error is present
  // we surface `data: null` + `isError: true` so DataState's "error
  // wins" branch picks the error slot.
  const digestQuery: DataStateQueryLike<DigestPayload | null> = {
    data: loading ? undefined : (digest ?? null),
    isLoading: loading,
    isError: !!error && !loading,
    error: error ? new Error(error) : null,
  };

  const errorSlot = (
    <div className="px-4 pb-3">
      <p className="text-style-caption text-danger-strong dark:text-danger bg-danger/10 rounded-xl px-3 py-2 mb-2">
        {error}
      </p>
      {isCurrentWeek && (
        <button
          type="button"
          onClick={handleRegenerate(onGenerate)}
          className="w-full h-9 min-h-[44px] rounded-xl border border-line text-style-label text-muted hover:text-text hover:bg-panelHi transition-colors"
        >
          Спробувати знову
        </button>
      )}
    </div>
  );

  const emptySlot = (
    <div className="px-4 pb-4">
      {isCurrentWeek ? (
        <>
          <p className="text-style-body text-muted mb-3 leading-relaxed">
            AI-звіт підсумовує прогрес по всіх модулях і дає конкретні
            рекомендації на наступний тиждень.
          </p>
          <button
            type="button"
            onClick={onGenerate}
            className="w-full h-10 min-h-[44px] rounded-xl bg-primary text-bg text-style-label hover:brightness-110 transition-[filter,opacity,transform] active:scale-[0.98]"
          >
            Згенерувати звіт
          </button>
        </>
      ) : (
        <p className="text-style-body text-muted text-center py-2">
          Звіт за цей тиждень не збережено
        </p>
      )}
    </div>
  );

  return (
    <DataState
      query={digestQuery}
      skeleton={<LoadingSpinner />}
      error={() => errorSlot}
      empty={emptySlot}
      isEmpty={(d) => !d || !(d.finyk || d.fizruk || d.nutrition || d.routine)}
    >
      {(d) => (
        <>
          <div className="px-4 pb-3 pt-1">
            <button
              type="button"
              onClick={onPlayStories}
              className={cn(
                "w-full h-11 rounded-xl text-style-label font-bold text-white",
                "bg-linear-to-r from-brand-500 via-brand-400 to-teal-400",
                "dark:from-brand-600 dark:via-brand-500 dark:to-teal-500",
                "shadow-card hover:brightness-110 active:scale-[0.98] transition-[box-shadow,filter,opacity,transform]",
                "flex items-center justify-center gap-2",
                "focus-ring",
              )}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              Переглянути як сторіс
            </button>
          </div>
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-base ease-standard",
              expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <div className="border-t border-line px-4 pt-3 pb-4 space-y-2">
                {(["finyk", "fizruk", "nutrition", "routine"] as const).map(
                  (key) =>
                    d?.[key] ? (
                      <ModuleBlock
                        key={key}
                        moduleKey={key}
                        data={d[key]}
                        badge={
                          key === "nutrition"
                            ? coverageBadge(nutritionCoverage, isCurrentWeek)
                            : undefined
                        }
                      />
                    ) : null,
                )}
                {d &&
                  Array.isArray(d.overallRecommendations) &&
                  d.overallRecommendations.length > 0 && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 space-y-1.5">
                      <p className="text-style-caption font-semibold text-primary">
                        Загальні рекомендації
                      </p>
                      {d.overallRecommendations.map(
                        (rec: string, i: number) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <Icon
                              name="sparkle"
                              size={12}
                              className="text-primary mt-1 shrink-0"
                              aria-hidden
                            />
                            <span className="text-style-body text-text leading-snug">
                              {rec}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                {isCurrentWeek && (
                  <button
                    type="button"
                    onClick={handleRegenerate(onUpdate)}
                    className="w-full h-9 min-h-[44px] rounded-xl border border-line text-style-label text-muted hover:text-text hover:bg-panelHi transition-colors"
                  >
                    Оновити звіт
                  </button>
                )}
              </div>
            </div>
          </div>

          {!expanded && (
            <div className="px-4 pb-3">
              <button
                type="button"
                onClick={() => setExpandedTracked(true)}
                className="w-full h-9 min-h-[44px] rounded-xl border border-line text-style-label text-muted hover:text-text hover:bg-panelHi transition-colors"
              >
                Переглянути звіт
              </button>
            </div>
          )}
          {expanded && (
            <div className="px-4 pb-3 border-t border-line pt-2">
              <button
                type="button"
                onClick={() => setExpandedTracked(false)}
                className="w-full h-9 min-h-[44px] rounded-xl border border-line text-style-label text-muted hover:text-text hover:bg-panelHi transition-colors"
              >
                Згорнути
              </button>
            </div>
          )}
        </>
      )}
    </DataState>
  );
}

interface WeeklyDigestCardProps {
  /**
   * Optional callback that collapses the card back to its single-line
   * default state (the `WeeklyDigestFooter` rendered by HubDashboard).
   * When provided, a chevron-up button is shown in the header so the
   * user can dismiss the expanded card the same way they opened it.
   */
  onCollapse?: () => void;
  /**
   * Поверхня показу — property `surface` події `ai_advice_shown`. Дефолт
   * відповідає standalone-використанню у «Звітах»; хаб-дашборд передає
   * `"hub_dashboard"` явно.
   */
  surface?: AdviceSurface;
  /**
   * Чи розгорнута зовнішня `CollapsibleSection`. Дефолт `true` — у «Звітах»
   * картка не загорнута в секцію.
   */
  sectionOpen?: boolean;
}

export function WeeklyDigestCard({
  onCollapse,
  surface = "hub_reports",
  sectionOpen = true,
}: WeeklyDigestCardProps = {}) {
  const currentWeekKey = getWeekKey();
  const [selectedWeekKey, setSelectedWeekKey] = useState(currentWeekKey);
  const [showHistory, setShowHistory] = useState(false);
  const [storiesOpen, setStoriesOpen] = useState(false);

  const {
    digest,
    loading,
    error,
    insufficientData,
    weekRange,
    generate,
    isCurrentWeek,
  } = useWeeklyDigest(selectedWeekKey);
  const { data: history = [] } = useDigestHistory();

  // Автогенерація по понеділках працює у фоні: звіт зʼявлявся мовчки, і
  // користувач дізнавався про нього, лише якщо сам відкривав блок. Бейдж
  // тримається, поки він не розгорнув саме цей тиждень.
  const [lastSeenWeekKey, setLastSeenWeekKey] = useState<string>(
    () => safeReadStringLS(STORAGE_KEYS.WEEKLY_DIGEST_LAST_SEEN) ?? "",
  );
  const hasUnreadDigest =
    !loading && !!digest && lastSeenWeekKey !== selectedWeekKey;

  const markDigestSeen = () => {
    if (lastSeenWeekKey === selectedWeekKey) return;
    setLastSeenWeekKey(selectedWeekKey);
    safeWriteLS(STORAGE_KEYS.WEEKLY_DIGEST_LAST_SEEN, selectedWeekKey);
  };

  const handleGenerate = () => generate();

  // Дайджест — теж AI-порада, тож іде тією самою парою подій із
  // `source: "weekly_digest"`; окремої метрики не заводимо.
  //
  // Scope ідентифікує саму пораду (тиждень + момент генерації), а НЕ її текст:
  // id мусить лишатись випадковим uuid, інакше подія стає прихованою
  // сигнатурою змісту. Id стабільний у межах завантаження сторінки — цього
  // достатньо для пари «показ → реакція»; для підрахунку УНІКАЛЬНИХ порад він
  // непридатний (це роль серверного id, стадія 3).
  const adviceId = digest?.generatedAt
    ? adviceIdForScope(`weekly_digest:${selectedWeekKey}:${digest.generatedAt}`)
    : null;

  // Coverage рахується з локального логу, а не з тіла звіту: `digest` —
  // це AI-текст, і саме тому число має приїхати повз нього. Агрегат
  // повертає `null`, коли не залоговано жодного дня, — тоді й самого
  // nutrition-блоку в звіті немає, тож бейджу нема на чому висіти.
  const nutritionCoverage = useMemo(() => {
    const agg = aggregateNutrition(selectedWeekKey);
    return agg ? { logged: agg.daysLogged, total: agg.daysInPeriod } : null;
  }, [selectedWeekKey]);

  const isPast = selectedWeekKey !== currentWeekKey;

  return (
    /*
      Тижневий дайджест — власний матеріал (анти-слоп П3, рішення власника
      2026-08-06). Це самодостатній аркуш поза стосом: він приходить раз
      на тиждень, його читають від початку до кінця й закривають. Тому
      `edge-stub` — лінійка зверху, відрив знизу, — а не картка з
      бібліотеки.

      AI-DANGER: обгортка тут НЕ зайвий вузол. `edge-stub` вирізає
      перфорацію маскою, а маска зрізає будь-яку тінь на СВОЄМУ вузлі —
      і `box-shadow`, і `filter: drop-shadow()` однаково (заміряно; див.
      `.edge-lift` у `tailwind-preset.js`). Підйом працює лише на рівень
      вище, і саме тоді тінь виходить рваною по зубцях. Прибереш
      обгортку — поверхня мовчки втратить глибину.

      `overflow-hidden` пішов свідомо: він стояв лише щоб градієнт шапки
      не виліз за скруглення, а скруглення тут більше немає. Маска ж
      ріже низ сама.

      Чому не проп `Card edge="stub"` (борг 1, інвентар 2026-08-07).

      Обережно з попередньою редакцією цього коментаря: вона стверджувала,
      що `Card` ставить обгортку підйому лише при
      `prominence="interactive"`. Це НЕПРАВДА — `Card` загортає будь-який
      масковий край, prominence лише обирає між `edge-lift` і
      `edge-lift-interactive`.

      Справжня причина простіша: тут своя поверхня. Шапка їде градієнтом
      (`bg-linear-to-r … via-brand-50/30`), а жодна `prominence` такого не
      дає — усі стоять на рівному `bg-panel` плюс власна тінь, яку
      `edge-stub` мусив би скасувати. Переведення означало б або втратити
      градієнт, або боротись із поверхнею `Card` через `className`, і
      програш у цій боротьбі МОВЧАЗНИЙ: картка не ламається, вона просто
      втрачає глибину.

      Тож клас лишається сирим, а борг закритий інакше — сирі краї більше
      не невидимі: `edgeMaterial.test.ts` тримає explicit allowlist і падає
      на будь-якому новому неврахованому.
    */
    <div className="edge-lift-interactive">
      <div
        className={cn(
          "edge-stub border bg-panel",
          "border-line dark:border-line",
        )}
      >
        <div className="px-4 py-3.5 flex items-center gap-3 bg-linear-to-r from-transparent via-brand-50/30 to-teal-50/20 dark:from-transparent dark:via-brand-900/10 dark:to-teal-900/5">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              "bg-linear-to-br from-brand-100 to-teal-100",
              "dark:from-brand-900/40 dark:to-teal-900/30",
              "shadow-sm",
            )}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-brand-strong dark:text-brand"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-style-title font-bold text-text truncate">
                Звіт тижня
              </span>
              {hasUnreadDigest && (
                <Badge variant="accent" size="xs">
                  {messages.sergeant.weeklyDigestUnread}
                </Badge>
              )}
              {/* Градація впевненості (Хвиля 4, hub-coach § G2): summary/
                comment/recommendations — суцільний вільний текст моделі,
                тож рівень «припущення» проставляється детерміновано на
                рівні картки (не потребує розбору речень). */}
              {!loading && hasDigestBody(digest) && (
                <Badge variant="neutral" size="xs">
                  {messages.sergeant.insightAssumptionBadge}
                </Badge>
              )}
            </div>
            <div className="text-style-caption text-muted mt-0.5">
              {loading ? messages.sergeant.weeklyDigestPreparing : weekRange}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {digest?.generatedAt && (
              <span className="text-style-caption text-subtle">
                {new Date(digest.generatedAt).toLocaleDateString("uk-UA", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
            {history.length > 1 && (
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                title="Попередні тижні"
                className={cn(
                  "w-7 h-7 flex items-center justify-center rounded-xl transition-colors",
                  showHistory
                    ? "bg-primary/15 text-primary"
                    : "text-muted hover:text-text hover:bg-panelHi",
                )}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
            )}
            {onCollapse && (
              <Tooltip content="Згорнути" placement="top-center">
                <button
                  type="button"
                  onClick={() => {
                    trackAdviceReaction(adviceId, "collapse");
                    onCollapse();
                  }}
                  aria-label="Згорнути звіт тижня"
                  className="w-7 h-7 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors"
                >
                  <Icon name="chevron-up" size={15} strokeWidth={2.5} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {showHistory && history.length > 1 && (
          <div className="border-t border-line px-4 py-2">
            <div className="flex flex-wrap gap-1">
              {history.map((h) => (
                <button
                  key={h.weekKey}
                  type="button"
                  onClick={() => {
                    setSelectedWeekKey(h.weekKey);
                    setShowHistory(false);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-style-label font-semibold transition-colors",
                    selectedWeekKey === h.weekKey
                      ? "bg-primary/15 text-primary"
                      : "bg-panelHi text-muted hover:text-text",
                  )}
                >
                  {h.weekRange}
                  {h.weekKey === currentWeekKey && (
                    <span className="ml-1 text-style-caption opacity-70">
                      поточний
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {isPast && (
          <div className="px-4 pb-1">
            <button
              type="button"
              onClick={() => setSelectedWeekKey(currentWeekKey)}
              className="inline-flex items-center gap-1 text-style-label text-primary hover:underline"
            >
              <Icon name="chevron-left" size="sm" />
              Поточний тиждень
            </button>
          </div>
        )}

        <DigestContent
          digest={digest}
          loading={loading}
          error={error}
          insufficientData={insufficientData}
          isCurrentWeek={isCurrentWeek}
          onGenerate={handleGenerate}
          onUpdate={handleGenerate}
          onPlayStories={() => setStoriesOpen(true)}
          adviceId={adviceId}
          surface={surface}
          sectionOpen={sectionOpen}
          nutritionCoverage={nutritionCoverage}
          onOpened={markDigestSeen}
        />

        {storiesOpen && digest && (
          <WeeklyDigestStories
            digest={digest}
            weekKey={selectedWeekKey}
            weekRange={weekRange}
            onClose={() => setStoriesOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
