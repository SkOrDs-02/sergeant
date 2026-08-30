import type { Request, Response, NextFunction } from "express";
import { env } from "../env.js";
import { logger } from "../obs/logger.js";

/**
 * Request timeout middleware.
 *
 * Prevents zombie requests from consuming resources indefinitely.
 * Sends 408 Request Timeout if the request exceeds the configured timeout.
 *
 * SSE-відповіді (`Content-Type: text/event-stream`) навмисно виключені —
 * див. коментар біля перевірки в тілі таймера. Їхній бюджет тримають власні
 * `AbortController`-и upstream-викликів і стеля `MAX_TOOL_ITERATIONS`, а не
 * цей глобальний таймер.
 */
export function requestTimeout(timeoutMs?: number) {
  const timeout = timeoutMs ?? env.REQUEST_TIMEOUT_MS;

  if (timeout <= 0) {
    // Timeout disabled
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // Track if response has already been sent
    let timedOut = false;

    const timer = setTimeout(() => {
      logger.warn({
        msg: "request_timeout",
        method: req.method,
        path: req.path,
        timeoutMs: timeout,
        requestId: req.id,
      });

      // B41 (`docs/90-work/audits/ai-testing-2026-08-25.md`) — SSE не рубаємо.
      //
      // Докстрінг вище стверджував, що «for streaming responses, individual
      // handlers should manage their own timeouts», але код цього не робив:
      // `req.destroy()` виконувався БЕЗУМОВНО, і для стріму — у якого
      // заголовки пішли в першу секунду — це означало обрив живого зʼєднання
      // на 120-й секунді. Worst-case чат (до 8 tool-ітерацій по 60 с на
      // виклик) цю стелю перевищує законно.
      //
      // Досі не боліло лише тому, що клієнт сам абортить на 90 с — тобто
      // симптом маскувався чужим таймером, і будь-яка зміна на клієнті
      // проявила б обриви на сервері.
      //
      // Стрім не лишається без нагляду: кожен upstream-виклик має власний
      // `AbortController` (`lib/anthropic.ts`), тепер ще й сумарний бюджет
      // (B42), а кількість ітерацій обмежена `MAX_TOOL_ITERATIONS`.
      const contentType = String(res.getHeader("content-type") ?? "");
      if (contentType.includes("text/event-stream")) {
        logger.warn({
          msg: "request_timeout_skipped_sse",
          method: req.method,
          path: req.path,
          timeoutMs: timeout,
          requestId: req.id,
        });
        return;
      }

      // `timedOut` ставимо ПІСЛЯ SSE-перевірки, а не на початку таймера.
      // Він глушить обгорнуті `res.json/send/end` нижче, тож при ранньому
      // return для стріму ми б лишили відповідь у стані «писати можна,
      // закрити не можна»: `res.write()` не обгорнутий і працює далі, а
      // `res.end()` стає no-op — клієнт висить до власного розриву.
      // Тобто перша версія SSE-винятку рятувала зʼєднання від обриву й
      // одразу ж позбавляла його здатності завершитись (ревʼю CodeRabbit
      // 2026-08-26). Для SSE таймер тепер лише пише в лог і не чіпає нічого.
      timedOut = true;

      // Only send response if headers haven't been sent
      if (!res.headersSent) {
        res.status(408).json({
          error: "Request Timeout",
          message: "The request took too long to process",
          code: "REQUEST_TIMEOUT",
        });
      }

      // Destroy the request to free resources
      req.destroy();
    }, timeout);

    // Clear timeout when response finishes
    res.on("finish", () => {
      clearTimeout(timer);
    });

    res.on("close", () => {
      clearTimeout(timer);
    });

    // Prevent double-response if timeout fires during handler execution
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    const originalEnd = res.end.bind(res);

    res.json = function (body: unknown) {
      if (timedOut) return res;
      return originalJson(body);
    };

    res.send = function (body: unknown) {
      if (timedOut) return res;
      return originalSend(body);
    } as typeof res.send;

    res.end = function (...args: Parameters<typeof res.end>) {
      if (timedOut) return res;
      return originalEnd(...args);
    } as typeof res.end;

    next();
  };
}
