/**
 * URL-параметри `HubSettingsPage`: `?billing=…`, `?group=…` та пошук
 * власника вкладки для section id. Винесено з `HubSettingsPage.tsx`
 * (CodeRabbit-ревʼю PR #757, 2026-08-08) — не заради ліміту рядків
 * (ESLint-гейт Hard Rule #18 і без цього зелений, лічить зі
 * skipBlankLines+skipComments), а щоб зменшити складність самого файла
 * сторінки. Поведінка не змінена — ті самі три функції з тим самим
 * контрактом.
 *
 * `GROUPS` (масив вкладок «Загальні»/«Розділи»/«Додатково») лишається в
 * `HubSettingsPage.tsx` — це не URL-хелпер, а даність структури сторінки,
 * яку сторінка теж рендерить (Tabs, activeGroupLabel тощо). Щоб уникнути
 * циклічного імпорту (сторінка → цей файл → назад за GROUPS), хелпери
 * нижче приймають групи явним параметром замість замикання на
 * module-scope константу.
 */

/** Мінімальна форма вкладки, потрібна цим хелперам. */
export interface SettingsTabGroupLike {
  id: string;
  sections: readonly string[];
}

/**
 * Дефект №2 (адверсарне ревʼю 2026-08-08): billing-return (`?billing=
 * portal-return|manage`) таргетить «Підписка та план» так само, як
 * `#settings-plan` — обидва мусять суплресити форсоване відкриття першої
 * секції вкладки. Для хеша це відомо СИНХРОННО (з `location.hash` на
 * mount), але billing-таргет раніше ставав відомим лише ПІЗНІШЕ, через
 * `queueMicrotask` в ефекті нижче — а на той момент «Дашборд» (перша
 * секція «Загальних») уже змонтувався й зафіксував свій `open` через
 * `useState`-ініціалізатор у `SettingsGroup`; пізніший `setHashSectionId`
 * більше не міг це скасувати. Читаючи billing-параметр тут, у тому ж
 * ініціалізаторі `hashSectionId` нижче, суплресія спрацьовує з ПЕРШОГО
 * рендеру — до того, як «Дашборд» встигає змонтуватись.
 */
export function readBillingReturnSectionId(search: string): string | null {
  try {
    const billing = new URLSearchParams(search).get("billing");
    return billing === "portal-return" || billing === "manage" ? "plan" : null;
  } catch {
    return null;
  }
}

export function groupForSection<G extends SettingsTabGroupLike>(
  sectionId: string | null,
  groups: readonly G[],
): G | undefined {
  if (!sectionId) return undefined;
  return groups.find((group) => group.sections.includes(sectionId));
}

/**
 * Read the active inner-tab from `?group=…`. Returns the group id only if
 * it matches a known group's `id`; anything else (missing / malformed /
 * unknown) returns `null` so the caller falls back to the default
 * resolution chain (hash → "general").
 */
export function readSettingsGroupParam<G extends SettingsTabGroupLike>(
  search: string,
  groups: readonly G[],
): string | null {
  try {
    const raw = new URLSearchParams(search).get("group");
    if (!raw) return null;
    if (groups.some((group) => group.id === raw)) return raw;
  } catch {
    /* SSR / non-browser */
  }
  return null;
}
