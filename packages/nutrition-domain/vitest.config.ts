import { defineConfig } from "vitest/config";
import { baseCoverageConfig } from "@sergeant/config/vitest.base";

export default defineConfig({
  test: {
    environment: "node",
    // TZ пінимо навмисно. Тести дня ПРИСТРОЮ (ADR-0078) читають локальні
    // геттери `Date`, а їхні межові моменти задані в UTC — тож на машині
    // розробника в Києві той самий інстант дає інший день-ключ, і зелений
    // тут ставав червоним там. Іронія в тому, що це набір тестів ПРО
    // таймзони. CI і так рахує UTC, тож для нього це но-оп; фіксація лікує
    // локальні прогони й робить намір явним.
    env: { TZ: "UTC" },
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    coverage: {
      ...baseCoverageConfig,
      include: ["src/**/*.ts"],
    },
  },
});
