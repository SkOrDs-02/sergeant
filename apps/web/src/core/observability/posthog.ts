/**
 * @status Active
 * @owner @Skords-01
 */
import {
  getPlatform,
  isCapacitor,
  redactSensitiveQueryParams,
  scrubPIIString,
  SENSITIVE_QUERY_PARAM_NAMES,
} from "@sergeant/shared";
import { resolveDeployEnvironment } from "./deployEnvironment.js";
import {
  getAnalyticsConsent,
  subscribeAnalyticsConsent,
} from "./analyticsConsent";

/**
 * Lazy PostHog transport for product analytics.
 *
 * Навмисно через динамічний `import()`, щоб SDK (~50 KB gzip) не потрапляв
 * у головний бандл — аналітика не повинна блокувати hydration (той самий
 * pattern, що й для Sentry у `sentry.ts`).
 *
 * Без `VITE_POSTHOG_KEY` — повний no-op: `posthog-js` не підтягується,
 * події продовжують логуватися тільки через `analytics.ts` localStorage
 * ring-buffer.
 *
 * Контракт:
 *   - `initPostHog()` — викликається один раз після hydration з
 *     `main.tsx` через `requestIdleCallback`. Ідемпотентний.
 *   - `capturePostHogEvent(name, payload)` — fire-and-forget. Події, які
 *     прилетіли ДО завершення init, буферизуються і flush-ються після.
 *   - `identifyPostHogUser(userId)` / `resetPostHog()` — після login /
 *     logout з `AuthContext`. Теж fire-and-forget, теж буферизуються.
 */

type PostHogLib = typeof import("posthog-js").default;

type QueuedCall =
  | { kind: "capture"; name: string; payload: Record<string, unknown> }
  | {
      kind: "identify";
      userId: string;
      traits?: Record<string, unknown> | undefined;
    }
  | { kind: "reset" }
  | {
      kind: "exception";
      error: unknown;
      properties: Record<string, unknown>;
    };

/**
 * Structural subset of posthog-js `CaptureResult` that
 * `applyPostHogBeforeSend` touches. Declared locally (rather than
 * importing `CaptureResult` from `@posthog/types`) for the same reason
 * `sentry.ts` declares `WebBeforeSendEvent`: the helper must stay
 * unit-testable without pulling SDK types, and a real `CaptureResult`
 * stays structurally assignable so the `before_send` call-site needs no
 * cast.
 */
export interface PostHogBeforeSendEvent {
  properties?: Record<string, unknown>;
}

/**
 * Event properties that carry a URL. PostHog attaches `$current_url` to
 * every event, and magic-link / OAuth callbacks are the usual leak
 * surface (`?token=`, `?code=`) — same reasoning as the
 * `redactSensitiveQueryParams` call in `sentry.ts`'s `applyWebBeforeSend`.
 */
const URL_PROPERTY_KEYS = ["$current_url", "$referrer", "$pathname"] as const;

/**
 * Machine-generated exception strings. Unlike free-text, a PII pattern
 * hit here is almost always a real leak (a token in a failing request
 * URL, an email in a validation error), so string-scrubbing them is
 * worth the false-positive risk — mirrors `applyWebBeforeSend` §P0-S3.
 */
const EXCEPTION_STRING_KEYS = [
  "$exception_message",
  "$exception_type",
] as const;

function scrubExceptionEntry(entry: unknown): void {
  if (!entry || typeof entry !== "object") return;
  const record = entry as Record<string, unknown>;
  for (const key of ["value", "type"]) {
    const value = record[key];
    if (typeof value === "string") record[key] = scrubPIIString(value);
  }
  const stacktrace = record["stacktrace"];
  if (!stacktrace || typeof stacktrace !== "object") return;
  const frames = (stacktrace as Record<string, unknown>)["frames"];
  if (!Array.isArray(frames)) return;
  for (const frame of frames) {
    if (!frame || typeof frame !== "object") continue;
    const frameRecord = frame as Record<string, unknown>;
    const filename = frameRecord["filename"];
    if (typeof filename === "string") {
      frameRecord["filename"] = redactSensitiveQueryParams(filename);
    }
  }
}

/**
 * PostHog counterpart of `applyWebBeforeSend` (`./sentry.ts`).
 *
 * Replaces the previous `sanitize_properties` hook, which posthog-js
 * marks deprecated and — more importantly — logs a `console.error`
 * through on EVERY captured event once set, so the old wiring was
 * emitting deprecation noise in production on every `trackEvent`.
 *
 * Mutates in place and returns the same object (the SDK contract allows
 * returning `null` to drop an event; we never drop).
 */
