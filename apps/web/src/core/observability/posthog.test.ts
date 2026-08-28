// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Тести навколо `posthog.ts` transport:
 *   1. Без `VITE_POSTHOG_KEY` — init = no-op, жодних SDK-викликів,
 *      капчер/ідентифай/ресет теж no-op (без буферизації).
 *   2. З ключем — `init` передає очікувані опції, `capture/identify/reset`
 *      викликаються на модулі.
 *   3. Події, що прилетіли ДО завершення init, буферизуються і flush-ляться
 *      після завантаження SDK.
 *
 * `posthog-js` повністю замокано — без мережі, без реального SDK.
 */

const posthogInit = vi.fn();
const posthogCapture = vi.fn();
const posthogIdentify = vi.fn();
const posthogReset = vi.fn();
const posthogRegister = vi.fn();
const posthogCaptureException = vi.fn();

vi.mock("posthog-js", () => ({
  default: {
    init: posthogInit,
    capture: posthogCapture,
    identify: posthogIdentify,
    reset: posthogReset,
    register: posthogRegister,
    captureException: posthogCaptureException,
  },
}));

const isCapacitorMock = vi.fn<() => boolean>();
const getPlatformMock = vi.fn<() => "ios" | "android" | "web">();

vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return {
    ...actual,
    isCapacitor: () => isCapacitorMock(),
    getPlatform: () => getPlatformMock(),
  };
});

/**
 * `environment` резолвиться з хоста (`deployEnvironment.ts`), а не лише з
 * env-var — бо preview-деплої на Vercel успадковують змінні основного деплою.
 * jsdom за замовчуванням віддає `localhost`, тобто `development`, тож тести
 * про прод/бету мусять явно задати канонічний хост.
 */
function stubHostname(hostname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, hostname },
  });
}

beforeEach(() => {
  stubHostname("sergeant.vercel.app");
  vi.resetModules();
  posthogInit.mockReset();
  posthogCapture.mockReset();
  posthogIdentify.mockReset();
  posthogReset.mockReset();
  posthogRegister.mockReset();
  posthogCaptureException.mockReset();
  isCapacitorMock.mockReset().mockReturnValue(false);
  getPlatformMock.mockReset().mockReturnValue("web");
  vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
  vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("initPostHog", () => {
  it("ініціалізує SDK з EU host і реєструє platform super-property", async () => {
    const mod = await import("./posthog");
    await mod.initPostHog();

    expect(posthogInit).toHaveBeenCalledTimes(1);
    const [key, opts] = posthogInit.mock.calls[0]!;
    expect(key).toBe("phc_test_key");
    expect(opts).toMatchObject({
      api_host: "https://eu.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      person_profiles: "identified_only",
    });

    expect(posthogRegister).toHaveBeenCalledWith({
      platform: "web",
      is_capacitor: false,
      environment: "production",
    });
  });

  it("бере environment із VITE_APP_ENV, щоб бета не зливалась із продом", async () => {
    stubHostname("beta-tau-gilt.vercel.app");
    vi.stubEnv("VITE_APP_ENV", "beta");
    const mod = await import("./posthog");
    await mod.initPostHog();

    expect(posthogRegister).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "beta" }),
    );
  });

  // Регресія аудиту 2026-08-16: Vercel віддає preview-збіркам env-vars
  // основного деплою, тож гілкові хости приходили в прод-проєкт із міткою
  // `beta` і мішались із реальними подіями. Хост має бити env-var.
  it("позначає preview-хост як preview попри успадкований VITE_APP_ENV", async () => {
    stubHostname("beta-git-codex-nutrition-skords-01s-projects.vercel.app");
    vi.stubEnv("VITE_APP_ENV", "beta");
    const mod = await import("./posthog");
    await mod.initPostHog();

    expect(posthogRegister).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "preview" }),
    );
  });

  it("дефолтний host — EU, якщо VITE_POSTHOG_HOST не виставлений", async () => {
    vi.stubEnv("VITE_POSTHOG_HOST", "");
    const mod = await import("./posthog");
    await mod.initPostHog();

    expect(posthogInit.mock.calls[0]![1]).toMatchObject({
      api_host: "https://eu.i.posthog.com",
    });
  });

  it("ідемпотентний — повторні виклики не переініціалізовують SDK", async () => {
    const mod = await import("./posthog");
    await mod.initPostHog();
    await mod.initPostHog();
    await mod.initPostHog();

    expect(posthogInit).toHaveBeenCalledTimes(1);
  });

  it("без VITE_POSTHOG_KEY — повний no-op, SDK не підтягується", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    const mod = await import("./posthog");
    await mod.initPostHog();

    expect(posthogInit).not.toHaveBeenCalled();
    expect(posthogRegister).not.toHaveBeenCalled();
  });

  it("тегує реальну натив-платформу в Capacitor WebView", async () => {
    isCapacitorMock.mockReturnValue(true);
    getPlatformMock.mockReturnValue("ios");
    const mod = await import("./posthog");
    await mod.initPostHog();

    expect(posthogRegister).toHaveBeenCalledWith({
      platform: "ios",
      is_capacitor: true,
      environment: "production",
    });
  });
});

