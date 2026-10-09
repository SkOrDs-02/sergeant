/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import {
  Popover,
  PopoverDivider,
  PopoverItem,
} from "@shared/components/ui/Popover";
import { ChatUsageCounter } from "./ChatUsageCounter";

export interface HubChatHeaderProps {
  detailsOpen: boolean;
  onDetailsOpenChange: (open: boolean) => void;
  contextState: { status: string; ts: number };
  sessionInfo: { historyCount: number; chars: number };
  sessionsCount: number;
  onOpenHistory: () => void;
  onClearChat: () => void;
  onClose: () => void;
}

/**
 * Single-row, ChatGPT-style chat header: avatar + "Асистент ▾"
 * trigger (popover with status, "Усі бесіди", privacy line) |
 * "+ Нова" pill | ✕. All secondary affordances (info, history
 * list, module subtitle) collapse into the "Деталі" popover behind
 * the title.
 *
 * Попередження «Mono не підключено» тут більше немає (звіт власника
 * 2026-09-03). Воно читало не факт підключення, а наявність старого
 * localStorage-кешу транзакцій (`useFinykHubPreview.hasMonoData`), тож
 * брехало підключеному Mono після переїзду даних у SQLite. І навіть
 * правдиве воно не давало дії: асистент і так відповідає з тим
 * контекстом, який є, а підключати Mono ведуть налаштування Фініка.
 */
export function HubChatHeader({
  detailsOpen,
  onDetailsOpenChange,
  contextState,
  sessionInfo,
  sessionsCount,
  onOpenHistory,
  onClearChat,
  onClose,
}: HubChatHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-3 shrink-0 border-b border-line">
      <Popover
        placement="bottom-start"
        open={detailsOpen}
        onOpenChange={onDetailsOpenChange}
        // Без `min-w-0`: у flex-рядку це повертає елементу `min-width: auto`
        // (= min-content), тож заголовок диктує свою мінімальну ширину, а
        // дефіцит іде правому кластеру. Саме `min-w-0` і дозволяв шапці
        // тиснути «Асистент» до «Ас…».
        wrapperClassName="flex-1"
        className="min-w-[280px]! p-1.5"
        trigger={
          <span
            aria-label="Деталі Сержанта"
            className="flex min-h-11 w-full min-w-0 cursor-pointer select-none items-center gap-2.5 rounded-lg"
          >
            {/* Мова H (H-chat): назва без аватара-бейджа й точки статусу;
                статус контексту живе в поповері нижче. */}
            {/* Назва не стискається. На 393px шапка пакувала лічильник,
                «Нова» і «×» проти заголовка, і той обрізався до «Ас…»
                (scrollWidth 85 vs clientWidth 43 — browser QA 2026-08-23).
                Дефіцит тепер віддається праворуч, де є що вкоротити. */}
            <span className="flex items-center gap-1 shrink-0">
              <span
                id="hub-chat-title"
                className="text-style-title font-bold text-text leading-snug whitespace-nowrap"
              >
                Сержант
              </span>
              <Icon
                name="chevron-down"
                size="sm"
                className={cn(
                  "text-muted shrink-0 transition-transform duration-fast",
                  detailsOpen && "rotate-180",
                )}
              />
            </span>
          </span>
        }
      >
        <div
          role="status"
          id="hub-chat-privacy"
          className="space-y-2 px-2 pt-2 pb-1"
        >
          <div className="flex items-center gap-2 text-style-caption text-text">
            <span
              className={cn(
                "inline-block w-2 h-2 rounded-full",
                contextState.status === "ready"
                  ? "bg-brand-500"
                  : contextState.status === "building"
                    ? "bg-warning motion-safe:animate-pulse"
                    : "bg-line",
              )}
              aria-hidden
            />
            <span className="font-semibold">
              {contextState.status === "building"
                ? "Готую контекст…"
                : contextState.status === "ready"
                  ? "Контекст готовий"
                  : "Очікую"}
            </span>
          </div>
          <p className="text-style-caption text-subtle leading-snug">
            В контексті: {sessionInfo.historyCount} з останніх 10 повідомлень ·
            ~{Math.round(sessionInfo.chars / 100) / 10}k символів.
          </p>
          {/* AI-NOTE: розкриття лишається caption, хоча це речення. Воно
              третє в стеку поповера, де два рядки вище — справжня мета
              (лічильник повідомлень, обсяг контексту). Підняти саме його
              означало б розсинхронити кегль усередині однієї компактної
              поверхні заради одного рядка. */}
          <p className="text-style-caption text-muted leading-snug">
            Контекст (фінанси, тренування, звички, харчування) відправляється до
            AI.
          </p>
        </div>
        <PopoverDivider />
        <PopoverItem
          icon={<Icon name="list" size="sm" />}
          onClick={() => {
            onDetailsOpenChange(false);
            onOpenHistory();
          }}
        >
          Усі бесіди ({sessionsCount})
        </PopoverItem>
      </Popover>
      {/* `min-w-0` (а не `shrink-0`): переповнення поглинає пігулка
          лічильника, а кнопки лишаються цілими — вони інтерактивні й мають
          тримати 44px floor. */}
      <div className="flex items-center gap-1 min-w-0">
        <ChatUsageCounter />
        <button
          type="button"
          onClick={onClearChat}
          className="flex min-h-11 min-w-11 shrink-0 items-center px-2 text-style-label-lg font-semibold text-text focus-ring"
          aria-label="Нова бесіда"
        >
          Нова
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text focus-ring"
          aria-label="Закрити чат"
        >
          <Icon name="close" size="md" />
        </button>
      </div>
    </div>
  );
}