export function applyPostHogBeforeSend<T extends PostHogBeforeSendEvent | null>(
  captureResult: T,
): T {
  const properties = captureResult?.properties;
  if (!properties) return captureResult;

  // Never ship cookies — carried over from the previous sanitizer.
  delete properties["$cookies"];

  for (const key of URL_PROPERTY_KEYS) {
    const value = properties[key];
    if (typeof value === "string") {
      properties[key] = redactSensitiveQueryParams(value);
    }
  }
  for (const key of EXCEPTION_STRING_KEYS) {
    const value = properties[key];
    if (typeof value === "string") properties[key] = scrubPIIString(value);
  }
  // `$exception_list` — one entry per chained cause, each with its own
  // message and stack frames.
  const exceptionList = properties["$exception_list"];
  if (Array.isArray(exceptionList)) {
    for (const entry of exceptionList) scrubExceptionEntry(entry);
  }

  return captureResult;
}

/**
 * Replay пише URL мережевих записів і навігацій (Meta, `$url_changed`) у
 * поле `name`; SDK пропускає його через цю функцію перед записом.
 */
export function maskReplayNetworkRequest<T extends { name: string }>(
  request: T,
): T {
  return { ...request, name: redactSensitiveQueryParams(request.name) };
}

let posthogModule: PostHogLib | null = null;
let initPromise: Promise<void> | null = null;
let initFailed = false;
let queue: QueuedCall[] = [];
let lastIdentify: {
  userId: string;
  traits?: Record<string, unknown> | undefined;
} | null = null;
let consentSubscribed = false;
// Останній стан, який ми виставили SDK (`null` — SDK ще не вирівняний або
// його стан скинув `reset()`). Гасить повторні opt_in/identify на кожну
// гідрацію з сервера.
let appliedConsent: boolean | null = null;

const MAX_QUEUE = 100;

function flushQueue() {
  if (!posthogModule) return;
  const drained = queue;
  queue = [];
  for (const call of drained) {
    try {
      if (call.kind === "capture") {
        posthogModule.capture(call.name, call.payload);
      } else if (call.kind === "identify") {
        lastIdentify = { userId: call.userId, traits: call.traits };
        posthogModule.identify(call.userId, call.traits);
      } else if (call.kind === "exception") {
        posthogModule.captureException(call.error, call.properties);
      } else {
        lastIdentify = null;
        posthogModule.reset();
        appliedConsent = null;
        applyConsent();
      }
    } catch {
      /* noop — аналітика не повинна падати */
    }
  }
}

/**
 * Синхронізує SDK зі згодою (`analyticsConsent.ts`, єдине джерело правди).
 * SDK стартує з `opt_out_capturing_by_default: true`, тож до `opt_in` не
 * летить нічого — ні події, ні `$exception`, ні heatmap/replay.
 *
 * `identify` під opt-out не доходить до сервера, тому після згоди
 * повторюємо останній: інакше події лишились би анонімними до наступного
 * логіну.
 */
function applyConsent() {
  if (!posthogModule) return;
  const granted = getAnalyticsConsent();
  if (appliedConsent === granted) return;
  try {
    if (granted) {
      posthogModule.opt_in_capturing({ captureEventName: false });
      if (lastIdentify) {
        posthogModule.identify(lastIdentify.userId, lastIdentify.traits);
      }
    } else {
      posthogModule.opt_out_capturing();
    }
    // Лише після успіху SDK: інакше збій лишив би `appliedConsent`
    // «застосованим», і наступний виклик не повторив би спробу.
    appliedConsent = granted;
  } catch {
    /* noop — аналітика не повинна падати */
  }
}

function enqueue(call: QueuedCall) {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(call);
}

/**
 * Ініціалізує PostHog. Ідемпотентний — повторні виклики повертають той
 * самий promise. Якщо `VITE_POSTHOG_KEY` не виставлений — resolve без
 * завантаження SDK (no-op).
 */
