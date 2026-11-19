// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Сторож живе inline в `index.html` (див. коментар над ним: зовнішній скрипт
// висне разом з іншими підресурсами за зависання SW). Тут він виконується як
// є; vitest стартує з кореня пакета `apps/web`.
const INDEX_HTML = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const VERCEL_JSON = readFileSync(resolve(process.cwd(), "vercel.json"), "utf8");

function inlineSource(): string {
  const m = /<script>([\s\S]*?)<\/script>/.exec(INDEX_HTML);
  if (!m?.[1]) throw new Error("inline boot watchdog not found");
  return m[1];
}

const REPORT_KEY = "sergeant.boot_watchdog_report";
const STAMP_KEY = "sergeant.boot_watchdog_at";

function boot(ms = 10_000): void {
  new Function(inlineSource())();
  vi.advanceTimersByTime(ms);
}

function report() {
  const raw = sessionStorage.getItem(REPORT_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

describe("inline boot-watchdog", () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="root"></div>';
    sessionStorage.clear();
    reload.mockReset();
    Object.defineProperty(window, "location", {
      value: { reload },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("перезавантажує й пише звіт, якщо #root порожній через 10 с", () => {
    boot();
    expect(reload).toHaveBeenCalledOnce();
    expect(report()).toMatchObject({ act: "reload", ctl: false, snap: null });
    expect(sessionStorage.getItem(STAMP_KEY)).not.toBeNull();
  });

  it("раніше за 10 с не спрацьовує", () => {
    boot(9_999);
    expect(reload).not.toHaveBeenCalled();
    expect(report()).toBeNull();
  });

  it("не чіпає змонтований застосунок", () => {
    document.getElementById("root")!.append(document.createElement("div"));
    boot();
    expect(reload).not.toHaveBeenCalled();
    expect(report()).toBeNull();
  });

  it("не перезавантажує вдруге протягом хвилини, але звіт пише", () => {
    boot();
    sessionStorage.removeItem(REPORT_KEY);
    boot();
    expect(reload).toHaveBeenCalledOnce();
    expect(report()).toMatchObject({ act: "none" });
  });

  it("без sessionStorage не перезавантажує, щоб не зациклитись", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    boot();
    expect(reload).not.toHaveBeenCalled();
  });

  describe("з контролером SW", () => {
    function stubSw(snapshot: unknown, answer = true) {
      const unregister = vi.fn().mockResolvedValue(true);
      type Port = { onmessage: ((e: { data: unknown }) => void) | null };
      const ports: Port[] = [];
      vi.stubGlobal(
        "MessageChannel",
        class {
          port1: Port = { onmessage: null };
          port2 = {};
          constructor() {
            ports.push(this.port1);
          }
        },
      );
      const postMessage = vi.fn(() => {
        if (answer) {
          queueMicrotask(() =>
            ports[0]?.onmessage?.({
              data: { type: "SW_FETCH_DIAG_RESULT", snapshot },
            }),
          );
        }
      });
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          controller: { postMessage },
          getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
        },
      });
      return { unregister, postMessage };
    }

    it("із завислими SW-fetch знімає реєстрацію і перезавантажує", async () => {
      const { unregister, postMessage } = stubSw({ pending: 3, fetches: [] });
      boot();
      await vi.advanceTimersByTimeAsync(10);
      expect(postMessage).toHaveBeenCalledWith({ type: "SW_FETCH_DIAG" }, [
        expect.anything(),
      ]);
      expect(unregister).toHaveBeenCalledOnce();
      expect(reload).toHaveBeenCalledOnce();
      expect(report()).toMatchObject({
        act: "bypass",
        ctl: true,
        snap: { pending: 3 },
      });
    });

    it("SW мовчить: через 1.5 с звіт без знімка, обхід SW (readyState=loading)", async () => {
      Object.defineProperty(document, "readyState", {
        configurable: true,
        get: () => "loading",
      });
      const { unregister } = stubSw(null, false);
      boot();
      await vi.advanceTimersByTimeAsync(1_600);
      expect(unregister).toHaveBeenCalledOnce();
      expect(reload).toHaveBeenCalledOnce();
      expect(report()).toMatchObject({ act: "bypass", snap: null });
      Reflect.deleteProperty(document, "readyState");
    });

    it("без завислих fetch і з complete — простий reload без unregister", async () => {
      const { unregister } = stubSw({ pending: 0, fetches: [] });
      boot();
      await vi.advanceTimersByTimeAsync(10);
      expect(unregister).not.toHaveBeenCalled();
      expect(reload).toHaveBeenCalledOnce();
      expect(report()).toMatchObject({ act: "reload" });
    });
  });
});

describe("CSP-хеш inline-сторожа", () => {
  const hash = `'sha256-${createHash("sha256").update(inlineSource(), "utf8").digest("base64")}'`;

  function scriptSrc(csp: string): string {
    const m = /script-src ([^;]*)/.exec(csp);
    if (!m?.[1]) throw new Error("script-src not found");
    return m[1];
  }

  it("є тільки один inline-скрипт без атрибутів", () => {
    expect(INDEX_HTML.match(/<script>/g)).toHaveLength(1);
  });

  it("хеш є в script-src <meta> CSP у index.html", () => {
    const meta =
      /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(
        INDEX_HTML,
      )?.[1];
    expect(meta, "meta CSP").toBeDefined();
    expect(scriptSrc(meta!), `оновіть хеш у index.html: ${hash}`).toContain(
      hash,
    );
  });

  function headerCsp(): string {
    const csp = (
      JSON.parse(VERCEL_JSON) as {
        headers: { headers: { key: string; value: string }[] }[];
      }
    ).headers
      .flatMap((h) => h.headers)
      .find((h) => h.key === "Content-Security-Policy")?.value;
    if (!csp) throw new Error("CSP header not found");
    return csp;
  }

  it("хеш є в script-src заголовка CSP у vercel.json", () => {
    expect(
      scriptSrc(headerCsp()),
      `оновіть хеш у vercel.json: ${hash}`,
    ).toContain(hash);
  });

  it("'unsafe-inline' у script-src не з'явився", () => {
    const meta =
      /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(
        INDEX_HTML,
      )?.[1];
    expect(scriptSrc(meta!)).not.toContain("'unsafe-inline'");
    expect(scriptSrc(headerCsp())).not.toContain("'unsafe-inline'");
  });
});
