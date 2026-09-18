import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FtuxDay = "day_0" | "day_1" | "day_3";
type TestJob = ReturnType<typeof job>;

interface JobsHarness {
  __resetFtuxDripQueueForTesting(): void;
  processFtuxDripJob(job: TestJob): Promise<void>;
}

interface MailHarness {
  configureFtuxDripDispatcher(deps: { pool: unknown }): void;
  classifyDispatchOutcome(err: unknown): { outcome: string };
  FtuxDripSkip: new (
    outcome: "skipped_optout" | "skipped_already_sent" | "skipped_user_deleted",
    message: string,
  ) => Error;
}

async function loadHarness(): Promise<{
  jobs: JobsHarness;
  mail: MailHarness;
}> {
  vi.resetModules();
  const jobsPath: string = "../lib/jobs/ftuxDrip.js";
  const mailPath: string = "./ftuxDripMail.js";
  const jobs = (await import(jobsPath)) as JobsHarness;
  const mail = (await import(mailPath)) as MailHarness;
  return { jobs, mail };
}

function job(day: FtuxDay = "day_0") {
  return {
    data: {
      kind: "ftux_drip" as const,
      day,
      userId: "u_1",
      email: "stale@example.com",
      delayMs: 0,
      variant: "control",
    },
    attemptsMade: 1,
    name: day,
  };
}

describe("ftux drip mail dispatcher", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
    vi.stubEnv("PUBLIC_APP_URL", "https://app.example.com/");
    vi.stubEnv("RESEND_API_KEY", "resend_test");
    vi.stubEnv("RESEND_FROM", "Sergeant <hello@example.com>");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    const { jobs } = await loadHarness();
    jobs.__resetFtuxDripQueueForTesting();
  });

  it("sends via Resend, reserves the campaign row, and stores provider id", async () => {
    const { jobs, mail } = await loadHarness();
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "u_1", email: "fresh@example.com", name: " Діма " }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "55" }] })
      .mockResolvedValueOnce({ rows: [] });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "email_1" }), { status: 200 }),
    );

    mail.configureFtuxDripDispatcher({ pool: { query } as never });
    await jobs.processFtuxDripJob(job("day_0"));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer resend_test",
          "Content-Type": "application/json",
        },
      }),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body,
    ) as {
      from: string;
      to: string[];
      text: string;
      html: string;
    };
    expect(body.from).toBe("Sergeant <hello@example.com>");
    expect(body.to).toEqual(["fresh@example.com"]);
    expect(body.text).toContain("https://app.example.com");
    expect(body.html).toContain("/api/email/unsubscribe?u=u_1.");

    expect(query.mock.calls[2]?.[1]).toEqual([
      "ftux_drip_day_0",
      "u_1",
      expect.any(String),
      null,
      "control",
      JSON.stringify({ day: "day_0", attempts: 0 }),
    ]);
    expect(query.mock.calls[3]?.[1]).toEqual([55, "email_1"]);
  });

  it("soft-skips when the user was deleted before dispatch", async () => {
    const { jobs, mail } = await loadHarness();
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });

    mail.configureFtuxDripDispatcher({ pool: { query } as never });

    await expect(jobs.processFtuxDripJob(job())).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("soft-skips opt-out and already-sent rows before calling Resend", async () => {
    const { jobs, mail } = await loadHarness();
    const optOutQuery = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "u_1", email: "fresh@example.com", name: null }],
      })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    mail.configureFtuxDripDispatcher({ pool: { query: optOutQuery } as never });
    await expect(
      jobs.processFtuxDripJob(job("day_1")),
    ).resolves.toBeUndefined();

    const alreadySentQuery = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "u_1", email: "fresh@example.com", name: null }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mail.configureFtuxDripDispatcher({
      pool: { query: alreadySentQuery } as never,
    });
    await expect(
      jobs.processFtuxDripJob(job("day_3")),
    ).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws retryable Resend failures so BullMQ can retry", async () => {
    const { jobs, mail } = await loadHarness();
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "u_1", email: "fresh@example.com", name: null }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "55" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 503 }));

    mail.configureFtuxDripDispatcher({ pool: { query } as never });

    await expect(jobs.processFtuxDripJob(job())).rejects.toThrow(
      /Resend HTTP 503/,
    );
    // Чотири запити, а не три: user → opt-out → claim → ВІДКОТ claim-у.
    expect(query).toHaveBeenCalledTimes(4);
  });

  it("releases the claim on a non-2xx Resend reply so the retry re-sends", async () => {
    const { jobs, mail } = await loadHarness();
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "u_1", email: "fresh@example.com", name: null }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "55" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 503 }));

    mail.configureFtuxDripDispatcher({ pool: { query } as never });
    await expect(jobs.processFtuxDripJob(job())).rejects.toThrow(
      /Resend HTTP 503/,
    );

    // Регресія: до фіксу claim лишався, і КОЖЕН із 5 ретраїв BullMQ бачив
    // `isNew === false` → закривав job як `skipped_already_sent`. Лист не
    // приходив ніколи, а в логах це виглядало як штатний скіп дубля.
    const release = query.mock.calls.at(-1) as [string, unknown[]];
    expect(release[0]).toMatch(/DELETE FROM email_campaigns_log/);
    // Запобіжник: рядок із уже відомим id апстріму не видаляємо ніколи.
    expect(release[0]).toMatch(/provider_message_id IS NULL/);
    expect(release[1]).toEqual([55]);
  });

  it("keeps the claim when the transport fails without a reply", async () => {
    const { jobs, mail } = await loadHarness();
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "u_1", email: "fresh@example.com", name: null }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "55" }] });
    // Обрив/таймаут: Resend НЕ відповів, тож ми не знаємо, чи прийнято лист.
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

    mail.configureFtuxDripDispatcher({ pool: { query } as never });
    await expect(jobs.processFtuxDripJob(job())).rejects.toThrow(
      /socket hang up/,
    );

    // Три запити, без четвертого: claim свідомо ЛИШАЄТЬСЯ. Відкотити його
    // тут означало б ризик другого листа тій самій людині — а дубль гірший
    // за рідкісний втрачений лист.
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("classifies direct-dispatch outcomes", async () => {
    const { mail } = await loadHarness();

    expect(mail.classifyDispatchOutcome(null)).toEqual({ outcome: "ok" });
    expect(mail.classifyDispatchOutcome(new Error("network"))).toEqual({
      outcome: "retry",
    });
    expect(
      mail.classifyDispatchOutcome(
        new mail.FtuxDripSkip("skipped_optout", "opted out"),
      ),
    ).toEqual({ outcome: "skipped_optout" });
  });
});
