/**
 * Реєстр можливостей додатка для `/capabilities`.
 *
 * Свідомо статичний список у коді, а не генерація з роутера чи MDX. Опис
 * «навіщо це юзеру» все одно пишеться руками, тож автогенерація дала б лише
 * назви маршрутів — тобто найменш корисну частину. Плоский масив натомість
 * тривіально тестується (кожен `href` мусить резолвитись у справжній екран) і
 * дописується в тому ж PR, що й сама фіча.
 *
 * Це НЕ каталог інструментів чату — той живе на `/assistant` і відповідає на
 * інше питання: «що вміє Сержант», а не «що вміє додаток».
 *
 * Правила для нових записів:
 *   - `href` веде на реальний, досяжний екран (перевіряється тестом);
 *   - `description` — 1-2 речення про користь, без назв компонентів;
 *   - `module` заповнюємо лише для модульних записів: він фарбує іконку
 *     акцентом модуля (ex-Hard Rule #12, retired ADR-0081 — акцент не виходить
 *     за свій сабтрі; дизайн-конвенція тримається tokens + review).
 */

import type { HubModuleId } from "@shared/lib/modules/hubNav";

export interface Capability {
  id: string;
  title: string;
  description: string;
  /** Design-system icon name. */
  icon: string;
  /** Куди веде тап. Мусить бути відомим маршрутом. */
  href: string;
  /** Модульний акцент іконки. Відсутній — нейтральна подача. */
  module?: HubModuleId;
}

export interface CapabilityGroup {
  id: string;
  title: string;
  items: readonly Capability[];
}

export const CAPABILITY_GROUPS: readonly CapabilityGroup[] = [
  {
    id: "modules",
    title: "Модулі",
    items: [
      {
        id: "finyk",
        title: "Фінік: гроші",
        description:
          "Витрати й доходи з банку, чека або вручну; бюджети, підписки, цілі та ліміти по категоріях. Показує картину місяця без вигаданих даних.",
        icon: "wallet",
        href: "/finyk",
        module: "finyk",
      },
      {
        id: "fizruk",
        title: "Фізрук: тренування",
        description:
          "Журнал тренувань, підходів і ваг, план на місяць, відновлення та позначки болю. Памʼятає попередні результати й історію ваги.",
        icon: "dumbbell",
        href: "/fizruk",
        module: "fizruk",
      },
      {
        id: "nutrition",
        title: "Їжа: харчування",
        description:
          "Прийоми їжі, КБЖВ, вода, комора, рецепти й плани. Ціль стартує з біометрії та щотижня уточнюється за журналом їжі й зміною ваги; її можна змінити вручну.",
        icon: "utensils",
        href: "/nutrition/menu",
        module: "nutrition",
      },
      {
        id: "routine",
        title: "Рутина: звички",
        description:
          "Щоденні й тижневі звички, паузи, нагадування та чесні серії. Видно виконання за календарем і те, що почало зриватися.",
        icon: "repeat",
        href: "/routine",
        module: "routine",
      },
    ],
  },
  {
    id: "sergeant",
    title: "Сержант",
    items: [
      {
        id: "chat",
        title: "Чат із Сержантом",
        description:
          "Питай про свої дані звичайною мовою: Сержант сам підніме потрібні записи й може одразу щось додати чи порахувати.",
        icon: "sergeant",
        href: "/chat",
      },
      {
        id: "assistant-catalogue",
        title: "Що вміє Сержант",
        description:
          // Без числа навмисно: сама сторінка каталогу рахує сценарії
          // динамічно (`totalCount` у `AssistantCataloguePage`), а зашите тут
          // «~60» встигло розійтися з фактичними 80 (аудит 2026-08-04,
          // знахідка 14). Дублювати лічильник у двох місцях — гарантований
          // дрейф.
          "Каталог сценаріїв із прикладами команд, від «додай витрату» до розбору тижня.",
        icon: "list",
        href: "/assistant",
      },
      {
        id: "insights",
        title: "Звʼязки між сферами",
        description:
          "Що з чим збігається у твоїх даних, закономірності за весь час і звіти модулів за тиждень чи місяць.",
        icon: "bar-chart",
        // Пряма ціль вкладки хаба (не `/insights`) — з тієї ж причини, що
        // й у записі «Працює офлайн» нижче: `/insights` тепер сам є лише
        // редиректом сюди ж, тож старий href платив зайвим стрибком
        // навігації без жодної користі.
        href: "/?tab=reports",
      },
    ],
  },
  {
    id: "platform",
    title: "Дані та приватність",
    items: [
      {
        id: "offline",
        title: "Працює офлайн",
        description:
          "Записи зберігаються на пристрої, тож застосунок відкривається й без мережі. Синхронізація доганяє, коли звʼязок повернеться.",
        icon: "cloud-off",
        // Пряма ціль вкладки хаба (не `/settings`) — L-1 (2026-08-08):
        // `/settings` тепер сам є лише редиректом сюди ж, тож старий
        // href платив зайвим стрибком навігації без жодної користі.
        href: "/?tab=settings&group=advanced#settings-pwa",
      },
      {
        id: "privacy",
        title: "PIN і контроль над даними",
        description:
          "Вхід за PIN-кодом, керування згодами на аналітику й AI-памʼять, повне видалення акаунта.",
        icon: "lock",
        href: "/?tab=settings&group=advanced#settings-privacy",
      },
      {
        id: "export",
        title: "Експорт та імпорт",
        description:
          "Забрати всі свої дані одним JSON-файлом або перенести їх на інший пристрій.",
        icon: "download",
        href: "/?tab=settings&group=advanced#settings-dataExport",
      },
    ],
  },
];

/** Плоский список — зручно для тестів і лічильників. */
export const ALL_CAPABILITIES: readonly Capability[] =
  CAPABILITY_GROUPS.flatMap((group) => group.items);
