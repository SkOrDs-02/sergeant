// ІНВАРІАНТ aiAtRest (B24, рев'ю CodeRabbit на PR #1698, раунд 4): жоден
// запис слота не замінює в сховищі шифртекст, який слот не розібрав у
// поточній епосі. Перевіряємо незалежним оракулом на випадкових
// послідовностях операцій (детермінований PRNG) над машиною станів слота:
// свіжий / нерозібраний / замкнений / готовий × зміна епохи × записи,
// читання, гідратація, зовнішні записи, барʼєр, збій ключа і шифрування.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  keyFails: false,
  auto: false,
  seals: [] as Array<{
    plain: string;
    resolve: (v: string) => void;
    reject: (e: unknown) => void;
  }>,
  opens: [] as Array<{
    ct: string;
    resolve: (v: string) => void;
    reject: (e: unknown) => void;
  }>,
  /** Успішні (або «пошкоджено при справному ключі») розбори: `епоха|raw`. */
  onOpened: (_raw: string) => undefined as void,
}));

const envOf = (ct: string) => JSON.stringify({ v: 1, iv: "iv", ct });

vi.mock("./aiAtRestCrypto", () => ({
  ensureKey: () => Promise.resolve(h.keyFails ? null : {}),
  resetKey: () => undefined,
  seal: (_slot: string, plain: string) =>
    h.auto
      ? Promise.resolve(envOf(`own:${plain}`))
      : new Promise<string>((resolve, reject) =>
          h.seals.push({ plain, resolve, reject }),
        ),
  open: (_slot: string, env: { ct: string }) => {
    if (h.auto) {
      h.onOpened(envOf(env.ct));
      return Promise.resolve(`pt:${env.ct}`);
    }
    return new Promise<string>((resolve, reject) =>
      h.opens.push({
        ct: env.ct,
        resolve: (v) => {
          h.onOpened(envOf(env.ct));
          resolve(v);
        },
        reject: (e) => {
          // Пошкоджений шифртекст при справному ключі: правило дозволяє заміну.
          h.onOpened(envOf(env.ct));
          reject(e);
        },
      }),
    );
  },
}));

import { logger } from "@shared/lib";
import { __resetAtRestKeyForTests, chatSessionsSlot } from "./aiAtRest";
import {
  bumpAtRestWipeEpoch,
  getAtRestWipeEpoch,
  holdAtRestWrites,
} from "./aiAtRestEpoch";
import { webKVStore } from "@shared/lib/storage/storage";

const KEY = "hub_chat_sessions_v1";
const isEnvelope = (raw: string | null) =>
  raw !== null && raw.startsWith('{"v":');

async function tick(n = 6): Promise<void> {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
}

// ── оракул ──────────────────────────────────────────────────────────────────
// Дозволено замінити конверт, лише якщо в ПОТОЧНІЙ епосі його розібрано
// (open завершився) або його записав сам слот. Оракул нічого не знає про
// внутрішній стан слота: лише бачить сховище, розбори і записи.
const allowed = new Set<string>();
const violations: string[] = [];
let testWriting = false;
const origSet = webKVStore.setString.bind(webKVStore);
const origGet = webKVStore.getString.bind(webKVStore);
const origRemove = webKVStore.remove.bind(webKVStore);
const mark = (raw: string) => allowed.add(`${getAtRestWipeEpoch()}|${raw}`);
h.onOpened = mark;

function external(fn: () => void): void {
  testWriting = true;
  try {
    fn();
  } finally {
    testWriting = false;
  }
}

const originalIDB = (globalThis as { indexedDB?: unknown }).indexedDB;