describe("capturePostHogEvent", () => {
  it("після init — викликає posthog.capture з name та payload", async () => {
    const mod = await import("./posthog");
    await mod.initPostHog();
    mod.capturePostHogEvent("test_event", { foo: "bar" });

    expect(posthogCapture).toHaveBeenCalledWith("test_event", { foo: "bar" });
  });

  it("буферизує події до завершення init і flush-ить після", async () => {
    const mod = await import("./posthog");
    // Не чекаємо на init — відразу викликаємо capture.
    mod.capturePostHogEvent("early_event_1", { n: 1 });
    mod.capturePostHogEvent("early_event_2", { n: 2 });
    expect(posthogCapture).not.toHaveBeenCalled();

    await mod.initPostHog();

    expect(posthogCapture).toHaveBeenCalledTimes(2);
    expect(posthogCapture).toHaveBeenNthCalledWith(1, "early_event_1", {
      n: 1,
    });
    expect(posthogCapture).toHaveBeenNthCalledWith(2, "early_event_2", {
      n: 2,
    });
  });

  it("без VITE_POSTHOG_KEY — ні capture, ні буферизація", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    const mod = await import("./posthog");
    mod.capturePostHogEvent("x", { y: 1 });
    await mod.initPostHog();

    expect(posthogCapture).not.toHaveBeenCalled();
  });

  it("ігнорує порожнє імʼя події", async () => {
    const mod = await import("./posthog");
    await mod.initPostHog();
    mod.capturePostHogEvent("", { foo: "bar" });

    expect(posthogCapture).not.toHaveBeenCalled();
  });
});

describe("identifyPostHogUser / resetPostHog", () => {
  it("identify — викликає posthog.identify(userId, traits)", async () => {
    const mod = await import("./posthog");
    await mod.initPostHog();
    mod.identifyPostHogUser("user-123", { plan: "pro" });

    expect(posthogIdentify).toHaveBeenCalledWith("user-123", { plan: "pro" });
  });

  it("identify буферизується до init", async () => {
    const mod = await import("./posthog");
    mod.identifyPostHogUser("user-123");
    expect(posthogIdentify).not.toHaveBeenCalled();

    await mod.initPostHog();
    expect(posthogIdentify).toHaveBeenCalledWith("user-123", undefined);
  });

  it("identify з порожнім userId — no-op", async () => {
    const mod = await import("./posthog");
    await mod.initPostHog();
    mod.identifyPostHogUser("");
    expect(posthogIdentify).not.toHaveBeenCalled();
  });

  it("reset — викликає posthog.reset()", async () => {
    const mod = await import("./posthog");
    await mod.initPostHog();
    mod.resetPostHog();

    expect(posthogReset).toHaveBeenCalledTimes(1);
  });

  it("reset буферизується до init", async () => {
    const mod = await import("./posthog");
    mod.resetPostHog();
    expect(posthogReset).not.toHaveBeenCalled();

    await mod.initPostHog();
    expect(posthogReset).toHaveBeenCalledTimes(1);
  });

  it("без VITE_POSTHOG_KEY — identify/reset no-op і без буферизації", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    const mod = await import("./posthog");
    mod.identifyPostHogUser("user-123");
    mod.resetPostHog();
    await mod.initPostHog();

    expect(posthogIdentify).not.toHaveBeenCalled();
    expect(posthogReset).not.toHaveBeenCalled();
  });
});

