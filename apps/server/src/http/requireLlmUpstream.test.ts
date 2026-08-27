/**
 * B31, поширений на решту AI-роутів.
 *
 * Перевірка «чи баг чат-роута одиничний» показала, що ні: `coach/insight`,
 * `weekly-digest` і вся нутриція теж стояли за `requireAnthropicKey()`, тоді
 * як їхні дефолти (`env/aiRoutingEnv.ts`) — `openrouter` для трьох
 * `LLM_*_PROVIDER` і `VISION_VIA_OPENROUTER=true`. Тобто гейт вимагав
 * креденшел, якого дефолтна конфігурація не використовує.
 *
 * Другий, гірший бік тієї самої монети: `getLLMProvider()` fail-soft, і без
 * потрібного ключа тихо повертає `StubProvider`. Старий гейт цього не ловив
 * узагалі — за наявності Anthropic-ключа він пускав запит далі, і роут
 * віддавав 200 із текстом-заглушкою. Прод-двійник знахідки B44.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

async function loadGuard() {
  vi.resetModules();
  return (await import("./requireAnthropicKey.js")).requireLlmUpstream;
}

/** Проганяє гейт і повертає, чи пропустив він запит далі. */
async function run(
  path: "coach" | "digest" | "nutrition" | "vision",
): Promise<{ passed: boolean; res: ReturnType<typeof makeRes> }> {
  const requireLlmUpstream = await loadGuard();
  const req = {} as Request;
  const res = makeRes();
  const next = vi.fn();
  requireLlmUpstream(path)(req, res, next);
  return { passed: next.mock.calls.length === 1, res };
}

beforeEach(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("requireLlmUpstream — провайдерні шляхи (coach / digest / nutrition)", () => {
  it.each(["coach", "digest", "nutrition"] as const)(
    "%s: під шлюзом БЕЗ Anthropic-ключа проходить (він потрібен лише як фолбек)",
    async (path) => {
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("OPENROUTER_API_KEY", "or-key");
      const { passed } = await run(path);
      expect(passed).toBe(true);
    },
  );

  it.each([
    ["coach", "LLM_COACH_PROVIDER"],
    ["digest", "LLM_DIGEST_PROVIDER"],
    ["nutrition", "LLM_NUTRITION_PROVIDER"],
  ] as const)(
    "%s: provider=openrouter БЕЗ ключа шлюзу — 503, а не тиха заглушка",
    async (path, providerVar) => {
      // Головний регрес цього файлу. `getLLMProvider()` тут повернув би
      // `StubProvider`, і користувач отримав би 200 із вигаданим текстом.
      // Старий `requireAnthropicKey()` пускав такий запит, якщо десь лежав
      // Anthropic-ключ — саме тому він тут виставлений.
      vi.stubEnv(providerVar, "openrouter");
      vi.stubEnv("OPENROUTER_API_KEY", "");
      vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-present");
      const { passed, res } = await run(path);
      expect(passed).toBe(false);
      expect(res.statusCode).toBe(503);
    },
  );

  it.each([
    ["coach", "LLM_COACH_PROVIDER"],
    ["digest", "LLM_DIGEST_PROVIDER"],
    ["nutrition", "LLM_NUTRITION_PROVIDER"],
  ] as const)(
    "%s: provider=anthropic без Anthropic-ключа — 503 (стару поведінку збережено)",
    async (path, providerVar) => {
      vi.stubEnv(providerVar, "anthropic");
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("OPENROUTER_API_KEY", "or-key");
      const { passed, res } = await run(path);
      expect(passed).toBe(false);
      expect(res.statusCode).toBe(503);
    },
  );

  it("provider=stub проходить: це явний вибір у конфізі, а не забутий ключ", async () => {
    vi.stubEnv("LLM_COACH_PROVIDER", "stub");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const { passed } = await run("coach");
    expect(passed).toBe(true);
  });
});

describe("requireLlmUpstream — vision (сирий транспорт)", () => {
  it("під шлюзом БЕЗ Anthropic-ключа проходить: pickTransport його не читає", async () => {
    vi.stubEnv("VISION_VIA_OPENROUTER", "true");
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { passed } = await run("vision");
    expect(passed).toBe(true);
  });

  it("шлюз вимкнено — Anthropic-ключ обовʼязковий: фолбеку в сирому транспорті немає", async () => {
    vi.stubEnv("VISION_VIA_OPENROUTER", "false");
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { passed, res } = await run("vision");
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(503);
  });

  it("шлюз увімкнено, але ключа шлюзу немає — падаємо на Anthropic і вимагаємо його ключ", async () => {
    // `visionViaOpenRouter()` уже включає перевірку ключа в предикат, тож
    // тут транспорт де-факто повертається на api.anthropic.com.
    vi.stubEnv("VISION_VIA_OPENROUTER", "true");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { passed, res } = await run("vision");
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(503);
  });
});

describe("requireLlmUpstream — форма відмови", () => {
  it("не світить назву env-змінної клієнту", async () => {
    vi.stubEnv("LLM_COACH_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { res } = await run("coach");
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("ANTHROPIC_API_KEY");
    expect(body).not.toContain("OPENROUTER_API_KEY");
    expect(res.body).toMatchObject({ code: "ANTHROPIC_KEY_MISSING" });
  });
});
