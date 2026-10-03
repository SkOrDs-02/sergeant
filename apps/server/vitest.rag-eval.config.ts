import { defineConfig } from "vitest/config";

/**
 * Окремий прогін RAG-евалу: `*.ragEval.test.ts`.
 *
 * Чому не крок усередині `test:integration`. Урок із AGENTS.md
 * § Performance budgets: `size-limit` стояв кроком після «Format, lint,
 * test, build», і коли той червонів, гейт просто не виконувався — в
 * логах це виглядало не як «бюджет перевищено», а як тиша. Гейт, що
 * стоїть після потенційно червоного кроку, не є гейтом. Тому окремий
 * конфіг, окремий скрипт і окрема CI-джоба.
 */
export default defineConfig({
  esbuild: { tsconfigRaw: "{}" },
  test: {
    environment: "node",
    include: ["src/**/*.ragEval.test.ts"],
    // Порожній прогін означає зламаний конфіг або чекаут, а не «нема що
    // перевіряти» — гейт не має світитись зеленим ні за яких обставин.
    passWithNoTests: false,
    testTimeout: 120_000,
    hookTimeout: 300_000,
    pool: "forks",
    isolate: true,
    // Головний вихід цього прогону — надруковані recall@K / P@1 / MRR і
    // дельта до базової лінії. Під перехопленням консолі vitest ховає їх
    // із форк-воркера, і в CI лишається саме «зелено» без жодного числа.
    disableConsoleIntercept: true,
  },
});
