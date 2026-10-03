import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  accountDeletionDeadline,
} from "./accountDeletion";

describe("accountDeletionDeadline", () => {
  it("додає рівно ACCOUNT_DELETION_GRACE_DAYS днів", () => {
    const requested = new Date("2026-09-20T10:00:00.000Z");
    const deadline = accountDeletionDeadline(requested);
    expect(deadline.toISOString()).toBe("2026-10-20T10:00:00.000Z");
    expect(
      (deadline.getTime() - requested.getTime()) / (24 * 60 * 60 * 1000),
    ).toBe(ACCOUNT_DELETION_GRACE_DAYS);
  });

  it("не мутує переданий момент", () => {
    const requested = new Date("2026-09-20T10:00:00.000Z");
    accountDeletionDeadline(requested);
    expect(requested.toISOString()).toBe("2026-09-20T10:00:00.000Z");
  });

  it("рахує в абсолютному часі, тож перехід на зимовий час не зсуває дедлайн", () => {
    // Європейський перехід 2026-10-25 потрапляє всередину вікна: якби
    // дедлайн рахувався календарними днями в локальній зоні, тут би
    // зʼявилась година різниці, і сервер добив би акаунт не тоді, коли
    // показав людині.
    const requested = new Date("2026-10-10T23:30:00.000Z");
    expect(accountDeletionDeadline(requested).toISOString()).toBe(
      "2026-11-09T23:30:00.000Z",
    );
  });
});
