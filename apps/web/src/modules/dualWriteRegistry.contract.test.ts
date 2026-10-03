// @vitest-environment jsdom
/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Пін на реєстр dual-write контексту — ОДИН на всі чотири модулі.
 *
 * Знахідка PR-R1 (аудит 2026-09-13): слот був один, teardown обнуляв його,
 * а реєстрантів двоє — глобальний boot-кластер із `RootLayout` і сам
 * модуль. Модуль реєструвався пізніше, перекривав кластер, і на анмаунті
 * обнуляв слот; кластер більше нічого не реєстрував (його ефект залежить
 * від `[userId]`). Далі dual-write мовчки ставав no-op до кінця сесії.
 *
 * ЧОМУ ПІН ТУТ, А НЕ В КОЖНОМУ МОДУЛІ. Знахідку виправили в Рутині, і
 * захистом поставили `AI-DANGER` у виправленому файлі
 * (`routine/useRoutineAppState.ts`). Він не вберіг ані Фізрука, ані Їжу,
 * ані Фініка — у всіх трьох подвійна реєстрація дожила до 2026-09-14.
 * Це третій випадок того самого класу за одну сесію (пор. PR-A9
 * «Pro»/«Premium» і PR-A10 розкриття авторства): коментар у файлі А не
 * боронить файл Б. Інваріант, спільний для чотирьох модулів, мусить мати
 * пін поза всіма чотирма.
 */
import { describe, it, expect, beforeEach } from "vitest";

import * as routine from "./routine/lib/sqliteWriter/index";
import * as fizruk from "./fizruk/lib/sqliteWriter/index";
import * as nutrition from "./nutrition/lib/sqliteWriter/index";
import * as finyk from "./finyk/lib/sqliteWriter/index";

interface Registry {
  register: (ctx: never) => () => void;
  isRegistered: () => boolean;
  clear: () => void;
}

const REGISTRIES: readonly (readonly [string, Registry])[] = [
  [
    "routine",
    {
      register: routine.registerRoutineDualWriteContext as never,
      isRegistered: routine.isRoutineDualWriteRegistered,
      clear: routine.__clearRoutineDualWriteContextForTests,
    },
  ],
  [
    "fizruk",
    {
      register: fizruk.registerFizrukDualWriteContext as never,
      isRegistered: fizruk.isFizrukDualWriteRegistered,
      clear: fizruk.__clearFizrukDualWriteContextForTests,
    },
  ],
  [
    "nutrition",
    {
      register: nutrition.registerNutritionDualWriteContext as never,
      isRegistered: nutrition.isNutritionDualWriteRegistered,
      clear: nutrition.__clearNutritionDualWriteContextForTests,
    },
  ],
  [
    "finyk",
    {
      register: finyk.registerFinykDualWriteContext as never,
      isRegistered: finyk.isFinykDualWriteRegistered,
      clear: finyk.__clearFinykDualWriteContextForTests,
    },
  ],
];

/** Мінімальний контекст: реєстр його не викликає, лише тримає. */
function ctx(id: string): never {
  return {
    getUserId: () => id,
    getMigrationClient: async () => null,
    getNow: () => "2026-09-14T00:00:00.000Z",
  } as never;
}

describe.each(REGISTRIES)("реєстр dual-write · %s", (_name, reg) => {
  beforeEach(() => reg.clear());

  it("тримає реєстрацію, поки живий хоча б один реєстрант", () => {
    const offCluster = reg.register(ctx("cluster"));
    const offModule = reg.register(ctx("module"));

    // Анмаунт модуля — кластер лишається живим, тож dual-write мусить
    // лишитись увімкненим. САМЕ ЦЕ ламала знахідка PR-R1.
    offModule();
    expect(reg.isRegistered()).toBe(true);

    offCluster();
    expect(reg.isRegistered()).toBe(false);
  });

  it("не залежить від порядку анмаунтів", () => {
    const offCluster = reg.register(ctx("cluster"));
    const offModule = reg.register(ctx("module"));

    // Зворотний порядок: першим іде кластер (наприклад, зміна userId).
    offCluster();
    expect(reg.isRegistered()).toBe(true);

    offModule();
    expect(reg.isRegistered()).toBe(false);
  });

  it("повторний teardown нічого не ламає", () => {
    const offCluster = reg.register(ctx("cluster"));
    const offModule = reg.register(ctx("module"));

    offModule();
    offModule();
    expect(reg.isRegistered()).toBe(true);

    offCluster();
    expect(reg.isRegistered()).toBe(false);
  });

  it("одинична реєстрація поводиться як раніше", () => {
    const off = reg.register(ctx("only"));
    expect(reg.isRegistered()).toBe(true);
    off();
    expect(reg.isRegistered()).toBe(false);
  });
});
