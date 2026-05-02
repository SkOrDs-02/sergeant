import { Router } from "express";
import type { Request, Response } from "express";
import { MeResponseSchema, type MeResponse } from "@sergeant/shared";
import { asyncHandler, requireSession, setModule } from "../http/index.js";

type AuthedUser = {
  id: string;
  email?: string;
  name?: string;
  image?: string | null;
  emailVerified?: boolean;
  // Better Auth повертає `createdAt` як `Date`; нормалізуємо у ISO-рядок
  // нижче (схема `UserSchema` очікує `string | null`). Допускаємо `string`
  // на випадок, якщо адаптер сесії віддасть уже серіалізоване значення.
  createdAt?: Date | string;
};

function toIsoOrNull(value: Date | string | undefined): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string" && value.length > 0) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/**
 * `/api/me` — уніфікований endpoint "хто я" для web cookie-сесій та
 * mobile bearer-токенів.
 *
 * Реалізація навмисно банальна: `requireSession()` делегує резолюцію
 * сесії у `getSessionUser()` → `auth.api.getSession(headers)`. Better Auth
 * bearer-плагін підхоплює `Authorization: Bearer <token>` ДО виклику
 * cookie-парсера, перекладає його у in-memory cookie і далі код не
 * розрізняє канал. Тому один роут працює для обох клієнтів.
 *
 * Доступний і на `/api/me`, і на `/api/v1/me` (див. `apiVersionRewrite`
 * у `server/app.ts`). Формат відповіді сумісний із `auth.api.getSession`,
 * але обрізаний до публічних полів — не повертаємо internal timestamps
 * чи id сесії.
 */
export function createMeRouter(): Router {
  const r = Router();
  r.use("/api/me", setModule("me"));
  r.get(
    "/api/me",
    requireSession(),
    asyncHandler(async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      // Прогоняємо відповідь через канонічну Zod-схему з `@sergeant/shared`
      // (те саме, що валідує `@sergeant/api-client` на клієнті). Це гарантує,
      // що веб і майбутній мобільний клієнт отримають ідентичну форму, і
      // не дає випадково просочити новому полю в response без оновлення
      // схеми.
      // `email` має валідацію `.email()` у схемі — тож порожній рядок ""
      // валитиме parse. Використовуємо `||` замість `??`, щоб і falsy-рядки
      // (якщо колись прийшов "") нормалізувались до `null`.
      const payload: MeResponse = MeResponseSchema.parse({
        user: {
          id: user.id,
          email: user.email || null,
          name: user.name ?? null,
          image: user.image ?? null,
          emailVerified: Boolean(user.emailVerified),
          createdAt: toIsoOrNull(user.createdAt),
        },
      });
      res.json(payload);
    }),
  );
  return r;
}
