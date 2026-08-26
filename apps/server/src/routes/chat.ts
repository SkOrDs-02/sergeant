import { Router } from "express";
import {
  rateLimitExpress,
  requireAiQuota,
  requireChatUpstreamKey,
  requireSession,
  setModule,
} from "../http/index.js";
import chatHandler from "../modules/chat/chat.js";
import chatUsageHandler from "../modules/chat/usage.js";

export function createChatRouter(): Router {
  const r = Router();
  r.get(
    "/api/chat/usage",
    setModule("chat"),
    requireSession(),
    chatUsageHandler,
  );
  r.post(
    "/api/chat",
    setModule("chat"),
    // Чат витрачає Anthropic-ключ власника, тому це per-user фіча, не
    // публічний proxy (той самий аргумент, що в `transcribe.ts`). Без сесії
    // квота падала на `ip:<addr>`, а IPv6-клієнт має під підпискою цілу /64 —
    // денний ліміт переставав бути лімітом. Знахідка A1,
    // `docs/90-work/audits/ai-abuse-2026-08-05.md`.
    //
    // requireSession() йде ПЕРЕД rateLimitExpress навмисно (знахідка B31,
    // `docs/90-work/audits/ai-testing-2026-08-25.md`): `rateLimitSubject`
    // (`http/rateLimit.ts`) читає `req.user.id` і фолбечиться на
    // `ip:<addr>` лише коли сесії немає. Якщо лімітер стоїть ДО
    // requireSession, `req.user` завжди unset у момент перевірки — кожен
    // запит бакетиться по IP, а не по юзеру, і застереження нижче про
    // «30 стрімів/хв на юзера» перестає бути правдою: насправді ліміт був
    // per-IP, тож NAT/офіс/VPN-клієнти ділили один бакет.
    requireSession(),
    // Chat — Anthropic streaming SSE: ~30s end-to-end and ~50KB of tokens
    // per response. A naive 30-rpm bucket lets a single user fire 30 of
    // those per minute, which is ~15 minutes of upstream model time and
    // ~1.5MB of egress in 60 seconds. The cost-multiplier (cost: 10) makes
    // each accepted chat-stream consume 10 tokens from a 60-token bucket,
    // landing the effective cap at 6 streams per minute while leaving
    // future cheap GETs on the same key free to coexist (none today, but
    // the `api:chat` key is reserved for the chat surface). See
    // `RateLimitOptions.cost` for the rationale. This is now genuinely a
    // per-user bucket (`u:<id>`), not per-IP — see the ordering note above.
    rateLimitExpress({
      key: "api:chat",
      limit: 60,
      windowMs: 60_000,
      cost: () => 10,
    }),
    // Ключ ТОГО транспорту, яким піде запит: під шлюзом Anthropic-ключ не
    // потрібен і не використовується (`pickTransport` бере
    // `OPENROUTER_API_KEY`). Див. докстрінг `requireChatUpstreamKey`.
    requireChatUpstreamKey(),
    requireAiQuota(),
    chatHandler,
  );
  return r;
}