describe("error resilience", () => {
  it("SDK-помилка при init — не кидає, буфер відкидається", async () => {
    posthogInit.mockImplementationOnce(() => {
      throw new Error("kaboom");
    });
    const mod = await import("./posthog");
    mod.capturePostHogEvent("queued_event", {});

    await expect(mod.initPostHog()).resolves.toBeUndefined();
    expect(posthogCapture).not.toHaveBeenCalled();
  });

  it("posthog.capture, що кидає, не ламає trackEvent", async () => {
    posthogCapture.mockImplementationOnce(() => {
      throw new Error("network");
    });
    const mod = await import("./posthog");
    await mod.initPostHog();
    expect(() => mod.capturePostHogEvent("boom", {})).not.toThrow();
  });

  it("після init-помилки capture/identify/reset — true no-op (без enqueue)", async () => {
    // Регресія на Devin Review finding (PR #972): після catch у initPostHog
    // `initPromise` резолвиться, але `posthogModule === null` назавжди.
    // Без `initFailed` флага наступні виклики падали б у enqueue і тихо
    // churn-или shift() до кінця сесії.
    posthogInit.mockImplementationOnce(() => {
      throw new Error("kaboom");
    });
    const mod = await import("./posthog");
    await mod.initPostHog();

    // Капчер/ідентифай/ресет після збою не мають викликати SDK і не мають
    // лишати нічого у внутрішній черзі — інакше flushQueue ніколи не
    // обробить їх, а памʼять буде безцільно займатися.
    mod.capturePostHogEvent("after_fail", { ok: true });
    mod.identifyPostHogUser("user-456");
    mod.resetPostHog();

    expect(posthogCapture).not.toHaveBeenCalled();
    expect(posthogIdentify).not.toHaveBeenCalled();
    expect(posthogReset).not.toHaveBeenCalled();

    // Повторний initPostHog — той самий вже-resolved promise, flushQueue
    // не викликається (queue порожня і має залишатися такою).
    await mod.initPostHog();
    expect(posthogCapture).not.toHaveBeenCalled();
  });
});

describe("capture_exceptions config", () => {
  it("вмикає автокаптур unhandled errors і promise rejections явно", async () => {
    // Без явного значення прапорець резолвиться з remote config, тобто
    // збір крашів мовчки залежав би від тумблера в UI проєкту.
    const mod = await import("./posthog");
    await mod.initPostHog();

    expect(posthogInit.mock.calls[0]![1]).toMatchObject({
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
      },
    });
  });

  it("вмикає heatmaps, лишаючи autocapture вимкненим", async () => {
    // Heatmaps шлють лише координати кліків, без DOM-вмісту — тому це
    // свідомо НЕ суперечить `autocapture: false` поруч.
    const mod = await import("./posthog");
    await mod.initPostHog();

    expect(posthogInit.mock.calls[0]![1]).toMatchObject({
      enable_heatmaps: true,
      autocapture: false,
    });
  });

  it("session replay пише з маскуванням і полів вводу, і всього тексту", async () => {
    // Пін-тест на приватність: Sergeant тримає гроші, харчові щоденники й
    // травми. Послаблення будь-якого з двох маскувань — рішення власника
    // плюс оновлення політики приватності, а не тихий рефактор.
    const mod = await import("./posthog");
    await mod.initPostHog();

    expect(posthogInit.mock.calls[0]![1]).toMatchObject({
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "*",
      },
    });
  });

  it("не використовує deprecated sanitize_properties", async () => {
    // posthog-js логує console.error на КОЖНІЙ події, поки цей хук
    // виставлений. Скраб живе у before_send.
    const mod = await import("./posthog");
    await mod.initPostHog();

    const opts = posthogInit.mock.calls[0]![1] as Record<string, unknown>;
    expect(opts["sanitize_properties"]).toBeUndefined();
    expect(typeof opts["before_send"]).toBe("function");
  });
});

