import { Router } from "express";
import type { Request, Response } from "express";
import {
  FeedbackSubmitSchema,
  FeedbackSubmitResponseSchema,
  type FeedbackSubmitResponse,
} from "@sergeant/shared";
import { rateLimitExpress, setModule, parseBody } from "../http/index.js";
import { getSessionUser } from "../auth.js";
import pool from "../db.js";
import { submitFeedbackEntry } from "../modules/feedback/feedbackService.js";

/**
 * `POST /api/v1/feedback` — in-app віджет фідбеку (Settings → «Фідбек»).
 *
 * Анонімний endpoint: сесії не вимагаємо. Тестер бети може писати ще до
 * логіну, а вимагати акаунт саме від людини, яка прийшла поскаржитись, — це
 * найгірший момент ставити барʼєр. Якщо сесія є — підвʼязуємо `user_id`, щоб
 * можна було відповісти конкретній людині.
 *
 * Чому endpoint узагалі існує, якщо подія вже летить у PostHog: PostHog —
 * аналітика, і її домен ріжуть блокувальники. До цієї ручки віджет був
 * fire-and-forget, і фідбек від тестера з uBlock зникав назавжди, а UI казав
 * «надіслано». Розбір: docs/03-operations/observability/feedback-loop.md § 2a.
 *
 * Rate-limit: 20 / IP / годину. Свідомо вільніший за waitlist (10/год) — це
 * канал багрепортів, і людина під час злої сесії тестування легко надішле
 * пʼять-шість повідомлень поспіль. Ліміт тут проти спам-ботів, не проти
 * активного тестера.
 *
 * Hard Rule #21: `message` — user-generated free-text, тож НІКОЛИ не
 * потрапляє в лог. Тіло запиту не логується; назовні йде лише `id`.
 */
export function createFeedbackRouter(): Router {
  const r = Router();
  r.use("/api/v1/feedback", setModule("feedback"));
  r.use("/api/feedback", setModule("feedback"));

  const handler = async (req: Request, res: Response) => {
    const parsed = parseBody(FeedbackSubmitSchema, req);

    let userId: string | null = null;
    try {
      const sessionUser = await getSessionUser(req);
      userId = sessionUser?.id ?? null;
    } catch {
      // Збій резолюції сесії трактуємо як «анонім» — фідбек не має
      // губитись через тимчасову проблему з auth-таблицями.
      userId = null;
    }

    const userAgent =
      typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"].slice(0, 256)
        : null;

    const result = await submitFeedbackEntry(pool, {
      category: parsed.category,
      message: parsed.message,
      page: parsed.page ?? null,
      viewport: parsed.viewport ?? null,
      user_id: userId,
      user_agent: userAgent,
      app_env: process.env["APP_ENV"] ?? process.env["NODE_ENV"] ?? null,
    });

    const payload: FeedbackSubmitResponse = FeedbackSubmitResponseSchema.parse({
      ok: true,
      id: result.id,
    });
    res.json(payload);
  };

  const limiter = rateLimitExpress({
    key: "api:feedback",
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });

  r.post("/api/v1/feedback", limiter, handler);
  // Legacy-alias без `/v1` — дзеркалить waitlist-роут, щоб не залежати від
  // порядку mount-ерів у `routes/index.ts`.
  r.post("/api/feedback", limiter, handler);

  return r;
}
