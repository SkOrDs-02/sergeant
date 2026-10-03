/**
 * Тестовий «пристрій» у зоні, відмінній від Europe/Kyiv (ADR-0078).
 *
 * Чому не просто `process.env.TZ`: mobile-Jest запускається з
 * `TZ=Europe/Kyiv` (`apps/mobile/package.json`, див. `jest.setup.js`), тож
 * «пристрій» у тестах = Київ, і баг «день-ключ журналу їжі рахується за
 * Києвом» там невидимий — обидва годинники дають однаковий день. Змінити
 * зону процесу зсередини тесту неможливо: Jest віддає sandbox-копію
 * `process.env`, присвоєння `TZ` до справжнього env не доходить (перевірено
 * 2026-10-03: `new Date(0).getHours()` не змінюється).
 *
 * Тому підміняємо глобальний `Date` на клас із ФІКСОВАНИМ зсувом від UTC і
 * замороженим «зараз». Локальні геттери (`getFullYear/getMonth/getDate/
 * getDay/getHours/getMinutes/...`) і конструктор «з полів»
 * (`new Date(y, m, d)`) працюють у цій зоні — саме так читає годинник
 * `deviceDayKey` / `addDeviceDays` з `@sergeant/nutrition-domain`.
 * `Intl.DateTimeFormat({ timeZone: "Europe/Kyiv" })`, на якому стоїть
 * `toKyivISODate`, лишається справжнім і міряє реальний момент, тож два
 * годинники розходяться так само, як на телефоні поза Києвом.
 *
 * AI-DANGER: не поєднувати з `jest.useFakeTimers()` — fake-timers `Date`
 * повертає з конструктора інший об'єкт, і підклас втрачає перевизначені
 * геттери. У тесті, що викликає `installFakeDeviceZone`, спершу
 * `jest.useRealTimers()`.
 */

export interface FakeDeviceZoneOptions {
  /** Зсув пристрою від UTC у хвилинах (UTC-5 → `-300`, UTC+10 → `600`). */
  offsetMinutes: number;
  /** Заморожений «зараз» як ISO-рядок з явною зоною (`...Z`). */
  nowIso: string;
}

/** Встановлює фейкову зону пристрою; повертає функцію відновлення `Date`. */
export function installFakeDeviceZone(
  options: FakeDeviceZoneOptions,
): () => void {
  const RealDate = Date;
  const nowMs = RealDate.parse(options.nowIso);
  if (Number.isNaN(nowMs)) {
    throw new Error(
      `installFakeDeviceZone: некоректний nowIso ${options.nowIso}`,
    );
  }
  const shiftMs = options.offsetMinutes * 60_000;

  class DeviceZoneDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(nowMs);
      } else if (args.length === 1) {
        super(args[0] as number);
      } else {
        // Поля `new Date(y, m, d, h, mi, s, ms)` — це НАСТІННИЙ час пристрою:
        // переводимо в реальний момент через зсув фейкової зони.
        const [y, m = 0, d = 1, h = 0, mi = 0, s = 0, ms = 0] =
          args as number[];
        super(RealDate.UTC(y as number, m, d, h, mi, s, ms) - shiftMs);
      }
    }

    static now(): number {
      return nowMs;
    }

    /** Настінний час пристрою, прочитаний через UTC-геттери зсунутої дати. */
    private wall(): Date {
      return new RealDate(this.getTime() + shiftMs);
    }

    getFullYear(): number {
      return this.wall().getUTCFullYear();
    }
    getMonth(): number {
      return this.wall().getUTCMonth();
    }
    getDate(): number {
      return this.wall().getUTCDate();
    }
    getDay(): number {
      return this.wall().getUTCDay();
    }
    getHours(): number {
      return this.wall().getUTCHours();
    }
    getMinutes(): number {
      return this.wall().getUTCMinutes();
    }
    getSeconds(): number {
      return this.wall().getUTCSeconds();
    }
    getMilliseconds(): number {
      return this.wall().getUTCMilliseconds();
    }
    getTimezoneOffset(): number {
      return -options.offsetMinutes;
    }
  }

  globalThis.Date = DeviceZoneDate as unknown as DateConstructor;
  return () => {
    globalThis.Date = RealDate;
  };
}

/**
 * Момент, на якому Київ і пристрій у UTC-5 стоять на РІЗНИХ календарних днях:
 * 2026-10-03T03:30Z = 06:30 3 жовтня в Києві (UTC+3, літній час триває до
 * 25.10) і 22:30 2 жовтня на пристрої. Вечірній прийом їжі людини в
 * Нью-Йорку.
 */
export const WEST_OF_KYIV = {
  offsetMinutes: -300,
  nowIso: "2026-10-03T03:30:00.000Z",
  /** День-ключ за пристроєм (правильний за ADR-0078). */
  deviceDay: "2026-10-02",
  /** День-ключ за Києвом (те, що писав баговий код). */
  kyivDay: "2026-10-03",
} as const;

/**
 * Дзеркальний випадок: пристрій у UTC+10 (Брисбен, без DST). 2026-10-02T20:30Z
 * = 23:30 2 жовтня в Києві і 06:30 3 жовтня на пристрої.
 */
export const EAST_OF_KYIV = {
  offsetMinutes: 600,
  nowIso: "2026-10-02T20:30:00.000Z",
  deviceDay: "2026-10-03",
  kyivDay: "2026-10-02",
} as const;
