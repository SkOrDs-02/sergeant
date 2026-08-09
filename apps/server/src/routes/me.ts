import { Router } from "express";
import type { Request, Response } from "express";
import {
  MeDeleteResponseSchema,
  MeExportResponseSchema,
  MeResponseSchema,
  UserPreferencesPatchSchema,
  UserPreferencesSchema,
  UserProfilePutBodySchema,
  UserProfileResponseSchema,
  type MeResponse,
} from "@sergeant/shared";
import {
  parseBody,
  rateLimitExpress,
  requireSession,
  setModule,
} from "../http/index.js";
import { pool } from "../db.js";
import {
  buildMeExport,
  deleteUserData,
  getUserPreferences,
  upsertUserPreferences,
} from "../modules/me/dataRights.js";
import { getUserProfile, upsertUserProfile } from "../modules/me/profile.js";
import { mirrorProfileMemoryEntries } from "../modules/ai-memory/profileMirror.js";

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
    "/api/me/export",
    requireSession(),
    async (req: Request, res: Response) => {
      const user = serializeMeUser(
        (req as Request & { user: AuthedUser }).user,
      );
      const payload = MeExportResponseSchema.parse(
        await buildMeExport(pool, user),
      );
      res.json(payload);
    },
  );

  r.get(
    "/api/me/preferences",
    requireSession(),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      const payload = UserPreferencesSchema.parse(
        await getUserPreferences(pool, user.id),
      );
      res.json(payload);
    },
  );

  r.patch(
    "/api/me/preferences",
    requireSession(),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      const patch = parseBody(UserPreferencesPatchSchema, req);
      const payload = UserPreferencesSchema.parse(
        await upsertUserPreferences(pool, user.id, patch),
      );
      res.json(payload);
    },
  );

  // Write-through профіль/біометрія (migration 115) — НЕ oplog-sync,
  // звичайний GET/PUT upsert по user_id (див. modules/me/profile.ts).
  r.get(
    "/api/me/profile",
    requireSession(),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      const payload = UserProfileResponseSchema.parse(
        await getUserProfile(pool, user.id),
      );
      res.json(payload);
    },
  );

  r.put(
    "/api/me/profile",
    // L-8 Фаза 2 (2026-08-09). Цей роут перестав бути дешевим upsert-ом:
    // після дзеркалення він кладе в чергу інжесту до
    // `PROFILE_MEMORY_MAX_ENTRIES` (200) job-ів, кожен з яких — окремий
    // Voyage-ембеддинг. Тобто це рівно той «дорогий шлях», який
    // `routes/ai-memory.ts` захищає своїм `heavyRateLimit` із коментарем
    // «черга ingest-у + Voyage-ембеддинги».
    //
    // Дифу самого по собі мало: незмінний профіль справді no-op-ить, але
    // скрипт, що щоразу МІНЯЄ текст фактів, змушує ембедити наново на
    // кожному запиті. `me` лишався єдиним роутером репо взагалі без
    // лімітера (решта вісімнадцяти файлів у `routes/` його мають), і саме
    // ця зміна зробила прогалину дорогою.
    //
    // 60/5хв — свідомо щедріше за `heavyRateLimit` (30/5хв): веб пушить
    // профіль після КОЖНОГО локального редагування біометрії чи банку
    // памʼяті (`profileWriteThrough.ts`), тож людина, яка правит кілька
    // полів поспіль, легко дає десяток запитів за хвилину і не має
    // впертись у стелю. Скрипт — впреться.
    rateLimitExpress({
      key: "api:me:profile",
      limit: 60,
      windowMs: 5 * 60_000,
    }),
    requireSession(),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      const body = parseBody(UserProfilePutBodySchema, req);
      const payload = UserProfileResponseSchema.parse(
        await upsertUserProfile(pool, user.id, body.profile),
      );
      // L-8 Фаза 2 (2026-08-09): дзеркалимо `memoryBank`-факти в
      // `ai_memories` (source='profile') ПІСЛЯ успішного upsert-у профілю.
      // Побічний ефект, best-effort — `mirrorProfileMemoryEntries` НІКОЛИ
      // не кидає (Voyage down / circuit open / AI_MEMORY_ENABLED=false /
      // вимкнений консент усі no-op-ляться всередині), тож профіль уже
      // збережено і відповідь 200 не залежить від результату дзеркалення.
      await mirrorProfileMemoryEntries(pool, user.id, body.profile);
      res.json(payload);
    },
  );

  r.delete("/api/me", requireSession(), async (req: Request, res: Response) => {
    const user = (req as Request & { user: AuthedUser }).user;
    const payload = MeDeleteResponseSchema.parse(
      await deleteUserData(pool, user.id),
    );
    res.json(payload);
  });

  r.get("/api/me", requireSession(), async (req: Request, res: Response) => {
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
      user: serializeMeUser(user),
    });
    res.json(payload);
  });
  return r;
}

function serializeMeUser(user: AuthedUser): MeResponse["user"] {
  return {
    id: user.id,
    email: user.email || null,
    name: user.name ?? null,
    image: user.image ?? null,
    emailVerified: Boolean(user.emailVerified),
    createdAt: toIsoOrNull(user.createdAt),
  };
}
