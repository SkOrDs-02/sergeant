import type { Request, Response } from "express";
import { env } from "../../env/env.js";

/**
 * Спільні для всіх `/api/silpo/*` роут-файлів (`routes/silpo.ts`,
 * `routes/silpoCart.ts`, `routes/silpoPantry.ts`) - винесено, щоб не
 * дублювати kill-switch/auth-гейт у кожному файлі й не роздувати жоден із
 * них понад Hard Rule #18 (max-lines 600).
 */

export interface AuthedRequest extends Request {
  user?: { id: string };
}

export function assertSilpoEnabled(res: Response): boolean {
  if (!env.SILPO_ENABLED) {
    res.status(503).json({
      error: "Інтеграція із Сільпо вимкнена",
      code: "SILPO_DISABLED",
    });
    return false;
  }
  return true;
}

export function getUserId(req: AuthedRequest, res: Response): string | null {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(401)
      .json({ error: "Потрібна автентифікація", code: "UNAUTHORIZED" });
    return null;
  }
  return userId;
}