beforeEach(() => {
  // Середовище з WebCrypto/IDB (самі ключ і шифр — мок вище).
  (globalThis as { indexedDB?: unknown }).indexedDB = {};
  vi.spyOn(webKVStore, "setString").mockImplementation((key, value) => {
    if (key === KEY && !testWriting) {
      const prev = origGet(KEY);
      if (isEnvelope(prev) && !allowed.has(`${getAtRestWipeEpoch()}|${prev}`)) {
        violations.push(`replaced unread ${prev} with ${value}`);
      }
      if (isEnvelope(value)) mark(value);
    }
    origSet(key, value);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  (globalThis as { indexedDB?: unknown }).indexedDB = originalIDB;
});

// ── генератор ───────────────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Op =
  | "write"
  | "read"
  | "hydrate"
  | "whenReady"
  | "bump"
  | "bumpWipe"
  | "external"
  | "externalPlain"
  | "keyFail"
  | "keyOk"
  | "resolveSeal"
  | "rejectSeal"
  | "resolveOpen"
  | "corruptOpen"
  | "hold"
  | "release"
  | "remove"
  | "tick";
const OPS: Op[] = [
  "write",
  "write",
  "write",
  "read",
  "read",
  "hydrate",
  "whenReady",
  "bump",
  "bumpWipe",
  "external",
  "external",
  "externalPlain",
  "keyFail",
  "keyOk",
  "resolveSeal",
  "resolveSeal",
  "rejectSeal",
  "resolveOpen",
  "resolveOpen",
  "corruptOpen",
  "hold",
  "release",
  "remove",
  "tick",
  "tick",
];

async function resetWorld(): Promise<void> {
  h.auto = false;
  h.keyFails = false;
  h.seals.length = 0;
  h.opens.length = 0;
  external(() => origRemove(KEY));
  bumpAtRestWipeEpoch(); // свіжий слот: усе знане скинуто
  await __resetAtRestKeyForTests();
}

async function runSequence(seed: number, steps: number): Promise<string[]> {
  const rnd = mulberry32(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const releases: Array<() => void> = [];
  const log: string[] = [];
  let n = 0;
  for (let i = 0; i < steps; i++) {
    const op = pick(OPS);
    n += 1;
    log.push(op);
    switch (op) {
      case "write":
        void chatSessionsSlot.write(`w${seed}.${n}`);
        break;
      case "read":
        chatSessionsSlot.read();
        break;
      case "hydrate":
        void chatSessionsSlot.hydrate();
        break;
      case "whenReady":
        void chatSessionsSlot.whenReady();
        break;
      case "bump":
        bumpAtRestWipeEpoch();
        break;
      case "bumpWipe":
        external(() => origRemove(KEY));
        bumpAtRestWipeEpoch();
        break;
      case "external":
        external(() => origSet(KEY, envOf(`ext${seed}.${n}`)));
        break;
      case "externalPlain":
        external(() => origSet(KEY, `legacy${seed}.${n}`));
        break;
      case "keyFail":
        h.keyFails = true;
        break;
      case "keyOk":
        h.keyFails = false;
        break;
      case "resolveSeal":
        if (h.seals.length) {
          const s = h.seals.splice(Math.floor(rnd() * h.seals.length), 1)[0]!;
          s.resolve(envOf(`own:${s.plain}`));
        }
        break;
      case "rejectSeal":
        if (h.seals.length) h.seals.shift()!.reject(new Error("quota"));
        break;
      case "resolveOpen":
        if (h.opens.length) {
          const o = h.opens.splice(Math.floor(rnd() * h.opens.length), 1)[0]!;
          o.resolve(`pt:${o.ct}`);
        }
        break;
      case "corruptOpen":
        if (h.opens.length) {
          h.opens.shift()!.reject(new DOMException("tag", "OperationError"));
        }
        break;
      case "hold":
        releases.push(holdAtRestWrites());
        break;
      case "release":
        releases.pop()?.();
        break;
      case "remove":
        chatSessionsSlot.remove();
        break;
      case "tick":
        await tick(2);
        break;
    }
  }
  // Злив: відпустити барʼєри, дозавершити все, що летить.
  while (releases.length) releases.pop()!();
  h.keyFails = false;
  for (let round = 0; round < 10; round++) {
    for (const s of h.seals.splice(0)) s.resolve(envOf(`own:${s.plain}`));
    for (const o of h.opens.splice(0)) o.resolve(`pt:${o.ct}`);
    await tick(4);
  }
  return log;
}

describe("aiAtRest: інваріант «нерозібраний шифртекст не замінюється»", () => {
  it("тримається на 300 випадкових послідовностях по 30 операцій", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    for (let seed = 1; seed <= 300; seed++) {
      await resetWorld();
      violations.length = 0;
      const ops = await runSequence(seed, 30);
      if (violations.length) {
        throw new Error(
          `seed ${seed}: ${violations[0]}\nops: ${ops.join(" ")}`,
        );
      }

      // Живучість: з доступним ключем слот доходить до готовності, і запис
      // після неї лягає.
      h.auto = true;
      expect(await chatSessionsSlot.whenReady()).toBe(true);
      const final = `final${seed}`;
      expect(await chatSessionsSlot.write(final)).toBe(true);
      expect(chatSessionsSlot.read()).toBe(final);
      expect(violations).toEqual([]);
    }
    warn.mockRestore();
  });
});

describe("aiAtRest: таблиця станів", () => {
  beforeEach(async () => {
    await resetWorld();
    violations.length = 0;
  });

  it.each([
    ["свіжий (холодний бут, до гідратації)", false],
    ["замкнений (ключ не завантажився)", true],
  ])(
    "%s: запис відмовлено, шифртекст цілий, лог про відкинуту правку",
    async (_name, keyFails) => {
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
      external(() => origSet(KEY, envOf("history")));
      h.keyFails = keyFails;
      if (keyFails) await chatSessionsSlot.hydrate();
      expect(chatSessionsSlot.isReady()).toBe(false);
      expect(chatSessionsSlot.isLocked()).toBe(keyFails);

      expect(await chatSessionsSlot.write("new-only")).toBe(false);
      expect(origGet(KEY)).toBe(envOf("history"));
      expect(
        warn.mock.calls.some((c) => String(c[0]).includes("edit discarded")),
      ).toBe(true);

      h.keyFails = false;
      h.auto = true;
      await chatSessionsSlot.hydrate();
      expect(await chatSessionsSlot.whenReady()).toBe(true);
      expect(chatSessionsSlot.read()).toBe("pt:history");
      expect(violations).toEqual([]);
    },
  );

  it("зміна епохи посеред розбору: результат відкинуто, запис чекає нового розбору", async () => {
    external(() => origSet(KEY, envOf("A")));
    void chatSessionsSlot.hydrate();
    await tick();
    bumpAtRestWipeEpoch();
    h.opens.shift()!.resolve("pt:A"); // розбір старої епохи
    await tick();
    expect(chatSessionsSlot.isReady()).toBe(false);
    expect(await chatSessionsSlot.write("x")).toBe(false);
    expect(origGet(KEY)).toBe(envOf("A"));
    expect(violations).toEqual([]);
  });

  it("інша вкладка поклала новий конверт, поки наш запис шифрувався: наш не лягає поверх", async () => {
    h.auto = false;
    const p = chatSessionsSlot.write("mine"); // сховище порожнє → готовий
    await tick();
    external(() => origSet(KEY, envOf("theirs")));
    h.seals.shift()!.resolve(envOf("own:mine"));
    expect(await p).toBe(false);
    expect(origGet(KEY)).toBe(envOf("theirs"));
    expect(violations).toEqual([]);
  });

  it("#20 після невдалого запису читання знову показує сховище", async () => {
    const p = chatSessionsSlot.write("unsaved");
    expect(chatSessionsSlot.read()).toBe("unsaved"); // летить
    await tick();
    h.seals.shift()!.reject(new Error("quota"));
    expect(await p).toBe(false);
    expect(chatSessionsSlot.read()).toBeNull();
  });
});
