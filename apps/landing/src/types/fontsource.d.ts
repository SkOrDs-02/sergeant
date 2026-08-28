// `@fontsource-variable/*` – це CSS-пакети без типів. Side-effect-імпорт
// тягне @font-face; TypeScript про такі модулі не знає, тож оголошуємо явно.
declare module "@fontsource-variable/manrope";
