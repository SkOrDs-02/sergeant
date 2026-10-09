import { Sheet } from "@shared/components/ui/Sheet";
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
// AI-DANGER: саме `uk.core`, а не `uk` — цей файл лінивий, але його тягне
// оверлей чату, і повний каталог привів би з собою десять модульних файлів
// плюс en-копію (розбір у шапці `uk.core.ts`). Гейт — `uk.core.eagerImports.test.ts`.
import { coreMessages as messages } from "@shared/i18n/uk.core";
import type { ChatPreset } from "@sergeant/shared";
import { PageLoader } from "../app/PageLoader";
import { lazyDefault } from "../lib/lazyImport";

const HubChat = lazyDefault(() => import("./HubChat"));

export interface HubChatSheetProps {
  onClose: () => void;
  onOpenCatalogue: () => void;
  initialMessage: string;
  autoSendInitial: boolean;
  preset: ChatPreset | undefined;
}

/**
 * Візуальна оболонка чату — аркуш і лінивий `HubChat` усередині.
 *
 * AI-CONTEXT: винесено з `HubChatOverlay` 2026-09-16, і це НЕ косметика.
 * Оверлей статично імпортує `RootLayout` (він тримає намір повернення з
 * каталогу і мусить бути змонтований завжди), тож поки `Sheet` жив тут,
 * увесь стек аркуша — `Sheet` + `useSwipeToDismiss` + `useBodyScrollLock` +
 * `useKeyboardAwareOverlay` + `useVisualKeyboardInset`, ~2.8 kB brotli —
 * сидів на критичному шляху першого екрана, хоча жодна поверхня першого
 * кадру аркуша не рендерить. Замір і борг — `AGENTS.md § Performance
 * budgets` (ратчет eager 2026-09-16).
 *
 * Тому правило: **тут можна імпортувати важке, в `HubChatOverlay` — ні.**
 * Усе, що потрібне лише відкритому чату, живе в цьому файлі; усе, що має
 * працювати із закритим чатом (ефекти маршруту, наміри), лишається в
 * оверлеї.
 *
 * Snap-points caveat: канонічний `<Sheet>` ще не має API точок прилипання.
 * Продуктова спека просила `["60%", "100%"]` з підтягуванням; це окремий
 * хвіст, а не блокер — аркуш відкривається `fullScreen`, свайп-вниз через
 * ручку працює.
 */
export function HubChatSheet({
  onClose,
  onOpenCatalogue,
  initialMessage,
  autoSendInitial,
  preset,
}: HubChatSheetProps) {
  return (
    <Sheet
      open
      onClose={onClose}
      // HubChat ships its own `<HubChatHeader>` (title popover + close
      // pill); we suppress Sheet's built-in header row to avoid a
      // duplicate stack. `title` is still consumed by `aria-labelledby`
      // via the visually-hidden node Sheet renders when hideHeader=true.
      hideHeader
      // Чат — повноцінний екран, а не форма над навбаром: без цього
      // панель висіла над низом екрана з навбаром крізь скло і смужкою
      // сторінки зверху (звіт власника 2026-09-03). Safe-area зверху й
      // знизу несе сама панель, тож композер лягає над home-індикатором.
      fullScreen
      // Ряд із ручкою лежить на панелі, а не в HubChat: зі скляним фоном
      // панелі він читався як світла смужка над шапкою чату (`bg-bg`).
      // На повний екран крізь скло однаково нічого не просвічує.
      panelClassName="bg-bg!"
      title={messages.hub.overlayTitle}
      // HubChat owns the inner scroll (`HubChatBody` is the scrollable
      // surface). Override Sheet's default padded + overflow-y-auto
      // body so we don't nest two scrolling containers; the inner
      // `flex` lets HubChat's `flex-1 min-h-0` shell fill the panel.
      bodyClassName="!p-0 !overflow-hidden flex flex-col"
      closeLabel={messages.hub.closeChat}
    >
      {/* `className`: цей wrapper — flex-item між body Sheet-а і HubChat;
          без flex-1/min-h-0/flex-col він рвав ланцюг висот, HubChatBody
          ніколи не переповнювався і список повідомлень не скролився
          (round-3 UI audit — «чат заблокований по скролу»). */}
      <SuspenseWithMinDelay
        fallback={<PageLoader />}
        className="flex-1 min-h-0 flex flex-col"
      >
        <HubChat
          onClose={onClose}
          initialMessage={initialMessage}
          autoSendInitial={autoSendInitial}
          preset={preset}
          onOpenCatalogue={onOpenCatalogue}
        />
      </SuspenseWithMinDelay>
    </Sheet>
  );
}

export default HubChatSheet;
