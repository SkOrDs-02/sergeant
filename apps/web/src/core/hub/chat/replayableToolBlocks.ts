/**
 * Фільтр блоків `tool_calls_raw` перед повторним відправленням на сервер.
 *
 * Контекст (знахідка B32, `docs/work/specs/audits/ai-testing-2026-08-25.md`).
 * Сервер кладе `tool_calls_raw` у повідомлення з роллю `assistant` — єдину
 * роль, яку НЕ огороджує `<user_data>` / `<tool_output>`. Доки поле було
 * `z.array(z.unknown())`, клієнт міг вписати туди довільний текст «від імені
 * асистента» й повністю обійти захист від інʼєкцій. Тому сервер тепер
 * приймає рівно три типи блоків і відхиляє решту 400-кою.
 *
 * Але модель штатно повертає перед викликом інструмента ще й `text`-блок
 * (преамбула на кшталт «зараз перевірю витрати»), а клієнт досі відбивав
 * `tool_calls_raw` назад ДОСЛІВНО. Без цього фільтра будь-який такий хід
 * ловив би 400 на другому запиті — тобто фікс безпеки зламав би звичайний
 * сценарій.
 *
 * Преамбула при цьому не губиться для користувача: її вже дострімлено в UI.
 * Модель у наступному ході бачить свої `tool_use`-блоки і результати —
 * цього достатньо, щоб продовжити думку.
 */
import { ToolCallsRawBlockSchema } from "@sergeant/shared";

/**
 * Лишає тільки ті блоки, які пройдуть серверну валідацію.
 *
 * WHY схемою, а не власним списком типів: список у двох місцях розійшовся б
 * при першій же зміні контракту (рівно та хвороба, що дала B37 і B38 —
 * дефолт моделі й прайс-таблиця в різних файлах). Тут джерело істини одне —
 * `ToolCallsRawBlockSchema` з `@sergeant/shared`, той самий обʼєкт, яким
 * валідує `parseBody` на сервері.
 */
export function keepReplayableToolBlocks(raw: unknown): unknown[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const kept = raw.filter((b) => ToolCallsRawBlockSchema.safeParse(b).success);
  return kept.length > 0 ? kept : undefined;
}

/**
 * Що тур синтезу відбиває назад із першого туру того самого ходу: блоки
 * `tool_calls_raw` (через фільтр вище) і `round_trip_ticket`, якщо сервер
 * його видав.
 *
 * AI-CONTEXT (2026-11-18, спека `hubchat-find-then-change.md`): квиток сервер
 * видавав з AI-5, а клієнт його не повертав, тож кожен хід з інструментом
 * списував дві одиниці тижневої квоти (`aiQuota.ts::tryConsumeRoundTripTicket`)
 * і рвав трейс ходу в PostHog надвоє (`chat.ts`, `toolTraceId`). Без квитка
 * поле відсутнє, а не порожнє: порожній рядок сервер однаково відкидає.
 */
export function firstTurnEcho(first: {
  tool_calls_raw?: unknown;
  round_trip_ticket?: string;
}): { tool_calls_raw: unknown[] | undefined; round_trip_ticket?: string } {
  return {
    tool_calls_raw: keepReplayableToolBlocks(first.tool_calls_raw),
    ...(first.round_trip_ticket
      ? { round_trip_ticket: first.round_trip_ticket }
      : {}),
  };
}
