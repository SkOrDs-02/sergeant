import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Measure } from "@shared/components/ui/Measure";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { openHubModule } from "@shared/lib/modules/hubNav";
import {
  isCrossModulePromptSuppressed,
  recordCrossModulePromptAccepted,
} from "@shared/lib/modules/crossModulePrompt";
import { formatDurShort } from "@sergeant/fizruk-domain";
import {
  BODY_ATLAS_MUSCLE_IDS,
  INJURY_SITE_LABELS_UK,
  INJURY_ZONE_IDS,
  isInjurySiteId,
} from "@sergeant/fizruk-domain/data";
import { pluralUa } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import { useInjuries } from "../../hooks/useInjuries";
import { useDailyLog } from "../../hooks/useDailyLog";
import { planWellbeingHandoff } from "../../lib/wellbeingBridge";
import { WorkoutStatTile } from "./WorkoutStatTile";
// `FinishFlashState` живе у `../../pages/Workouts.types` (там `useState`
// setter, що ходить між обома sheet-ами). Імпортуємо звідти, щоб не дублювати
// оголошення (aislop `ai-slop/duplicate-type-declaration`).
import type { FinishFlashState } from "../../pages/Workouts.types";

// Реекспорт для споживачів цього компонента (тест + orchestrator), що вже
// імпортують `FinishFlashState` звідси.
export type { FinishFlashState };

/**
 * Один чип зони болю у кроці травм.
 *
 * Винесено з тіла аркуша, бо після групування (суглоби / мʼязи) те саме
 * розмітка малюється двічі — і розʼїхатись двом копіям тут коштувало б
 * дорого: чип із іншим `aria-pressed` або іншою тач-ціллю на цій поверхні
 * означає, що людина не позначила те, що думала, що позначила.
 */
function InjuryChip({
  site,
  selected,
  onToggle,
}: {
  site: string;
  selected: boolean;
  onToggle: (site: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "min-h-[44px] rounded-xl border px-3 py-2 text-style-caption transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
        selected
          ? "border-warning-strong bg-warning/15 text-warning-strong dark:text-warning"
          : "border-line bg-bg text-muted hover:border-muted hover:text-text",
      )}
      onClick={() => onToggle(site)}
    >
      {INJURY_SITE_LABELS_UK[site as keyof typeof INJURY_SITE_LABELS_UK]}
    </button>
  );
}

interface WorkoutFinishSheetsProps {
  finishFlash: FinishFlashState | null;
  setFinishFlash: Dispatch<SetStateAction<FinishFlashState | null>>;
  updateWorkout: (
    id: string,
    patch: { wellbeing?: { energy?: number; mood?: number } },
  ) => void;
  onDone?: (() => void) | undefined;
}

