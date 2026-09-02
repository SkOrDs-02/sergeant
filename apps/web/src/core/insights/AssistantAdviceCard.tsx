import { useEffect, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { SkeletonText } from "@shared/components/ui/Skeleton";
import { Badge } from "@shared/components/ui/Badge";
import { messages } from "@shared/i18n/uk";
import { useAiTier } from "@shared/api/useAiTier";
import { usePlan } from "../billing/usePlan";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import {
  safeReadStringLS,
  safeWriteLS,
  safeRemoveLS,
} from "@shared/lib/storage/storage";
import {
  markAdviceShown,
  trackAdviceReaction,
} from "../observability/adviceTelemetry";
import { AdviceFeedback } from "./AdviceFeedback";

// Pro tiered model degradation (premium → standard → floor). `premium` is
// the expected default and stays invisible — only degraded tiers get a
// badge, so most Pro users never see this.
//
// AI-CONTEXT (2026-08-06): бейдж має сенс ЛИШЕ для платника — він означає
// «твоя premium-квота на сьогодні вичерпана», тобто називає подію, яку людина
// пережила. Відколи Free перевели на standard-модель чату, у неплатника він
// горів би постійно й не вказував ні на що: premium він не мав і втратити не
// міг. Тому нижче бейдж гейтиться `isPro`, а не самим тиром.
const DEGRADED_TIER_LABEL: Record<"standard" | "floor", string> = {
  standard: "Стандартна модель",
  floor: "Економний режим",
};

interface AssistantAdviceCardProps {
  insight: string | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  /**
   * Ідентичність поради для телеметрії (`advice_id`). Приходить із
   * `useCoachInsight`. Без нього подій не буде — краще мовчання, ніж
   * події-сироти, які не звести в петлю «побачив → зреагував».
   */
  adviceId?: string | null;
  /**
   * Чи розгорнута ЗОВНІШНЯ `CollapsibleSection`, всередині якої живе картка.
   *
   * КРИТИЧНО для знаменника: `CollapsibleSection` тримає дітей у DOM навіть
   * згорнутою (`grid-rows-[0fr] overflow-hidden`), тож без цього прапорця
   * impression стріляв би на mount — а картка сидить у ПОДВІЙНОМУ collapse.
   * Знаменник роздувся б у рази і «цінність AI» вийшла б штучно низькою
   * назавжди: переписати історію подій не можна.
   *
   * Дефолт `true` — для call-site-ів поза `CollapsibleSection`.
   */
  sectionOpen?: boolean;
}

const COLLAPSED_KEY = "hub_assistant_advice_collapsed";

function readCollapsed(): boolean {
  return safeReadStringLS(COLLAPSED_KEY) === "1";
}

function writeCollapsed(v: boolean): void {
  if (v) safeWriteLS(COLLAPSED_KEY, "1");
  else safeRemoveLS(COLLAPSED_KEY);
}

export function AssistantAdviceCard({
  insight,
  loading,
  error,
  onRefresh,
  adviceId = null,
  sectionOpen = true,
}: AssistantAdviceCardProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const aiTier = useAiTier();
  const { isPro } = usePlan();
  const degradedLabel =
    isPro && (aiTier === "standard" || aiTier === "floor")
      ? DEGRADED_TIER_LABEL[aiTier]
      : null;

  // Impression. Стоїть ПЕРЕД ранніми `return null` (Rules of Hooks), тому
  // всі умови видимості перевіряються всередині ефекту:
  //   1) зовнішня `CollapsibleSection` розгорнута (`sectionOpen`);
  //   2) сама картка не згорнута (`hub_assistant_advice_collapsed`);
  //   3) текст поради реально відрендерений (не скелетон і не порожньо).
  // Дедуплікацію «рівно один раз на (advice_id, завантаження сторінки)"
  // тримає `markAdviceShown`.
  useEffect(() => {
    if (!adviceId || !sectionOpen || collapsed) return;
    if (typeof insight !== "string" || insight.length === 0) return;
    markAdviceShown({
      adviceId,
      source: "coach_insight",
      surface: "hub_dashboard",
      // Лише довжина. Сам текст — вільна українська оповідь про фінанси/тіло/
      // харчування конкретної людини; у payload він не існує (Hard Rule #21).
      chars: insight.length,
    });
  }, [adviceId, sectionOpen, collapsed, insight]);

  // Побічні ефекти винесені з updater-а `setCollapsed`: під StrictMode
  // updater викликається двічі, і подія полетіла б удвічі частіше за клік.
  const toggle = () => {
    const next = !collapsed;
    writeCollapsed(next);
    setCollapsed(next);
    // Реакція на НАЯВНОМУ афордансі — нових кнопок картка не отримує.
    // На «expand» impression ще не стріляв (ефект відпрацює наступним
    // рендером), тому `seconds_since_shown` там буде 0 за конструкцією.
    trackAdviceReaction(adviceId, next ? "collapse" : "expand");
  };

  // Hide the card entirely when there's an error and no cached insight
  if (error && !insight && !loading) return null;

  const hasContent = !!(insight || loading);
  if (!hasContent) return null;

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden",
        "transition-all duration-base",
        "p-px bg-linear-to-br from-brand-300/40 via-line to-teal-300/40",
      )}
    >
      <div className="rounded-2xl bg-surface-glass backdrop-blur-md overflow-hidden">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center justify-between w-full px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full bg-brand-soft flex items-center justify-center text-xs" /* glyph scales with container, not a type role */
              aria-hidden
            >
              S
            </span>
            <SectionHeading as="span" size="xs" variant="muted">
              {messages.sergeant.adviceCardTitle}
            </SectionHeading>
            {/* Градація впевненості (Хвиля 4, hub-coach § G2): порада дня —
                суцільний вільний текст моделі, тож рівень «припущення»
                проставляється детерміновано на рівні картки, а не promt-ом.
                Показуємо лише коли текст реально є (не на скелетоні). */}
            {insight && (
              <Badge variant="neutral" size="xs">
                {messages.sergeant.insightAssumptionBadge}
              </Badge>
            )}
            {degradedLabel && (
              <Badge variant="neutral" size="xs">
                {degradedLabel}
              </Badge>
            )}
          </div>
          <Icon
            name={collapsed ? "chevron-down" : "chevron-up"}
            size={14}
            className="text-muted"
          />
        </button>

        {!collapsed && (
          <div className="px-4 pb-3.5 -mt-0.5">
            {loading && !insight ? (
              // Skeleton stand-in matches three lines of body copy at
              // the real text size — keeps the card height stable so
              // the swap to real content does not nudge the dashboard
              // grid below (CLS budget). Pulse here is the only
              // AMBIENT animation on screen during initial load; the
              // refresh-button spin is hidden until an insight is
              // cached so we stay within Hard Rule #17 (≤1 AMBIENT).
              <div
                role="status"
                aria-live="polite"
                aria-label={messages.sergeant.adviceLoadingAria}
                className="space-y-2 py-0.5"
              >
                <span className="sr-only">Готую пораду…</span>
                <SkeletonText className="h-3.5 w-full" />
                <SkeletonText className="h-3.5 w-11/12" />
                <SkeletonText className="h-3.5 w-4/5" />
              </div>
            ) : null}

            {insight && (
              <p
                key={insight}
                className="text-style-body text-text leading-relaxed motion-safe:animate-fade-in motion-safe:duration-base"
              >
                {insight}
              </p>
            )}

            {!(loading && !insight) && (
              <div className="mt-2.5 flex items-center gap-2">
                {/* Actionable insight (UX-пропозиція 2026-07): порада була
                    суто текстовою — тепер із неї можна одразу перейти в
                    дію. «Запитати AI про це» відкриває асистента із
                    засіяним контекстом поради (autoSend: false, щоб юзер
                    міг відредагувати питання перед відправкою). */}
                {insight && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Подія — ДО консюмерського шляху: `trackAdviceReaction`
                      // fire-and-forget і не кидає, зате throw у шині не зʼїсть
                      // реакцію.
                      //
                      // AI-NOTE: наявна поведінка, НЕ вводиться цим патчем —
                      // prompt нижче вставляє ПОВНИЙ текст поради у чат. Це
                      // існуючий продуктовий шлях (чат і так бачить контекст
                      // користувача), і він НЕ є телеметрією — у payload події
                      // тексту немає, лише `chars`.
                      trackAdviceReaction(adviceId, "ask_ai");
                      emitHubBus("openChat", {
                        message: `Розкажи детальніше про цю пораду й що мені зробити далі: "${insight}"`,
                        autoSend: false,
                      });
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl touch-target",
                      "bg-brand-soft text-brand-soft-fg text-style-caption font-semibold",
                      "hover:brightness-105 active:scale-[0.98] transition-[filter,transform]",
                    )}
                  >
                    <Icon
                      name="sergeant"
                      size={13}
                      strokeWidth={2}
                      aria-hidden
                    />
                    Запитати AI про це
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    trackAdviceReaction(adviceId, "refresh");
                    onRefresh();
                  }}
                  disabled={loading}
                  aria-label="Оновити пораду"
                  className={cn(
                    "p-1.5 rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors",
                    loading &&
                      "opacity-40 cursor-not-allowed motion-safe:animate-spin",
                  )}
                >
                  <Icon name="refresh-cw" size={14} />
                </button>
                {/* Оцінка — праворуч, окремо від дій над порадою: «зроби
                    щось із цим» і «чи це взагалі було варте показу» — різні
                    наміри, і склеєні в один ряд вони читались би як меню. */}
                {insight && (
                  <AdviceFeedback adviceId={adviceId} className="ml-auto" />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