export function initPostHog(): Promise<void> {
  if (initPromise) return initPromise;

  const key = import.meta.env["VITE_POSTHOG_KEY"];
  if (!key) {
    initPromise = Promise.resolve();
    return initPromise;
  }

  const host =
    import.meta.env["VITE_POSTHOG_HOST"] || "https://eu.i.posthog.com";

  initPromise = (async () => {
    try {
      const mod = await import("posthog-js");
      const posthog = mod.default;
      posthog.init(key, {
        api_host: host,
        // Згода на аналітику (рішення власника 2026-09-29): до явного
        // «Дозволити» SDK нічого не захоплює. Стан opt-in/out SDK
        // запамʼятовує сам, а `applyConsent` нижче вирівнює його з
        // `analyticsConsent.ts` при кожному старті.
        opt_out_capturing_by_default: true,
        // Без цього SDK пише `ph_<token>_posthog` з distinct_id ще до згоди:
        // opt-out вище гасить лише відправку. Політика cookies обіцяє, що
        // ідентифікатора немає, доки відповіді немає або вона «Ні».
        opt_out_persistence_by_default: true,
        // URL сторінки SDK кладе не лише у верхньорівневий `$current_url`
        // (його чистить `before_send`), а й у ключі `$heatmap_data`,
        // `$web_vitals_*_event.$current_url` і href у replay. Маскування
        // SDK покриває всі ці шляхи; список чутливих параметрів спільний
        // із Sentry.
        mask_personal_data_properties: true,
        custom_personal_data_properties: [...SENSITIVE_QUERY_PARAM_NAMES],
        // Канали нижче інакше вмикає тумблер проєкту в PostHog (remote
        // config) без жодного коміту: console-логи в replay, `$dead_click`
        // з текстом елемента, опитування, network timing з URL кожного
        // запиту (`/api/food-search?q=…`).
        enable_recording_console_log: false,
        capture_dead_clicks: false,
        disable_surveys: true,
        capture_performance: { web_vitals: true, network_timing: false },
        // Explicit events only — не дублюємо з автокаптуром/пейджвʼю,
        // бо `trackEvent` вже покриває все, що нас цікавить, а payload
        // контролюється централізовано (без PII).
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        // Persist тільки для залогінених — анонімні відвідувачі не
        // створюють person profile у PostHog (лишає free-tier events).
        person_profiles: "identified_only",
        // Error tracking. Свідомо ЄДИНИЙ автокаптур, який лишається
        // увімкненим попри `autocapture: false` вище: краші не можна
        // зібрати явними викликами — `window.onerror` і
        // `unhandledrejection` за визначенням спрацьовують там, де
        // коду вже нема кому виконати `trackEvent`.
        //
        // Без цього прапорця значення резолвиться з remote config
        // (тобто з налаштувань проєкту в PostHog), і поки там вимкнено —
        // жодної `$exception` події не надходить. Ставимо явно, щоб
        // збір не залежав від стану серверного тумблера.
        //
        // `capture_console_errors` лишається на дефолтному `false`:
        // console.error шумний і дублює те, що вже йде через Sentry.
        capture_exceptions: {
          capture_unhandled_errors: true,
          capture_unhandled_rejections: true,
        },
        // Heatmaps — другий і останній виняток із `autocapture: false`.
        //
        // Шле окремі `$$heatmap` події з КООРДИНАТАМИ кліків і глибиною
        // скролу, агрегованими по `$current_url`. Це принципово не те саме,
        // що autocapture: DOM-вміст, текст елементів і значення полів не
        // збираються, тож PII-поверхня не зростає.
        //
        // Навіщо: воронка бети губить ~81% людей між входом у застосунок і
        // стартом онбордингу. Подієва телеметрія каже «пішли», але не каже
        // «куди тицяли перед тим» — heatmap на Hub і лендінгу відповідає
        // саме на це, і, на відміну від session replay, не записує екран
        // користувача.
        enable_heatmaps: true,
        // Session replay — вмикається СВІДОМО і з максимальним маскуванням.
        //
        // AI-DANGER: це запис екрана реальних людей. Sergeant тримає гроші,
        // харчові щоденники й травми — тобто дані про здоровʼя, які GDPR
        // відносить до особливої категорії. Тому обидва маскування нижче
        // НЕ послаблювати без явного рішення власника і оновлення
        // політики приватності.
        //
        //   - `maskAllInputs: true` — жодне значення поля вводу не пишеться
        //     (суми, ваги, назви страв, паролі).
        //   - `maskTextSelector: "*"` — увесь текстовий вміст сторінки
        //     замінюється заглушками. Атрибутів це НЕ стосується: rrweb
        //     копіює `aria-label`, `title`, `alt` як є, а там суми, імена
        //     боржників, назви активів і продуктів.
        //   - `blockSelector` — тому вузли з цими атрибутами пишуться
        //     плейсхолдером розміру елемента, без вмісту й атрибутів.
        //
        // У записі лишається геометрія: розкладка, кліки, скрол, переходи
        // між екранами, час на екрані. Тобто відповідь на «де людина
        // застрягла» лишається, а «що саме в неї написано» — ні. Це рівно
        // те, що потрібно для дірки «176 зайшли → 34 почали онбординг».
        //
        // `blockClass` лишається дефолтним `ph-no-capture`: навісь його на
        // будь-який вузол, який не має потрапляти в запис навіть замаскованим.
        //
        // Тіла й заголовки запитів і canvas прибиті явно: без значення
        // клієнта їх вмикає remote config.
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "*",
          blockSelector: "[aria-label],[title],[alt]",
          recordBody: false,
          recordHeaders: false,
          captureCanvas: { recordCanvas: false },
          maskCapturedNetworkRequestFn: maskReplayNetworkRequest,
        },
        // PII-скраб — див. `applyPostHogBeforeSend` вище. Раніше тут
        // стояв `sanitize_properties`; posthog-js вважає його
        // deprecated і логує `console.error` на КОЖНІЙ події.
        before_send: (captureResult) => applyPostHogBeforeSend(captureResult),
      });

      posthog.register({
        platform: getPlatform(),
        is_capacitor: isCapacitor(),
        // Середовище, з якого прилетіла подія. Ключ PostHog свідомо один
        // на всі середовища — інакше воронка «лендінг → бот → реєстрація»
        // розпалась би на кілька незведених проєктів. Ціна цього рішення —
        // події закритої бети незрізняються від прод-подій, якщо їх нічим
        // не позначити; ця властивість і є позначкою.
        //
        // Резолвиться спільним хелпером — тим самим, що читає `sentry.ts`.
        // Покладатись лише на `VITE_APP_ENV` тут було не можна: Vercel віддає
        // preview-збіркам env-vars основного деплою, тож гілкові URL-и
        // приходили в цей проєкт із чужою міткою `beta`. Хост preview
        // успадкувати не може, тому він і вирішує. Див. `deployEnvironment.ts`.
        environment: resolveDeployEnvironment(),
      });

      posthogModule = posthog;
      applyConsent();
      if (!consentSubscribed) {
        consentSubscribed = true;
        subscribeAnalyticsConsent(applyConsent);
      }
      flushQueue();
    } catch {
      // SDK не завантажився — лишаємось у true no-op режимі. Події з
      // queue відкидаємо, а флаг `initFailed` блокує подальші enqueue,
      // щоб `capture/identify/reset` не churn-или shift() по MAX_QUEUE
      // до кінця сесії (див. огляд Devin Review на #972).
      initFailed = true;
      queue = [];
    }
  })();

  return initPromise;
}