export function WorkoutFinishSheets({
  finishFlash,
  setFinishFlash,
  updateWorkout,
  onDone,
}: WorkoutFinishSheetsProps) {
  const { mark } = useInjuries();
  const { entries: dailyLogEntries, addEntry: addDailyLogEntry } =
    useDailyLog();
  const injuryCopy = messages.fizruk.injuries;
  const [savingInjuries, setSavingInjuries] = useState(false);
  const [musclesOpen, setMusclesOpen] = useState(false);
  const trapRef = useRef<HTMLDivElement | null>(null);
  const selectedSites = finishFlash?.injurySites ?? [];
  const selectedMuscleCount = selectedSites.filter((site) =>
    (BODY_ATLAS_MUSCLE_IDS as readonly string[]).includes(site),
  ).length;
  const toggleSite = (site: string) => {
    setFinishFlash((current) =>
      current
        ? {
            ...current,
            injurySites: current.injurySites.includes(site)
              ? current.injurySites.filter((item) => item !== site)
              : [...current.injurySites, site],
          }
        : current,
    );
  };
  const closeFinish = () => {
    setFinishFlash(null);
    onDone?.();
  };
  useDialogFocusTrap(!!finishFlash, trapRef, { onEscape: closeFinish });

  if (!finishFlash) return null;
  return (
    <div
      className="fixed left-0 right-0 z-100 px-4 pointer-events-none fizruk-above-tabbar"
      role="region"
      aria-label="Підсумок тренування"
    >
      <div
        ref={trapRef}
        className="pointer-events-auto max-w-4xl mx-auto fizruk-sheet"
      >
        {finishFlash.step === "wellbeing" && (
          <Card
            prominence="elevated"
            radius="lg"
            // `overscroll-contain`: без нього жест, доведений до межі
            // внутрішнього скролу, перекидався на сторінку ПІД аркушем —
            // журнал їхав, аркуш стояв, і це читалось як «не скролиться».
            // Особливо помітно при спробі повернутись угору з розкритих
            // мʼязів (скарга власника 2026-08-08).
            className="space-y-4 max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fizruk-wellbeing-title"
          >
            <div
              id="fizruk-wellbeing-title"
              className="text-style-label text-text"
            >
              Самопочуття
            </div>
            <p className="text-style-caption text-subtle leading-relaxed">
              Оціни по шкалі 1–5 (можна пропустити).
            </p>
            <div>
              <SectionHeading
                as="div"
                size="xs"
                variant="fizruk"
                className="mb-2"
              >
                Енергія
              </SectionHeading>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={`e${n}`}
                    type="button"
                    className={cn(
                      "min-w-[44px] min-h-[44px] rounded-xl border text-style-label transition-colors",
                      finishFlash.energy === n
                        ? "bg-text text-bg border-text"
                        : "border-line bg-bg text-muted hover:border-muted",
                    )}
                    onClick={() =>
                      setFinishFlash((f) => f && { ...f, energy: n })
                    }
                    aria-pressed={finishFlash.energy === n}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <SectionHeading
                as="div"
                size="xs"
                variant="fizruk"
                className="mb-2"
              >
                Настрій
              </SectionHeading>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={`m${n}`}
                    type="button"
                    className={cn(
                      "min-w-[44px] min-h-[44px] rounded-xl border text-style-label transition-colors",
                      finishFlash.mood === n
                        ? "bg-text text-bg border-text"
                        : "border-line bg-bg text-muted hover:border-muted",
                    )}
                    onClick={() =>
                      setFinishFlash((f) => f && { ...f, mood: n })
                    }
                    aria-pressed={finishFlash.mood === n}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1 h-12 min-h-[44px]"
                type="button"
                onClick={() =>
                  setFinishFlash((f) => f && { ...f, step: "injury" })
                }
              >
                Пропустити
              </Button>
              <Button
                module="fizruk"
                className="flex-1 h-12 min-h-[44px]"
                type="button"
                onClick={() => {
                  const wid = finishFlash.workoutId;
                  if (wid && (finishFlash.energy || finishFlash.mood)) {
                    updateWorkout(wid, {
                      wellbeing: {
                        ...(finishFlash.energy != null
                          ? { energy: finishFlash.energy }
                          : {}),
                        ...(finishFlash.mood != null
                          ? { mood: finishFlash.mood }
                          : {}),
                      },
                    });
                    // Той самий факт — і в денний журнал Body, інакше
                    // після «енергія 4 / настрій 4» тут Body показував
                    // порожню форму за сьогодні (аудит L-10.3). Місток
                    // однобічний: дописує, але ніколи не переписує
                    // оцінку, яку людина вже поставила вручну — правило
                    // й межа доби живуть у `wellbeingBridge.ts`.
                    const handoff = planWellbeingHandoff(
                      { energy: finishFlash.energy, mood: finishFlash.mood },
                      dailyLogEntries,
                      // eslint-disable-next-line no-restricted-syntax -- ADR-0078: денний запис Body — особиста сутність, її доба належить пристрою
                      new Date(),
                    );
                    if (handoff) addDailyLogEntry(handoff);
                  }
                  setFinishFlash(
                    (f) =>
                      f && {
                        ...f,
                        step: "injury",
                        savedWellbeing:
                          f.energy || f.mood
                            ? { energy: f.energy, mood: f.mood }
                            : null,
                      },
                  );
                }}
              >
                Зберегти
              </Button>
            </div>
          </Card>
        )}

        {finishFlash.step === "injury" && (
          <Card
            prominence="elevated"
            radius="lg"
            // `overscroll-contain`: без нього жест, доведений до межі
            // внутрішнього скролу, перекидався на сторінку ПІД аркушем —
            // журнал їхав, аркуш стояв, і це читалось як «не скролиться».
            // Особливо помітно при спробі повернутись угору з розкритих
            // мʼязів (скарга власника 2026-08-08).
            className="space-y-4 max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fizruk-injury-title"
          >
            {/*
              Липка шапка — пара до липкого рядка дій унизу. Розкриті
              мʼязи роблять вміст удвічі вищим за вікно картки, і
              заголовок «Щось болить?» їхав під верхню межу: щоб зрозуміти,
              де ти взагалі перебуваєш, доводилось скролити назад угору
              (скарга власника 2026-08-08). Тепер верх видно завжди, а
              скрол лишається тільки за зонами. Відʼємні поля компенсують
              `p-4` картки, щоб смуга діставала до її країв і під нею не
              просвічували чипи, що проїжджають.
            */}
            <div className="sticky -top-4 -mx-4 -mt-4 px-4 pt-4 pb-3 bg-panel border-b border-line">
              <div
                id="fizruk-injury-title"
                className="text-style-label text-text"
              >
                {injuryCopy.finishTitle}
              </div>
              <p className="text-style-caption text-subtle mt-1">
                {injuryCopy.finishDescription}
              </p>
            </div>
            {/*
              Суглоби й хребет — ПЕРШИМИ й без розкриття, мʼязи — за ним.
              Той самий порядок, що в `InjurySection.tsx`, і з тієї самої
              причини (див. AI-CONTEXT у його шапці): типові травми на
              силовій — суглобові, а мʼязова модель — рівно провал аудиту
              E-4 (ADR-0083). До 2026-08-08 цей аркуш робив навпаки —
              рендерив усі 27 зон однією плоскою стрічкою з 18 мʼязами
              попереду, тож при `max-h 520px` під згином лишались усі
              девʼять суглобів і обидві кнопки дій: людині з болем у коліні
              екран першими показував «Квадрицепс» і «Сідниці».
            */}
            <div>
              <p className="text-style-overline text-muted mb-2">
                {injuryCopy.groupZones}
              </p>
              <div className="flex flex-wrap gap-2">
                {INJURY_ZONE_IDS.map((site) => (
                  <InjuryChip
                    key={site}
                    site={site}
                    selected={finishFlash.injurySites.includes(site)}
                    onToggle={toggleSite}
                  />
                ))}
              </div>
            </div>

            <div>
              <button
                type="button"
                aria-expanded={musclesOpen}
                onClick={() => setMusclesOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-2 min-h-[44px] rounded-xl border border-line bg-panelHi px-3 py-2 text-style-label text-text transition-colors hover:border-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
              >
                <span className="inline-flex items-center gap-2">
                  {injuryCopy.groupMuscles}
                  {selectedMuscleCount > 0 && (
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-style-caption text-warning-strong dark:text-warning">
                      {selectedMuscleCount}
                    </span>
                  )}
                </span>
                <span className="text-style-caption text-subtle">
                  {BODY_ATLAS_MUSCLE_IDS.length}{" "}
                  {pluralUa(BODY_ATLAS_MUSCLE_IDS.length, {
                    one: "зона",
                    few: "зони",
                    many: "зон",
                  })}
                  <span aria-hidden>{musclesOpen ? " ⌃" : " ⌄"}</span>
                </span>
              </button>
              {musclesOpen && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {BODY_ATLAS_MUSCLE_IDS.map((site) => (
                    <InjuryChip
                      key={site}
                      site={site}
                      selected={finishFlash.injurySites.includes(site)}
                      onToggle={toggleSite}
                    />
                  ))}
                </div>
              )}
            </div>
            {/*
              Липкий низ, а не звичайний рядок у потоці: розкриті мʼязи
              роблять картку вищою за її `max-h`, і на 390px обидві кнопки
              йшли під згин — тобто рівно та проблема, заради якої групи й
              зʼявились, поверталась одним тапом по розкриттю. Відʼємні
              поля компенсують `p-4` самої картки, щоб смуга діставала до
              її країв і не лишала прозорих кутів над контентом, що скролиться.
            */}
            <div className="sticky -bottom-4 -mx-4 -mb-4 px-4 pt-3 pb-4 bg-panel border-t border-line flex gap-2">
              <Button
                variant="secondary"
                className="flex-1 h-12"
                disabled={savingInjuries}
                onClick={() =>
                  setFinishFlash(
                    (current) => current && { ...current, step: "summary" },
                  )
                }
              >
                {injuryCopy.skip}
              </Button>
              <Button
                module="fizruk"
                className="flex-1 h-12"
                disabled={
                  savingInjuries || finishFlash.injurySites.length === 0
                }
                onClick={() => {
                  setSavingInjuries(true);
                  try {
                    for (const site of finishFlash.injurySites) {
                      if (isInjurySiteId(site)) mark(site);
                    }
                    setFinishFlash(
                      (current) => current && { ...current, step: "summary" },
                    );
                  } finally {
                    setSavingInjuries(false);
                  }
                }}
              >
                {/*
                  Лічильник у самій кнопці: обрані чипи можуть лежати у
                  згорнутій групі мʼязів, тож «скільки я позначив» більше
                  не треба рахувати очима по підсвічених чипах.
                */}
                {injuryCopy.saveCta}
                {finishFlash.injurySites.length > 0
                  ? ` (${finishFlash.injurySites.length})`
                  : ""}
              </Button>
            </div>
          </Card>
        )}

        {finishFlash.step === "summary" && finishFlash.collapsed && (
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3 min-h-[44px] shadow-float text-left"
            onClick={() =>
              setFinishFlash((f) => f && { ...f, collapsed: false })
            }
          >
            <span className="text-style-label text-text inline-flex items-center gap-1.5">
              <Icon name="check" size={15} aria-hidden /> Результати
            </span>
            <span className="text-style-caption text-subtle tabular-nums">
              {formatDurShort(finishFlash.durationSec)}
            </span>
          </button>
        )}

        {finishFlash.step === "summary" && !finishFlash.collapsed && (
          <div className="rounded-2xl overflow-hidden border border-line shadow-float">
            <div className="fizruk-summary-header">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <SectionHeading size="xs" variant="fizruk" as="div">
                    Завершено
                  </SectionHeading>
                  <div className="text-style-title text-fizruk-soft-fg mt-1 leading-tight">
                    Тренування виконано
                  </div>
                </div>
                <button
                  type="button"
                  // `text-lg` прибрано: єдиний вміст кнопки — `<Icon size={16}>`,
                  // тобто SVG із власним розміром, на який шкала шрифта не
                  // впливає. Клас нічого не робив, лише тягнув за собою
                  // попередження про сиру шкалу.
                  className="w-9 h-9 pointer-coarse:min-w-[44px] pointer-coarse:min-h-[44px] flex items-center justify-center rounded-full bg-fizruk-tile/10 text-fizruk-soft-fg hover:opacity-70"
                  aria-label="Закрити"
                  onClick={closeFinish}
                >
                  <Icon name="close" size={16} aria-hidden />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <WorkoutStatTile
                  label="Час"
                  value={formatDurShort(finishFlash.durationSec)}
                />
                <WorkoutStatTile
                  label="Вправ"
                  value={finishFlash.items}
                  size="lg"
                />
                <WorkoutStatTile
                  label="Обʼєм"
                  value={
                    finishFlash.tonnageKg > 0 ? (
                      <Measure
                        value={Math.round(finishFlash.tonnageKg)}
                        unit="кг"
                      />
                    ) : (
                      "—"
                    )
                  }
                />
              </div>
            </div>
            {finishFlash.savedWellbeing &&
              (finishFlash.savedWellbeing.energy ||
                finishFlash.savedWellbeing.mood) && (
                <div className="px-4 py-2.5 bg-panel border-b border-line flex items-center gap-3 text-style-caption text-subtle">
                  <span>Самопочуття:</span>
                  <span className="font-semibold text-text">
                    енергія {finishFlash.savedWellbeing.energy ?? "—"}/5
                    {" · "}
                    настрій {finishFlash.savedWellbeing.mood ?? "—"}/5
                  </span>
                </div>
              )}
            <div className="flex flex-col gap-2 p-3 bg-panel">
              {/* Cross-module nudge → Nutrition. Inline (not a toast)
                  because the finish-sheet itself is the natural moment
                  to suggest. Snoozed for 12 h after acceptance so a
                  user who logged a post-workout meal once today doesn't
                  see this on a second workout the same evening. See
                  docs/design/cross-module-prompts.md. */}
              {!isCrossModulePromptSuppressed("fizruk-finish-to-meal") && (
                <button
                  type="button"
                  // AI-NOTE: `text-xs` лишається сирим — це розмір
                  // КОНТРОЛА: висота кнопки задана парою `text-xs` +
                  // `py-1.5`, і роль із `line-height: 1.4` зсунула б її
                  // відносно сусідніх дій. Одна з двох причин лишати
                  // сирий розмір (див. `tailwind-preset.js`, § ролі).

                  className="w-full text-xs text-muted hover:text-text transition-colors py-1.5 flex items-center justify-center gap-1.5"
                  onClick={() => {
                    recordCrossModulePromptAccepted("fizruk-finish-to-meal");
                    setFinishFlash(null);
                    openHubModule("nutrition", "log");
                  }}
                >
                  <Icon name="egg" size={15} aria-hidden />
                  <span>Додати білок після тренування</span>
                  <span aria-hidden>→</span>
                </button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1 h-12 min-h-[44px] rounded-full"
                  type="button"
                  onClick={() =>
                    setFinishFlash((f) => f && { ...f, collapsed: true })
                  }
                >
                  Згорнути
                </Button>
                <button
                  type="button"

                  className="fizruk-cta-accent flex-1 py-3 rounded-full text-base"
                  onClick={closeFinish}
                >
                  Готово
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