describe("applyPostHogBeforeSend", () => {
  it("викидає $cookies і редактить секрети в URL-полях", async () => {
    const mod = await import("./posthog");
    const result = mod.applyPostHogBeforeSend({
      properties: {
        $cookies: "session=abc",
        $current_url: "https://app.test/auth/callback?code=secret123&tab=hub",
        $referrer: "https://app.test/login?token=abcdef",
        keep: "me",
      },
    });

    const props = result!.properties!;
    expect(props["$cookies"]).toBeUndefined();
    expect(props["$current_url"]).not.toContain("secret123");
    expect(props["$current_url"]).toContain("tab=hub");
    expect(props["$referrer"]).not.toContain("abcdef");
    expect(props["keep"]).toBe("me");
  });

  it("скрабить PII у повідомленні винятку та у стеку", async () => {
    const mod = await import("./posthog");
    const result = mod.applyPostHogBeforeSend({
      properties: {
        $exception_message: "failed for user@example.com",
        $exception_list: [
          {
            type: "Error",
            value: "token leaked for user@example.com",
            stacktrace: {
              frames: [
                { filename: "https://app.test/a.js?access_token=zzz" },
                { filename: "https://app.test/b.js" },
              ],
            },
          },
        ],
      },
    });

    const props = result!.properties!;
    expect(props["$exception_message"]).not.toContain("user@example.com");
    const list = props["$exception_list"] as Array<Record<string, unknown>>;
    expect(list[0]!["value"]).not.toContain("user@example.com");
    const frames = (
      list[0]!["stacktrace"] as { frames: { filename: string }[] }
    ).frames;
    expect(frames[0]!.filename).not.toContain("zzz");
    expect(frames[1]!.filename).toBe("https://app.test/b.js");
  });

  it("не падає на null і на подіях без properties", async () => {
    const mod = await import("./posthog");
    expect(mod.applyPostHogBeforeSend(null)).toBeNull();
    expect(mod.applyPostHogBeforeSend({})).toEqual({});
  });
});

describe("capturePostHogException", () => {
  it("після init — форвардить у posthog.captureException", async () => {
    const mod = await import("./posthog");
    await mod.initPostHog();
    const err = new Error("boom");
    mod.capturePostHogException(err, { componentStack: "<App/>" });

    expect(posthogCaptureException).toHaveBeenCalledWith(err, {
      componentStack: "<App/>",
    });
  });

  it("буферизує виняток до завершення init і flush-ить після", async () => {
    const mod = await import("./posthog");
    const err = new Error("early boom");
    mod.capturePostHogException(err);
    expect(posthogCaptureException).not.toHaveBeenCalled();

    await mod.initPostHog();
    expect(posthogCaptureException).toHaveBeenCalledWith(err, {});
  });

  it("без VITE_POSTHOG_KEY — ні виклику, ні буферизації", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    const mod = await import("./posthog");
    mod.capturePostHogException(new Error("x"));
    await mod.initPostHog();

    expect(posthogCaptureException).not.toHaveBeenCalled();
  });
});
