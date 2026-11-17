import type { Response } from "express";

/**
 * Сигнал, що спрацьовує, коли клієнт обірвав зʼєднання до кінця відповіді
 * (закрита вкладка, обрив мережі). Передається в LLM-виклик, щоб апстрім не
 * догенеровував відповідь, на яку вже ніхто не чекає.
 *
 * Слухаємо `res` 'close', а не `req` 'close': у Node >=16 `req` емітить його
 * одразу після дочитування тіла, ще до хендлера. Після штатної відповіді
 * `writableFinished === true`, тож abort не стається.
 */
export function abortOnClientClose(res: Response): AbortSignal {
  const controller = new AbortController();
  // Юніт-тести хендлерів підставляють `res` без EventEmitter (як і в chat.ts).
  if (typeof res.on === "function") {
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
  }
  return controller.signal;
}
