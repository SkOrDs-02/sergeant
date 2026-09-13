/**
 * Status: Active
 *
 * Гейт на контракт `role="tablist"`: роль без клавіатурної машинерії —
 * обіцянка, яку інтерфейс не виконує.
 *
 * **Чому це потребує саме сканера.** Роль виглядає як оформлення, тож її
 * дописують «щоб скрінрідер зрозумів», не помічаючи, що вона зобовʼязує до
 * стрілок. На момент аудиту 2026-09-13 (знахідка PR-C5) у репо були ТРИ
 * робочі реалізації патерну (`Tabs`, `Segmented`, `ModuleBottomNav`) і
 * ЧОТИРИ місця з роллю без жодної. Тобто помилка не в незнанні — логіка
 * лежала поруч; помилка в тому, що ніщо не звіряло роль із поведінкою.
 *
 * Найдорожчий випадок був у `ModuleSwitcher`: roving tabindex БЕЗ стрілок
 * робив неактивні модулі недосяжними з клавіатури взагалі. Половину патерну
 * там пінив тест, друга половина через це виглядала свідомо пропущеною —
 * саме тому гейт перевіряє ПАРУ, а не окремі половини.
 *
 * Правило: файл із `role="tablist"` або бере `useTablistArrowKeys`, або
 * стоїть у списку нижче з поясненням, чому машинерія в нього своя.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../..");

/**
 * Файли з ВЛАСНОЮ реалізацією стрілок. Кожен рядок — примітив, який хук і
 * не мав би використовувати: він сам є тим, звідки хук витягнуто, або має
 * ширшу логіку (приховування навбару, pending-стан).
 *
 * Це не «дозволені винятки на майбутнє»: новий call-site сюди не додають,
 * він бере хук. Додавати рядок можна лише разом із доказом, що стрілки в
 * тому файлі є і працюють.
 */
const OWN_IMPLEMENTATION = new Map<string, string>([
  ["shared/components/ui/Tabs.tsx", "примітив вкладок, власний onKeyDown"],
  [
    "shared/components/ui/Segmented.tsx",
    "примітив сегментів, власний onKeyDown",
  ],
  [
    "shared/components/ui/ModuleBottomNav.tsx",
    "джерело, з якого витягнуто хук; додатково знає про приховування навбару",
  ],
  ["core/app/HubBottomNav.tsx", "нижній навбар хабу, власний roving tabindex"],
  [
    "modules/routine/components/RoutineBottomNav.tsx",
    "не свій tablist — передає role пропом у ModuleBottomNav, машинерія там",
  ],
]);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (entry.includes(".test.") || entry.includes(".stories.")) continue;
    out.push(full);
  }
  return out;
}

/**
 * Прибирає коментарі. Два файли (`BodyAtlasSegGroup`, `PantrySourceTabs`)
 * ЦИТУЮТЬ `role="tablist"`, пояснюючи, чому вони його свідомо НЕ беруть —
 * і це правильні файли, а не порушники.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("контракт role=tablist ↔ клавіатура", () => {
  const files = collectSourceFiles(WEB_SRC);

  it("сканер бачить достатньо файлів, щоб перевірка щось означала", () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it("кожен tablist має стрілки — свої або з хука", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      if (!/role=(?:"tablist"|\{"tablist"\})/.test(code)) continue;

      const rel = relative(WEB_SRC, file).split("\\").join("/");
      if (OWN_IMPLEMENTATION.has(rel)) continue;
      if (code.includes("useTablistArrowKeys")) continue;

      offenders.push(
        `${rel} — має role="tablist", але ні useTablistArrowKeys, ні запису в OWN_IMPLEMENTATION`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it("список власних реалізацій не протух", () => {
    // Запис, чий файл зник або втратив роль, — це вже не виняток, а мертвий
    // рядок, який тихо послабив би гейт для майбутнього файлу з тим шляхом.
    const stale: string[] = [];
    for (const [rel, why] of OWN_IMPLEMENTATION) {
      const full = join(WEB_SRC, rel);
      let code: string;
      try {
        code = stripComments(readFileSync(full, "utf8"));
      } catch {
        stale.push(`${rel} — файл не існує (${why})`);
        continue;
      }
      if (
        !/role=(?:"tablist"|\{"tablist"\}|\{isTablist \? "tablist" : undefined\})/.test(
          code,
        )
      ) {
        stale.push(`${rel} — більше не оголошує role="tablist" (${why})`);
      }
    }
    expect(stale).toEqual([]);
  });
});
