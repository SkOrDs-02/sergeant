import { APIError, getAuthoritativeSessionFromCtx } from "better-auth/api";

/**
 * Хуки Better Auth, що закривають два шляхи подовження/витоку сесії
 * (аудит 2026-10-01, кластери `sec-02` і `sec-05`). Живуть окремим модулем,
 * щоб тест міг підключити їх до справжнього `betterAuth()` на memory-адаптері
 * без env і Postgres (див. `sessionHardeningHooks.test.ts`).
 *
 * Типи контексту навмисно вузькі: `createAuthMiddleware` в `auth.ts` віддає
 * повний контекст, а ці функції читають із нього лише те, що перелічено нижче.
 */

interface HookCtx {
  path?: string;
  body?: unknown;
  context?: unknown;
}

/**
 * `sec-02`. `POST /update-user` стоїть на `sessionMiddleware`, тобто бере
 * сесію з підписаного `session_data` (cookieCache, 5 хв) без звернення до БД
 * і через `setSessionCookie` перевипускає цей кеш ще на 5 хв. Відкликана
 * сесія (вихід, «вийти з інших пристроїв», зміна пароля) тим самим жила до
 * кінця 7-денного TTL: достатньо раз на <5 хв викликати `/update-user`.
 *
 * Резолвимо сесію з БД (`disableCookieCache`) ДО ендпоінта. Немає рядка в БД:
 * 401. Є: `ctx.context.session` уже свіжий, і `sessionMiddleware` ендпоінта
 * бере його, а не кеш.
 *
 * `/revoke-session` приймає `{ id }`: сирий `token` більше не віддається
 * клієнту (`sec-05`), тож id перетворюється на token тут, лише серед сесій
 * ПОТОЧНОГО користувача. Старий формат `{ token }` лишається робочим.
 */
export async function hardenSessionBefore(ctx: HookCtx): Promise<void> {
  if (ctx.path === "/update-user") {
    await requireDbSession(ctx);
    return;
  }
  if (ctx.path === "/revoke-session") {
    const body = ctx.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return;
    const record = body as Record<string, unknown>;
    if (typeof record["token"] === "string") return;
    const id = record["id"];
    if (typeof id !== "string") return;
    const session = await requireDbSession(ctx);
    const authCtx = ctx.context as {
      internalAdapter: {
        listSessions: (
          userId: string,
        ) => Promise<Array<{ id: string; token: string }>>;
      };
    };
    const own = await authCtx.internalAdapter.listSessions(session.user.id);
    // Чужий або неіснуючий id: порожній token, `findSession("")` нічого не
    // знайде, і ендпоінт, як і раніше, віддасть `{ status: true }`.
    record["token"] = own.find((s) => s.id === id)?.token ?? "";
    delete record["id"];
  }
}

async function requireDbSession(
  ctx: HookCtx,
): Promise<{ user: { id: string } }> {
  const fresh = await getAuthoritativeSessionFromCtx(
    ctx as Parameters<typeof getAuthoritativeSessionFromCtx>[0],
  );
  if (!fresh?.session) {
    throw new APIError("UNAUTHORIZED", { message: "Unauthorized" });
  }
  return { user: { id: fresh.user.id } };
}

/**
 * `sec-05`. `/get-session` і кожен елемент `/list-sessions` віддавали сирий
 * `session.token` (з токенами ВСІХ пристроїв). Плагін `bearer()` без
 * `requireSignature` приймає його як `Authorization: Bearer`, тож будь-яке
 * читання відповіді (XSS, CORS) давало довгоживучий креденшел поза браузером.
 * Веб працює на httpOnly-куці, а нативні клієнти беруть підписане значення з
 * заголовка `set-auth-token` / cookie при вході, тому з цих відповідей токени
 * просто прибираємо.
 *
 * Мутуємо `ctx.context.returned` на місці: після-хуки Better Auth віддають
 * саме цей обʼєкт. Помилки (`APIError`) і не-обʼєкти не чіпаємо.
 */
export function stripSessionTokenAfter(ctx: HookCtx): void {
  if (ctx.path !== "/get-session" && ctx.path !== "/list-sessions") return;
  const returned = (ctx.context as { returned?: unknown } | undefined)
    ?.returned;
  if (!returned || typeof returned !== "object") return;
  if (returned instanceof Response || returned instanceof APIError) return;
  if (Array.isArray(returned)) {
    for (const item of returned) stripToken(item);
    return;
  }
  stripToken((returned as { session?: unknown }).session);
}

function stripToken(item: unknown): void {
  if (item && typeof item === "object" && "token" in item) {
    delete (item as Record<string, unknown>)["token"];
  }
}
