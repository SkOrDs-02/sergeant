import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildFtuxDripTemplate } from "./ftuxDripCopy.js";

/**
 * Дірка з новачками (спека `reward-loop-and-reminders.md`, § Верифікація
 * 5.3): нудж відсутності будить лише підписаних на push, тож новачок без
 * підписки, що зник на третій день, не чув би нічого. Лист лишається
 * єдиним каналом, і він має кликати увімкнути сповіщення, а не мовчати.
 */

const input = {
  recipientName: "Дмитро",
  unsubscribeUrl: "https://app.sergeant.fit/api/email/unsubscribe?u=tok",
  appUrl: "https://app.sergeant.fit",
};
const SETTINGS_LINK =
  "https://app.sergeant.fit/?tab=settings#settings-notifications";

describe("запрошення увімкнути сповіщення у FTUX-листах", () => {
  it("лист дня 1 і дня 3 кличе непідписаного новачка увімкнути сповіщення", () => {
    for (const day of ["day_1", "day_3"] as const) {
      const tpl = buildFtuxDripTemplate(day, { ...input, pushInvite: true });
      expect(tpl.text).toContain(SETTINGS_LINK);
      expect(tpl.html).toContain(SETTINGS_LINK);
    }
  });

  it("підписаній людині запрошення не шлемо", () => {
    for (const day of ["day_1", "day_3"] as const) {
      const tpl = buildFtuxDripTemplate(day, { ...input, pushInvite: false });
      expect(tpl.text).not.toContain(SETTINGS_LINK);
      expect(tpl.html).not.toContain(SETTINGS_LINK);
    }
  });

  it("лист дня 0 запрошення не несе: людина щойно в застосунку", () => {
    const tpl = buildFtuxDripTemplate("day_0", { ...input, pushInvite: true });
    expect(tpl.text).not.toContain(SETTINGS_LINK);
  });
});

describe("dispatcher вирішує про запрошення за станом підписки", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
    vi.stubEnv("PUBLIC_APP_URL", "https://app.example.com/");
    vi.stubEnv("RESEND_API_KEY", "resend_test");
    vi.stubEnv("RESEND_FROM", "Sergeant <hello@example.com>");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function sendDay3(hasPush: boolean): Promise<string> {
    vi.resetModules();
    const mail = await import("./ftuxDripMail.js");
    const jobs = await import("../lib/jobs/ftuxDrip.js");
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { id: "u_1", email: "u@example.com", name: null, has_push: hasPush },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "55" }] })
      .mockResolvedValueOnce({ rows: [] });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "email_1" }), { status: 200 }),
    );
    mail.configureFtuxDripDispatcher({ pool: { query } as never });
    await jobs.processFtuxDripJob({
      data: {
        kind: "ftux_drip",
        day: "day_3",
        userId: "u_1",
        email: "u@example.com",
        delayMs: 0,
      },
      attemptsMade: 1,
      name: "day_3",
    } as never);
    jobs.__resetFtuxDripQueueForTesting();
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body,
    ) as { text: string };
    return body.text;
  }

  it("новачок без підписки, що зник на три дні, отримує запрошення, а не тишу", async () => {
    expect(await sendDay3(false)).toContain("#settings-notifications");
  });

  it("підписана людина отримує звичайний лист без запрошення", async () => {
    expect(await sendDay3(true)).not.toContain("#settings-notifications");
  });
});
