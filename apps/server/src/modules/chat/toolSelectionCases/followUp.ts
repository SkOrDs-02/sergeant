/**
 * Кейси «знайди, потім зміни ту» наступним повідомленням (С-2 (а), П-19 (А),
 * спека `docs/work/specs/hubchat-find-then-change.md`).
 *
 * AI-CONTEXT: свідомо НЕ в `ALL_CASES`. Касета `cassette.test.ts` вимагає
 * запису для кожного кейса з `ALL_CASES`, а ці кейси міряються окремим платним
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

import { TURN_REFS_HEADING } from "@sergeant/shared";
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
  `\n\n${TURN_REFS_HEADING}\n` +
  "- find_transaction: Знайдено 1 операц.: tx_7c40: 2026-07-29 · 412 грн · Сільпо · Продукти";

const USER = "Перенеси її в їжу поза домом";

/**
 * Той самий ланцюжок для Фізрука (рішення founder-а 2026-11-18: «усі модулі
 * зі згодою»). Тренування з id дає лише результат запису: `query_workouts`
 * показує завершені тренування без id, тож «знайдене» тут — план, який
 * асистент щойно створив (`plan_workout`, формат `fizrukActions/workouts.ts`).
 * id `w_mf3k51` навмисно відсутній у `DATA_BLOCK`.
 */
const WORKOUT_HISTORY: HistoryMessage[] = [
  { role: "user", content: "Заплануй на суботу присідання і жим" },
  {
    role: "assistant",
    content: "Запланував на суботу, 1 серпня, о 09:00: дві вправи.",
  },
];

const WORKOUT_REFS_BLOCK =
  `\n\n${TURN_REFS_HEADING}\n` +
  "- plan_workout: Тренування заплановано на 2026-08-01 о 09:00: 2 вправи (id:w_mf3k51)";

const WORKOUT_USER = "Я його вже зробив, заверши його";

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
  {
    name: "знайди-потім-зміни: тренування з попередньої відповіді",
    history: WORKOUT_HISTORY,
    dataExtra: WORKOUT_REFS_BLOCK,
    user: WORKOUT_USER,
    accept: ["finish_workout"],
    expectArgs: { finish_workout: { workout_id: "w_mf3k51" } },
  },
  // С-2 (б), другий раунд «пошук → запис» в одному повідомленні (спека
  // `docs/work/specs/hubchat-second-tool-round.md`). Операцій немає в
  // `DATA_BLOCK`, тож перший хід мусить шукати (`find_transaction` — єдиний
  // інструмент, після якого прод дає другий раунд, `chatSecondRound.ts`), а
  // другий бере id з результату пошуку. Формат результату — `formatTxList`
  // виконавця `find_transaction`.
  {
    name: "другий раунд: пошук → зміна категорії",
    user: "Покупку в Сільпо 22 липня на 412 грн перенеси в їжу поза домом",
    accept: ["find_transaction"],
    expectArgs: {
      change_category: { tx_id: "tx_7c40", category_id: "cat_food_out" },
    },
    turns: [
      {
        result:
          "Знайдено 1 операц.: tx_7c40: 2026-07-22 · 412 грн · Сільпо · Продукти",
        accept: ["change_category"],
      },
    ],
  },
  {
    name: "другий раунд: пошук → видалення ручного запису",
    user: "Видали ручний запис про таксі на 230 грн за вчора, я його вніс помилково",
    accept: ["find_transaction"],
    expectArgs: { delete_transaction: { tx_id: "m_5d12" } },
    turns: [
      {
        result:
          "Знайдено 1 операц.: m_5d12: 2026-07-29 · 230 грн · таксі · вручну",
        accept: ["delete_transaction"],
      },
    ],
  },
  {
    name: "другий раунд: двозначний пошук → уточнення, не запис",
    user: "Видали ту витрату на таксі, яку я вносив вручну цього тижня",
    accept: ["find_transaction"],
    turns: [
      {
        result:
          "Знайдено 2 операц.: m_5d12: 2026-07-29 · 230 грн · таксі · вручну; m_5d31: 2026-07-27 · 180 грн · таксі · вручну",
        accept: [],
        expectNoWrite: true,
      },
    ],
  },
  {
    name: "другий раунд: людина просила лише знайти → запису немає",
    user: "Знайди мою покупку в Сільпо 22 липня",
    accept: ["find_transaction"],
    turns: [
      {
        result:
          "Знайдено 1 операц.: tx_7c40: 2026-07-22 · 412 грн · Сільпо · Продукти",
        accept: [],
        expectNoWrite: true,
      },
    ],
  },
];
