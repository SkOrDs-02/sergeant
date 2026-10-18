import { describe, expect, it } from "vitest";
import { dataDisclosureMessages } from "./uk.dataDisclosure";
import { messagesEn } from "./en";

describe("bank data disclosure", () => {
  it("describes stored Monobank history and the server export in Ukrainian", () => {
    const { body, bankNote } = dataDisclosureMessages.sunset;
    expect(body).toContain("щонайменше за 30 днів");
    expect(bankNote).toContain("Операції Monobank, які Sergeant уже отримав");
    expect(bankNote).toContain("зберігаються на сервері Sergeant");
    expect(bankNote).toContain("входять до серверного експорту акаунта");
    expect(bankNote).toContain("Без доступу до банку");
    expect(bankNote).not.toContain("ми не дублюємо");
  });

  it("describes stored Monobank history and the server export in English", () => {
    const { body, bankNote } = messagesEn.dataDisclosure!.sunset;
    expect(body).toContain("at least 30 days");
    expect(bankNote).toContain(
      "Monobank transactions Sergeant has already received",
    );
    expect(bankNote).toContain("stored on Sergeant's server");
    expect(bankNote).toContain("included in your account's server export");
    expect(bankNote).toContain("Without bank access");
    expect(bankNote).not.toContain("we do not duplicate");
  });
});
