// DOM-free helper-и Фізрука. Web-only частини (localStorage-обгортка
// `fizrukStorage`, backup apply з персистом) лишаються в `apps/web`.
export * from "./backupSerialization.js";
// W1-CANON-AGG стадія 1: канонічний періодний агрегатор (обʼєм + кількість
// тренувань). Споживачів поки немає за задумом — див. AI-CONTEXT у periodAggregate.ts.
export * from "./periodAggregate.js";
export * from "./recoveryCompute.js";
export * from "./recoveryConflict.js";
export * from "./injuryBlock.js";
export * from "./kcalBurned.js";
export * from "./recoveryForecast.js";
export * from "./restSettings.js";
export * from "./trainingPrograms.js";
export * from "./workoutStats.js";
export * from "./workoutUi.js";
