/**
 * Пейсинг ембеддингу корпусу евалу.
 *
 * Модуль існує через конкретну аварію, описану в його шапці: прод-клієнт
 * шле батчі паралельно, 780 текстів дають 25 одночасних запитів, і на
 * безплатному тарифі Voyage (3 запити на хвилину) це гарантований 429.
 * Живий workflow тоді відпрацював за 26 секунд, упав і лишився зеленим,
 * бо крок стояв під `|| true`.
 *
 * Тест стереже рівно ті три властивості, відсутність яких і давала ту
 * тишу: батчі йдуть ПОСЛІДОВНО, між ними витримується пауза, а 429
 * відступає з наростанням замість того, щоб пролетіти нагору.
 *
 * Таймери фейкові: реальні паузи тут за визначенням десятки секунд, а
 * міряємо ми порядок і кількість викликів, не годинник.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

import type { EmbeddingProvider } from "../../modules/ai-memory/types.js";
import { embedSequentially, pacingMs } from "./pacedEmbedding.js";

/** Дефолт `VOYAGE_BATCH_SIZE` — тести навмисно рахують від нього. */
const BATCH = 32;

function texts(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `текст-${i}`);
}

/** Вектор-мітка: перший елемент несе індекс, тож порядок видно очима. */
function vec(marker: number): Float32Array {
  return Float32Array.from([marker, 0, 0]);
}

interface ProviderStub {
  provider: EmbeddingProvider;
  calls: string[][];
}

/**
 * Провайдер, що віддає по вектору на текст. `failures` — черга помилок:
 * кожен виклик знімає з неї голову і кидає її, поки черга не спорожніє.
 */
function stubProvider(failures: unknown[] = []): ProviderStub {
  const calls: string[][] = [];
  const queue = [...failures];
  const provider = {
    meta: {} as EmbeddingProvider["meta"],
    embedBatch: async (batch: string[]): Promise<Float32Array[]> => {
      calls.push([...batch]);
      const failure = queue.shift();
      if (failure) throw failure;
      return batch.map((t) => vec(Number(t.split("-")[1])));
    },
  } satisfies EmbeddingProvider;
  return { provider, calls };
}

const retryable = Object.assign(new Error("429 Too Many Requests"), {
  retryable: true,
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("pacingMs", () => {
  it("без RAG_EVAL_EMBED_RPM тримає темп безплатного тарифу (3 rpm)", () => {
    vi.stubEnv("RAG_EVAL_EMBED_RPM", "");
    // 60000/3 = 20000, плюс запас 1000.
    expect(pacingMs()).toBe(21_000);
  });

  it("вищий rpm пришвидшує темп", () => {
    vi.stubEnv("RAG_EVAL_EMBED_RPM", "60");
    expect(pacingMs()).toBe(2_000);
  });

  it.each([
    ["не число", "хтозна"],
    ["нуль", "0"],
    ["відʼємне", "-5"],
  ])("падає назад на 3 rpm, коли значення %s", (_label, raw) => {
    vi.stubEnv("RAG_EVAL_EMBED_RPM", raw);
    // Головне тут не саме число, а що сміття в env не робить паузу нульовою
    // чи NaN: і те, і те повернуло б рівно ту паралельність, від якої модуль
    // і рятує.
    expect(pacingMs()).toBe(21_000);
  });
});

describe("embedSequentially", () => {
  it("ріже на батчі, шле їх ПО ОДНОМУ і зберігає порядок текстів", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RAG_EVAL_EMBED_RPM", "60");
    const { provider, calls } = stubProvider();

    const promise = embedSequentially(provider, texts(70));
    await vi.runAllTimersAsync();
    const out = await promise;

    // 70 = 32 + 32 + 6.
    expect(calls.map((c) => c.length)).toEqual([BATCH, BATCH, 6]);
    expect(out).toHaveLength(70);
    // Порядок на виході — порядок на вході, попри порізання на батчі.
    expect(out.map((v) => v[0])).toEqual(
      Array.from({ length: 70 }, (_, i) => i),
    );
  });

  it("витримує паузу МІЖ батчами і не платить нею після останнього", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RAG_EVAL_EMBED_RPM", "60");
    const { provider } = stubProvider();
    const sleeps: number[] = [];
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      sleeps.push(ms ?? 0);
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    await embedSequentially(provider, texts(70));

    // Три батчі — рівно дві паузи. Пауза після останнього батча була б
    // чистим простоєм: слати вже нічого.
    expect(sleeps).toEqual([2_000, 2_000]);
  });

  it("повідомляє прогрес наростаючим підсумком", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RAG_EVAL_EMBED_RPM", "60");
    const { provider } = stubProvider();
    const seen: Array<[number, number]> = [];

    const promise = embedSequentially(provider, texts(70), (done, total) =>
      seen.push([done, total]),
    );
    await vi.runAllTimersAsync();
    await promise;

    expect(seen).toEqual([
      [32, 70],
      [64, 70],
      [70, 70],
    ]);
  });

  it("відступає на 429 і дотискає той самий батч", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RAG_EVAL_EMBED_RPM", "60");
    const { provider, calls } = stubProvider([retryable, retryable]);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const promise = embedSequentially(provider, texts(10));
    await vi.runAllTimersAsync();
    const out = await promise;

    // Один батч, три виклики: два падіння і успіх. Повтор іде тим самим
    // зрізом, інакше частина текстів мовчки лишилась би без векторів.
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[1]).toEqual(calls[2]);
    expect(out).toHaveLength(10);
  });

  it("нарощує відступ з кожною спробою", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RAG_EVAL_EMBED_RPM", "60");
    const { provider } = stubProvider([retryable, retryable]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sleeps: number[] = [];
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      sleeps.push(ms ?? 0);
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    await embedSequentially(provider, texts(10));

    // delay*(attempt+1): 2000*2, потім 2000*3. Рівна пауза на кожній спробі
    // не розвела б чергу під лімітом, а саме це і є завдання відступу.
    expect(sleeps).toEqual([4_000, 6_000]);
  });

  it("кидає не-retryable помилку одразу, без повторів", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RAG_EVAL_EMBED_RPM", "60");
    const fatal = new Error("401 Unauthorized");
    const { provider, calls } = stubProvider([fatal]);

    const promise = embedSequentially(provider, texts(10));
    await expect(promise).rejects.toThrow("401 Unauthorized");
    // Ключове: битий ключ не має коштувати шести спроб із паузами.
    expect(calls).toHaveLength(1);
  });

  it("здається після шостої спроби і віддає помилку нагору", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RAG_EVAL_EMBED_RPM", "60");
    const { provider, calls } = stubProvider(Array(9).fill(retryable));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const promise = embedSequentially(provider, texts(10));
    const rejects = expect(promise).rejects.toThrow("429");
    await vi.runAllTimersAsync();
    await rejects;

    // attempt 0..5 — шість викликів, далі помилка йде нагору замість
    // нескінченного кола.
    expect(calls).toHaveLength(6);
  });

  it("на порожньому вході не чіпає провайдера", async () => {
    const { provider, calls } = stubProvider();
    await expect(embedSequentially(provider, [])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
