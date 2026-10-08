/**
 * rel-12: що чистити. `"user"` (за замовчуванням) — кеші з даними користувача
 * (`navigations-*`, `api-cache-*`, метадані партиції); `"all"` — ще й precache
 * та ілюстрації вправ (лише ручне «Скинути кеш PWA» разом зі зняттям SW).
 */
export type SwClearScope = "user" | "all";

type SwRequest =
  | { type: "SW_DEBUG"; data?: { requestId: string } }
  | {
      type: "CLEAR_SW_CACHES";
      data?: { requestId: string; scope?: SwClearScope };
    }
  | { type: "SW_SET_DEBUG"; data?: { enabled: boolean } }
  | { type: "SW_SET_USER"; data?: { userKey: string | null } };

type SwResponse =
  | { type: "SW_DEBUG_RESULT"; requestId?: string | null; snapshot?: unknown }
  | {
      type: "CLEAR_SW_CACHES_RESULT";
      requestId?: string | null;
      result?: unknown;
    };

function makeRequestId(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto.randomUUID()}`;
}

/**
 * Ceiling on `navigator.serviceWorker.ready` (ms).
 *
 * `ready` is a promise that resolves only once a service worker is
 * **active for this scope** — and it never rejects and never times out on
 * its own. With no SW registered (dev server, private mode, a failed or
 * unregistered registration) it simply never settles, so every `await`
 * behind it wedges its whole call chain forever.
 *
 * That is how logout used to hang: `AuthContext.logout` awaited
 * `swClearCaches()` → `serviceWorker.ready`, the server session was
 * already destroyed, and the UI stayed rendered as the signed-in user
 * with no redirect and a spinner that never stopped (аудит 2026-08-04,
 * знахідка 4). The per-message timeout inside `requestSw` did not help —
 * it only starts after `ready` resolves.
 *
 * 2 s is generous for an already-installed SW (`ready` resolves on the
 * microtask queue) while keeping a no-SW environment snappy.
 */
const SW_READY_TIMEOUT_MS = 2000;

/**
 * `navigator.serviceWorker.ready` bounded by {@link SW_READY_TIMEOUT_MS}.
 * Rejects instead of hanging when no service worker ever activates.
 */
async function swReady(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("serviceWorker.ready timeout")),
          SW_READY_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function postToSw(msg: SwRequest): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  // Fire-and-forget, so this must satisfy BOTH halves of the contract:
  //
  //   * never block the caller — `ready` can hang forever (see
  //     {@link SW_READY_TIMEOUT_MS}), and callers like
  //     `AuthContext.logout` await this on a critical path;
  //   * never DROP the message — a cold first load can take several
  //     seconds to install and activate a worker, and the partition hint
  //     (`SW_SET_USER`) must still land when it finally does, otherwise
  //     the SW keeps keying cache entries as `anon` for the whole session.
  //
  // Hence: resolve immediately, post whenever `ready` settles. Bounding
  // this one with a timeout would trade the hang for a silent drop.
  void navigator.serviceWorker.ready
    .then((reg) => {
      const ctl = navigator.serviceWorker.controller || reg.active;
      ctl?.postMessage?.(msg);
    })
    .catch(() => {
      /* no worker ever activates — nothing to hint at */
    });
}

async function requestSw<T extends SwResponse["type"]>(
  msg: SwRequest,
  expectType: T,
  requestId: string,
  timeoutMs = 3000,
): Promise<Extract<SwResponse, { type: T }>> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("serviceWorker unsupported");
  }
  await swReady();

  return await new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("SW request timeout"));
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as SwResponse | undefined;
      if (!data || data.type !== expectType) return;
      if ((data.requestId || null) !== requestId) return;
      if (done) return;
      done = true;
      cleanup();
      resolve(data as Extract<SwResponse, { type: T }>);
    };

    const cleanup = () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    void postToSw(msg).catch((err) => {
      if (done) return;
      done = true;
      cleanup();
      reject(err);
    });
  });
}

export async function swSetDebug(enabled: boolean) {
  await postToSw({ type: "SW_SET_DEBUG", data: { enabled } });
}

export async function swGetDebugSnapshot() {
  const requestId = makeRequestId("sw_debug");
  const res = await requestSw(
    { type: "SW_DEBUG", data: { requestId } },
    "SW_DEBUG_RESULT",
    requestId,
    4000,
  );
  return res.snapshot;
}

/**
 * Audit 03 / Decision #2 (C): partition runtime cache keys per user.
 *
 * Posts the current Better Auth opaque user id (or `null` on logout) to
 * the service worker. The SW stores it in module-scope and the
 * `cacheKeyWillBeUsed` plugin on the API + navigation routes prepends it
 * to the cache key so user A's responses never resolve user B's requests.
 *
 * Fire-and-forget: no response is required. SW зберігає хеш у `sw-meta`
 * (переживає idle-kill, priv-08); поки ключа немає (`anon`), runtime-кеш
 * `/api/*` вимкнений, тож відкат на `__u=anon` не віддає чужих даних.
 * `signOut` додатково чистить кеші як основну межу.
 */
export async function swSetActiveUser(userKey: string | null) {
  await postToSw({ type: "SW_SET_USER", data: { userKey } });
}

export async function swClearCaches(scope: SwClearScope = "user") {
  const requestId = makeRequestId("sw_clear");
  const res = await requestSw(
    { type: "CLEAR_SW_CACHES", data: { requestId, scope } },
    "CLEAR_SW_CACHES_RESULT",
    requestId,
    6000,
  );
  return res.result;
}

/**
 * priv-08: повторно надсилає активного користувача, коли сторінку почав
 * контролювати інший воркер (`controllerchange`: перший SW після install,
 * оновлення версії). Новий воркер міг стартувати без збереженого ключа, а
 * `SW_SET_USER` в AuthContext шлеться лише на зміну `user.id`.
 * Повертає функцію відписки.
 */
export function onSwControllerChange(handler: () => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return () => {};
  }
  const sw = navigator.serviceWorker;
  if (!sw || typeof sw.addEventListener !== "function") return () => {};
  sw.addEventListener("controllerchange", handler);
  return () => sw.removeEventListener("controllerchange", handler);
}
