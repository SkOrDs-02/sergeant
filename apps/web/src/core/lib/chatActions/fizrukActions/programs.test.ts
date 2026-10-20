import { describe, it, expect, vi, beforeEach } from "vitest";
import { addProgramDay, ADD_PROGRAM_DAY_UNSUPPORTED } from "./programs";

// Тул `add_program_day` писав у `fizruk_plan_template_v1` (ключ, якого у вебі
// ніхто не читає) і рапортував «збережено». Тепер він відмовляє й нічого не
// пише: перевіряємо обидва боки (текст і відсутність запису).
const lsSet = vi.fn();
vi.mock("../../hubChatUtils", () => ({
  ls: vi.fn((_key: string, def: unknown) => def),
  lsSet: (...args: unknown[]) => lsSet(...args),
}));

describe("addProgramDay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("не рапортує «збережено»: чесна відмова, яку картка читає як провал", () => {
    const out = addProgramDay();
    expect(out).toBe(ADD_PROGRAM_DAY_UNSUPPORTED);
    expect(out).toMatch(/^Не вдалося/);
    expect(out).not.toMatch(/збережено:/);
    expect(out).toContain("НЕ стверджуй");
  });

  it("нічого не записує ні через ls-хелпер, ні в localStorage", () => {
    addProgramDay();
    expect(lsSet).not.toHaveBeenCalled();
    expect(localStorage.getItem("fizruk_plan_template_v1")).toBeNull();
  });
});
