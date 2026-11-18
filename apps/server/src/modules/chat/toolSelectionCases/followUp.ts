/**
 * Кейси «знайди, потім зміни ту» наступним повідомленням (С-2 (а), П-19 (А),
 * спека `docs/work/specs/hubchat-find-then-change.md`).
 *
 * AI-CONTEXT: свідомо НЕ в `ALL_CASES`. Касета `cassette.test.ts` вимагає
 * запису для кожного кейса з `ALL_CASES`, а ці два міряються окремим платним
 * прогоном (`pnpm eval:tools --follow-up`), без перезапису касети. Коли касету
 * перезаписуватимуть з іншої причини, ці кейси можна перенести в
 * `ALL_CASES` тим самим кроком.
 *
 * Пара навмисна: однакова розмова, різниця лише в блоці записів попередньої
 * відповіді (`dataExtra`). Перший кейс міряє фікс (id приходить у ДАНІ, модель
 * має взяти саме його), другий — поведінку без фіксу (id у ДАНІ немає, правильно
 * шукати знову, а вигаданий `tx_7c40` чи будь-який інший id стенд рахує як
 * `FAKE`). id `tx_7c40` навмисно відсутній у `DATA_BLOCK`, щоб його можна було
 * взяти лише з блоку записів.
 */

import type { HistoryMessage, ToolCase } from "./types.js";

const HISTORY: HistoryMessage[] = [
  { role: "user", content: "Знайди мою покупку в Сільпо за середу" },
  {
    role: "assistant",
    content: "Знайшов: 29 липня, 412 грн у Сільпо, категорія «Продукти».",
  },
];

/**
 * Той самий формат, що збирає `apps/web/src/core/hub/chat/turnRefs.ts`
 * (`withTurnRefs` + `collectTurnRefs`) з результату `find_transaction`
 * (`formatTxList`). Розійдеться формат у вебі — онови і тут.
 */
const REFS_BLOCK =
  "\n\n[Записи з попередньої відповіді]\n" +
  "- find_transaction: Знайдено 1 операц.: tx_7c40: 2026-07-29 · 412 грн · Сільпо · Продукти";

const USER = "Перенеси її в їжу поза домом";

export const FOLLOW_UP_CASES: ToolCase[] = [
  {
    name: "знайди-потім-зміни: id з попередньої відповіді",
    history: HISTORY,
    dataExtra: REFS_BLOCK,
    user: USER,
    accept: ["change_category"],
    expectArgs: {
      change_category: { tx_id: "tx_7c40", category_id: "cat_food_out" },
    },
  },
  {
    name: "знайди-потім-зміни: без записів (контроль)",
    history: HISTORY,
    user: USER,
    accept: ["find_transaction", "query_transactions"],
  },
];
