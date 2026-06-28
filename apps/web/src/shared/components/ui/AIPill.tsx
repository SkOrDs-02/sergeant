/**
 * Sergeant Design System — `AIPill` (PR-7a).
 *
 * @lifecycle experimental (introduced 2026-05; promoted to active after PR-8)
 * @see docs/design/redesign-v2/governance.md § AI surfaces
 *
 * Persistent AI affordance що сидить НАД bottom-nav (z-sticky tier).
 * Один круглий FAB зі sparkle-іконкою: **tap → відкриває chat sheet**
 * (`emitHubBus("openChat")`). Голосовий ввід живе всередині самого чату
 * (`ChatInput` має власну mic-кнопку), тому пілу окремий мікрофон не
 * потрібен.
 *
 * ## Чому без scroll-driven expand (2026-06-28)
 *
 * Попередня версія розкривала пілу в широкий "Запитай Sergeant…" input-row
 * при скролі сторінки вгору (Material shrink-on-scroll). На мобільному це
 * читалось як "чат сам відкрився": рядок вискакував поверх контенту коли
 * користувач просто гортав до верху (mobile report 2026-06-28). За рішенням
 * maintainer-а пілу спрощено до compact FAB, що відкриває чат ВИКЛЮЧНО по
 * кліку — жодної реакції на скрол.
 *
 * ## Z-index + positioning
 *
 * `fixed … bottom-[…]` + `z-sticky` (над content/dropdowns, під modals).
 * `safe-area-inset-bottom` додається до bottom offset для iOS.
 *
 * - **`standalone`** (hub): пілу — єдиний FAB на поверхні, тож сідає в
 *   канонічний нижній-правий кут (`right-5`, 56px) тим самим positioning-
 *   language, що й модульний `FloatingActionButton`.
 * - **default** (модульні shell-и): компактний 44px pip, зсунутий
 *   `right-[4.5rem]` ліворуч від модульного FAB-а, щоб вони не накладались.
 *
 * ## Hide-on conditions
 *
 * Не рендеримо коли:
 *   - FTUX session (`inFtuxSession` у caller — caller просто не рендерить)
 *   - `/chat` route (chat is already open)
 *   - Full-screen overlays (login, scanner viewfinder)
 *
 * Caller відповідає за conditional rendering — компонент завжди показує
 * себе якщо змонтований.
 */

import { Icon } from "@shared/components/ui/Icon";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";

export interface AIPillProps {
  /**
   * Bottom offset in px (default 84 — sits above ModuleBottomNav). The hub
   * passes 96 to clear its floating glass HubBottomNav.
   */
  bottom?: number;
  /**
   * Render as the standalone primary FAB anchored in the bottom-right
   * corner (hub — no competing module FAB). Default `false` keeps the
   * compact pip offset `right-[4.5rem]` so it sits beside a module FAB.
   */
  standalone?: boolean;
  className?: string;
}

export function AIPill({
  bottom = 84,
  standalone = false,
  className,
}: AIPillProps) {
  const openChat = () => {
    hapticTap();
    // Sergeant v2 Phase 7 D5 — emit the bus event instead of
    // `navigate(CHAT_PATH)`. `useAppEffects` listens and opens the
    // bottom-sheet overlay over the current route (preserves scroll
    // position, doesn't tear down the surface beneath).
    emitHubBus("openChat", { message: null, autoSend: false });
  };

  return (
    <button
      type="button"
      onClick={openChat}
      aria-label={messages.nav.openAssistant}
      style={{
        bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`,
      }}
      className={cn(
        "fixed z-sticky flex items-center justify-center rounded-full text-white",
        "bg-gradient-to-br from-brand-400 to-brand-strong shadow-fab",
        "transition-transform duration-200 ease-out active:scale-95 hover:scale-[1.04]",
        "motion-reduce:transition-none",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        // Standalone (hub): canonical corner FAB, matching FloatingActionButton.
        // Default (modules): compact pip left of the module FAB.
        standalone
          ? "right-[max(1.25rem,env(safe-area-inset-right,0px))] w-14 h-14"
          : "right-[4.5rem] w-11 h-11",
        className,
      )}
    >
      <Icon name="sparkle" size={standalone ? 24 : 18} strokeWidth={2.2} />
    </button>
  );
}
