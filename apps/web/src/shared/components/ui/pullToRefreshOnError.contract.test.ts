import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Контракт: кожен `<PullToRefresh>` у вебі передає `onError` — знахідка PR-X3
 * наскрізного огляду 2026-09-13, хвиля 8 «Система».
 *
 * ЧОМУ СКАН, А НЕ ОБОВʼЯЗКОВИЙ ПРОП. Без `onError` хук жесту
 * (`usePullToRefresh`) ковтає відмову `onRefresh`, і спінер зникає так само,
 * як після успіху. Після хвилі 2 (`requestCloudPull` відхиляється з
 * `CloudPullError`) тост мали лише Рутина та Їжа; Фінік, Фізрук і хаб
 * `onError` не передавали, тож провал пулу офлайн там виглядав як оновлення.
 * Обовʼязковий проп у типі зачепив би ще й стаби в тестах і сторі, де помилки
 * немає звідки взятись; тут гейт рівно на продуктовий код.
 *
 * Новий жест бере `usePullRefreshErrorToast(retry)` — тост із «Повторити».
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");

function collectTsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      collectTsxFiles(full, out);
      continue;
    }
    if (!entry.endsWith(".tsx")) continue;
    if (entry.includes(".test.") || entry.includes(".stories.")) continue;
    out.push(full);
  }
  return out;
}

interface Usage {
  site: string;
  tag: string;
}

/** Відкривальні теги `<PullToRefresh …>` з балансом фігурних дужок. */
function collectUsages(): Usage[] {
  const usages: Usage[] = [];
  for (const file of collectTsxFiles(WEB_SRC)) {
    // Сам примітив: у докстрінгу приклади без `onError`, і це не call-site.
    if (file.endsWith("/shared/components/ui/PullToRefresh.tsx")) continue;
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/<PullToRefresh\b(?!Indicator)/g)) {
      const start = match.index;
      let depth = 0;
      let i = start;
      for (; i < src.length; i += 1) {
        const ch = src[i];
        if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
        else if (ch === ">" && depth === 0) break;
      }
      usages.push({
        site: `${relative(WEB_SRC, file)}:${src.slice(0, start).split("\n").length}`,
        tag: src.slice(start, i + 1),
      });
    }
  }
  return usages;
}

const USAGES = collectUsages();

describe("PullToRefresh — провал жесту не мовчить", () => {
  it("сканер бачить щонайменше пʼять жестів (хаб і чотири модулі)", () => {
    // Захист від тихого нуля: перейменування тега чи зламаний сканер не
    // мають робити тест нижче зеленим на порожньому списку.
    expect(USAGES.length).toBeGreaterThanOrEqual(5);
  });

  it("кожен <PullToRefresh> передає onError", () => {
    const offenders = USAGES.filter((u) => !/\bonError=\{/.test(u.tag)).map(
      (u) => u.site,
    );
    expect(offenders).toEqual([]);
  });
});
