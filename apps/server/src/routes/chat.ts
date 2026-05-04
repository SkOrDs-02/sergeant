import { Router } from "express";
import {
  asyncHandler,
  rateLimitExpress,
  requireAiQuota,
  requireAnthropicKey,
  setModule,
} from "../http/index.js";
import chatHandler from "../modules/chat/chat.js";

export function createChatRouter(): Router {
  const r = Router();
  r.post(
    "/api/chat",
    setModule("chat"),
    // Chat — Anthropic streaming SSE: ~30s end-to-end and ~50KB of tokens
    // per response. A naive 30-rpm bucket lets a single user fire 30 of
    // those per minute, which is ~15 minutes of upstream model time and
    // ~1.5MB of egress in 60 seconds. The cost-multiplier (cost: 10) makes
    // each accepted chat-stream consume 10 tokens from a 60-token bucket,
    // landing the effective cap at 6 streams per minute while leaving
    // future cheap GETs on the same key free to coexist (none today, but
    // the `api:chat` key is reserved for the chat surface). See
    // `RateLimitOptions.cost` for the rationale.
    rateLimitExpress({
      key: "api:chat",
      limit: 60,
      windowMs: 60_000,
      cost: () => 10,
    }),
    requireAnthropicKey(),
    requireAiQuota(),
    asyncHandler(chatHandler),
  );
  return r;
}
