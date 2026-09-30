/**
 * Status: Active
 *
 * Серверний гейт «дані про здоровʼя → LLM» (GDPR Art. 9(2)(a)).
 *
 * AI-CONTEXT: рішення власника 2026-09-29 — ВУЗЬКИЙ гейт. Фізрук і Харчування
 * лишаються відкритими (дані локальні), але тренування, вага, самопочуття,
 * калорії, записи про їжу й фото страв потрапляють у модель та `ai_memories`
 * лише за збереженої `healthDataConsent`. Джерело правди — рядок
 * `user_preferences` на сервері; клієнтський стан тільки для UX. Це
 * скасовує рішення 2026-09-14 («ефемерна відповідь у чаті лишається
 * доступною всім») — воно лишало згоду без юридичної сили
 * (`2026-08-05-external-critique-surface.md` § 1.4).
 *
 * Fail-closed: відсутній рядок, `false`, `null` і збій БД однаково означають
 * «згоди немає» (`hasHealthDataConsent` + `catch` нижче).
 */

import type { NextFunction, Request, Response } from "express";
import {
  HEALTH_CONSENT_REQUIRED_CODE,
  HEALTH_CONSENT_REQUIRED_MESSAGE,
} from "@sergeant/shared";
import { pool } from "../db.js";
import { hasHealthDataConsent } from "../modules/ai-memory/consent.js";
import { ForbiddenError } from "../obs/errors.js";
import { logger } from "../obs/logger.js";

type WithSessionUser = Request & { user?: { id: string } };

/**
 * Чи дав користувач згоду на дані про здоровʼя. Без `userId` (сесії немає) і
 * при збої БД — `false`.
 */
export async function resolveHealthConsent(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  try {
    return await hasHealthDataConsent(pool, userId);
  } catch (err) {
    logger.warn({
      msg: "health_consent_check_failed",
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Middleware для ендпоінтів, чиє ЯДРО — дані про здоровʼя (фото їжі, КБЖВ-цілі).
 * Стоїть ПІСЛЯ `requireSession()` і ПЕРЕД `requireAiQuota()`: людина, якій
 * треба дати згоду, не повинна платити за це квотою.
 *
 * Відповідь — 403 із `code: HEALTH_CONSENT_REQUIRED` і текстом-дією, який
 * web показує як запит згоди, а не як «доступ заборонено».
 *
 * `appliesTo` — коли ендпоінт лише ІНОДІ несе health (напр. рецепти з
 * `preferences.goal`): повернути `false`, і запит проходить без перевірки.
 */
export function requireHealthConsent(
  appliesTo: (req: Request) => boolean = () => true,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, _res, next) => {
    if (!appliesTo(req)) {
      next();
      return;
    }
    void resolveHealthConsent((req as WithSessionUser).user?.id).then(
      (granted) => {
        if (granted) {
          next();
          return;
        }
        next(
          new ForbiddenError(HEALTH_CONSENT_REQUIRED_MESSAGE, {
            code: HEALTH_CONSENT_REQUIRED_CODE,
          }),
        );
      },
    );
  };
}

/**
 * Для ендпоінтів, де health — лише ОДНЕ необовʼязкове поле (`preferences.goal`
 * у рецептах і тижневому плані: «схуднути / набрати»). Блокувати їх заради
 * цього означало б зламати кулінарну фічу; тож без згоди поле мовчки
 * прибирається з тіла, а хендлер бере свій дефолт (`balanced`) — рецепти
 * працюють, лише без підлаштування під ціль.
 */
export function scrubGoalWithoutHealthConsent(): (
  req: Request,
  res: Response,
  next: NextFunction,
) => void {
  return (req, _res, next) => {
    const body = req.body as
      { preferences?: Record<string, unknown> | null } | undefined;
    const prefs = body?.preferences;
    if (!prefs || typeof prefs !== "object" || !("goal" in prefs)) {
      next();
      return;
    }
    void resolveHealthConsent((req as WithSessionUser).user?.id).then(
      (granted) => {
        if (!granted) delete prefs["goal"];
        next();
      },
    );
  };
}
