import { describe, expect, it } from "vitest";
import { searchFieldAutofillGuard, searchFieldProps } from "./searchFieldProps";

describe("searchFieldProps", () => {
  it("вимикає автозаповнення браузера", () => {
    // Головний шар фіксу: Chrome ігнорує `off` лише для `type="password"`,
    // тож для пошукового поля це найсильніший сигнал.
    expect(searchFieldProps("settings-search").autoComplete).toBe("off");
  });

  it("проносить `name` як є — щоб евристика читала поле як пошукове", () => {
    expect(searchFieldProps("hub-search").name).toBe("hub-search");
  });

  it("вимикає автокорекцію, автокапіталізацію і перевірку орфографії", () => {
    const props = searchFieldProps("hub-search");
    expect(props.autoCorrect).toBe("off");
    expect(props.autoCapitalize).toBe("off");
    expect(props.spellCheck).toBe(false);
  });

  it.each([
    ["data-1p-ignore", ""],
    ["data-lpignore", "true"],
    ["data-bwignore", "true"],
    ["data-form-type", "other"],
  ])("несе opt-out %s для стороннього менеджера паролів", (attr, value) => {
    // Сторонні менеджери не читають `autocomplete` — у кожного свій атрибут,
    // тому одного `off` не досить.
    expect(searchFieldProps("hub-search")).toHaveProperty(attr, value);
  });

  it("guard без `name` не тягне за собою `name`", () => {
    // `Input` підмішує саме цей варіант і не має затирати `name`, яким
    // react-hook-form привʼязує поле.
    expect(searchFieldAutofillGuard).not.toHaveProperty("name");
    expect(searchFieldAutofillGuard.autoComplete).toBe("off");
  });

  it("повертає новий обʼєкт на кожен виклик", () => {
    // Спред у JSX не має мутувати спільну константу через спільну ссилку.
    const a = searchFieldProps("hub-search");
    const b = searchFieldProps("hub-search");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