/**
 * Fire-and-forget відправка події в PostHog. До завершення init
 * буферизує (до `MAX_QUEUE` подій). Якщо ENV не виставлений —
 * повний no-op.
 */
export function capturePostHogEvent(
  name: string,
  payload: Record<string, unknown> = {},
): void {
  if (!name) return;
  if (posthogModule) {
    try {
      posthogModule.capture(name, payload);
    } catch {
      /* noop */
    }
    return;
  }
  // Без VITE_POSTHOG_KEY initPromise resolve-иться без SDK, і якщо
  // динамічний `import()` впав — `initFailed === true`. У цих випадках
  // не буферизуємо: flushQueue ніхто вже не викличе, queue росла б
  // безцільно (навіть за умови bounded-shift у enqueue).
  if (!import.meta.env["VITE_POSTHOG_KEY"]) return;
  if (initFailed) return;
  enqueue({ kind: "capture", name, payload });
}

/**
 * Fire-and-forget відправка винятку в PostHog error tracking.
 *
 * Доповнює автокаптур (`capture_exceptions` у `initPostHog`), який ловить
 * лише `window.onerror` / `unhandledrejection`. React-помилки рендеру туди
 * НЕ доходять: React ловить їх сам і віддає в `componentDidCatch`, тож
 * `ErrorBoundary` форвардить їх сюди явно — так само, як уже робить для
 * Sentry.
 *
 * Семантика буферизації та no-op-режиму — рівно як у
 * `capturePostHogEvent`.
 */
export function capturePostHogException(
  error: unknown,
  properties: Record<string, unknown> = {},
): void {
  if (posthogModule) {
    try {
      posthogModule.captureException(error, properties);
    } catch {
      /* noop */
    }
    return;
  }
  if (!import.meta.env["VITE_POSTHOG_KEY"]) return;
  if (initFailed) return;
  enqueue({ kind: "exception", error, properties });
}

/**
 * Привʼязує всі наступні events до конкретного userId. Викликається з
 * `AuthContext` при переході у стан `authenticated`.
 */
export function identifyPostHogUser(
  userId: string,
  traits?: Record<string, unknown>,
): void {
  if (!userId) return;
  lastIdentify = { userId, traits };
  if (posthogModule) {
    try {
      posthogModule.identify(userId, traits);
    } catch {
      /* noop */
    }
    return;
  }
  if (!import.meta.env["VITE_POSTHOG_KEY"]) return;
  if (initFailed) return;
  enqueue({ kind: "identify", userId, traits });
}

/**
 * Очищає distinctId і person properties — викликається при logout,
 * щоб наступна сесія не атрибутувалась попередньому юзеру.
 */
export function resetPostHog(): void {
  lastIdentify = null;
  if (posthogModule) {
    try {
      posthogModule.reset();
      appliedConsent = null;
      applyConsent();
    } catch {
      /* noop */
    }
    return;
  }
  if (!import.meta.env["VITE_POSTHOG_KEY"]) return;
  if (initFailed) return;
  enqueue({ kind: "reset" });
}
