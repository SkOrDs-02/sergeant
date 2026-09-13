import { type Hit, pushScored } from "./searchTypes";

/**
 * PR-S5 (аудит 2026-09-13 хвиля 5): `searchSources.ts` індексував модулі,
 * Налаштування (`searchSettings.ts`) і AI-можливості, але не Профіль —
 * запити «пароль», «сесії», «PIN», «вага», «вийти», «видалити акаунт»
 * давали нуль, хоча каталогізація Налаштувань цю саму проблему колись і
 * закривала. Список нижче дзеркалить реальні секції `ProfilePage.tsx`
 * (групи «Безпека» / «Про тебе» / «Акаунт» + окрема кнопка «Вийти» під
 * хіро) — тримай його синхронним, якщо секції Профілю зміняться.
 *
 * На відміну від `SETTINGS_INDEX`, тут немає per-секційного `sectionId`:
 * `ProfilePage` розкриває свої `CollapsibleSection`-и через локальний
 * `storageKey`-стан, а не через `SettingsGroupDefaultOpenContext`/hash,
 * тож ціль хіта лише перемикає вкладку хаба на «Профіль» — глибший
 * діп-лінк у конкретну секцію Профілю лишається окремим боргом (немає
 * аналога `anchorId` для `CollapsibleSection`).
 */
export interface ProfileSearchEntry {
  id: string;
  title: string;
  description: string;
  keywords: string;
  icon: string;
}

export const PROFILE_INDEX: readonly ProfileSearchEntry[] = [
  {
    id: "password",
    title: "Пароль",
    description: "Зміна пароля акаунта",
    keywords: "пароль password зміна",
    icon: "lock",
  },
  {
    id: "sessions",
    title: "Активні сесії",
    description: "Пристрої з доступом до акаунта",
    keywords: "сесії сесія пристрої devices sessions",
    icon: "monitor",
  },
  {
    id: "applock",
    title: "Блокування застосунку",
    description: "PIN при відкритті на цьому пристрої",
    keywords: "pin пін код блокування lock застосунок",
    icon: "shield",
  },
  {
    id: "memory",
    title: "Памʼять",
    description: "Твої факти й усе, що запамʼятав Сержант",
    // Апостроф стрипається на нормалізації (`normalize()` у
    // `@sergeant/insights`), тож альтернативний правопис тут не потрібен.
    keywords: "памʼять memory факти сержант",
    icon: "brain",
  },
  {
    id: "biometrics",
    title: "Біометрія",
    description: "Зріст, вага, активність для розрахунку калорій",
    keywords: "біометрія вага зріст activity weight height",
    icon: "activity",
  },
  {
    id: "logout",
    title: "Вийти",
    description: "Вийти з акаунта на цьому пристрої",
    keywords: "вийти вихід logout",
    icon: "log-out",
  },
  {
    id: "danger",
    title: "Видалення акаунта",
    description: "Незворотні дії",
    keywords: "видалити акаунт delete account видалення",
    icon: "alert-triangle",
  },
];

export function searchProfile(tokens: string[]): Hit[] {
  const results: Hit[] = [];
  for (const entry of PROFILE_INDEX) {
    pushScored(
      results,
      {
        id: `profile_${entry.id}`,
        module: "profile",
        moduleLabel: "Профіль",
        title: entry.title,
        // Keywords беруть участь у скорингу (як `SETTINGS_INDEX` у
        // `searchSettings.ts`); прибираємо їх з видимого subtitle нижче.
        subtitle: `${entry.description} · ${entry.keywords}`,
        icon: entry.icon,
        target: { kind: "profile" },
      },
      tokens,
      8,
    );
  }
  return results
    .map((r) => ({
      ...r,
      subtitle:
        PROFILE_INDEX.find((e) => `profile_${e.id}` === r.id)?.description ??
        r.subtitle,
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
}
