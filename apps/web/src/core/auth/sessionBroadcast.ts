/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * Сигнал між вкладками: «сесію в цьому браузері завершено» (аудит 2026-10-01,
 * `priv-02`, залишок після #1337).
 *
 * AI-CONTEXT: cookie сесії спільна для всіх вкладок, а `logout()` і teardown
 * після втрати сесії працюють лише в тій, де це сталося. Інша вкладка з тим
 * самим акаунтом лишалась «залогіненою» в памʼяті (React Query, хаб-снапшоти,
 * теплі SQLite-кеші) і показувала дані попереднього користувача до першого
 * власного 401. Тому вкладка, що завершує сесію, кидає сюди повідомлення, а
 * решта (з активним користувачем) викликає той самий teardown і йде на вхід.
 *
 * AI-DANGER: eager-чанк (його імпортує `AuthContext`). Жодного runtime-імпорту
 * `@sergeant/shared` і жодних важких залежностей: білий екран на буті, див.
 * `apps/web/AGENTS.md`. Стирання SQLite-партиції сюди не належить (priv-05).
 */

export const SESSION_BROADCAST_CHANNEL = "sergeant-session-v1";

const MESSAGE_TYPE = "session-ended";

/** Ідентифікує цю вкладку, щоб не реагувати на власні повідомлення. */
const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

interface SessionBroadcastMessage {
  readonly type: typeof MESSAGE_TYPE;
  readonly from: string;
}

function openChannel(): BroadcastChannel | null {
  try {
    if (typeof BroadcastChannel === "undefined") return null;
    return new BroadcastChannel(SESSION_BROADCAST_CHANNEL);
  } catch {
    return null;
  }
}

/** Повідомити інші вкладки, що сесію завершено. Ніколи не кидає. */
export function broadcastSessionEnded(): void {
  const channel = openChannel();
  if (!channel) return;
  try {
    const message: SessionBroadcastMessage = {
      type: MESSAGE_TYPE,
      from: TAB_ID,
    };
    channel.postMessage(message);
  } catch {
    /* вихід не має залежати від каналу */
  } finally {
    channel.close();
  }
}

function isForeignSessionEnded(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const m = data as Partial<SessionBroadcastMessage>;
  return (
    m.type === MESSAGE_TYPE && typeof m.from === "string" && m.from !== TAB_ID
  );
}

/**
 * Підписка на «сесію завершено» в ІНШИХ вкладках. Повертає відписку; без
 * `BroadcastChannel` (старий Safari) нічого не робить.
 */
export function subscribeSessionEnded(handler: () => void): () => void {
  const channel = openChannel();
  if (!channel) return () => undefined;
  channel.onmessage = (event: MessageEvent) => {
    if (isForeignSessionEnded(event.data)) handler();
  };
  return () => {
    channel.onmessage = null;
    channel.close();
  };
}
