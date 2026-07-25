/** @status Active */

/**
 * Копія розділу «Конфіденційність» у налаштуваннях + privacy-чип у хабі.
 *
 * AI-CONTEXT: винесено з `uk.ts` 2026-07-25, коли додавання групи
 * `aiMemory` штовхнуло каталог за `max-lines: 600` (Hard Rule #18).
 * Той самий приклад, що `uk.finyk.ts` / `uk.fizruk.ts` / `uk.routine.ts`:
 * каталог росте разом із продуктом, тож ділиться по розділах, а не
 * ратчетиться ліміт.
 */
export const privacyMessages = {
  // G4-a — privacy indicator chip in HubHeader + soft-prompt banner.
  chip: "Тільки ти",
  chipTooltip: "Усі дані — локально, без хмари",
  bannerTitle: "Захисти Sergeant блокуванням",
  bannerHint: "PIN · Face ID — для Mono-токена і медичних даних",
  bannerCta: "Налаштувати",

  lock: {
    sectionTitle: "Конфіденційність",
    enableLabel: "Блокування додатку",
    enableDescription:
      "Захисти дані PIN-кодом. Додаток заблокується при переключенні або після 5 хвилин бездіяльності.",
    setupTitle: "Встановити PIN",
    setupSubtitle: "Введи 4–6 цифр",
    changeTitle: "Змінити PIN",
    confirmTitle: "Підтвердь PIN",
    confirmSubtitle: "Введи PIN ще раз для підтвердження",
    unlockTitle: "Введи PIN",
    unlockSubtitle: "Введи PIN, щоб розблокувати",
    pinMismatch: "PIN-коди не збігаються. Спробуй ще раз.",
    pinWrong: "Невірний PIN. Спробуй ще раз.",
    pinTooShort: "PIN має містити від 4 до 6 цифр.",
    lockNow: "Заблокувати зараз",
    changePin: "Змінити PIN",
    disableLabel: "Вимкнути блокування",
    disableConfirmTitle: "Вимкнути блокування?",
    disableConfirmBody: "Додаток більше не буде запитувати PIN при відкритті.",
    disableConfirmButton: "Вимкнути",
    recoveryHint: "Забув PIN? Скинь через відновлення акаунту.",
    next: "Далі",
    back: "Назад",
    open: "Відкрити",
    deleteDigit: "Видалити",
  },

  // Налаштування → «Згода та дані» → список фактів AI-памʼяті.
  // Формулювання «назавжди» тут не риторичне: серверний шлях робить
  // `DELETE FROM ai_memories`, без soft-delete і без вікна відновлення
  // (рішення founder-а 2026-07-25). Якщо семантика зміниться — цей
  // текст треба міняти тим самим PR-ом.
  aiMemory: {
    sectionTitle: "Що ШІ про тебе памʼятає",
    sectionHint: "Кожен факт можна видалити окремо. Видалене зникає назавжди.",
    loading: "Завантажую памʼять…",
    loadError: "Не вдалося завантажити памʼять ШІ.",
    empty:
      "Поки що ШІ нічого про тебе не записав. Факти зʼявляються, коли ти згадуєш у чаті щось важливе — алергію, ціль, обмеження.",
    loadMore: "Показати більше",
    loadingMore: "Завантажую…",
    deleteAria: "Видалити факт",
    confirmTitle: "Видалити цей факт?",
    confirmBody: "зникне з памʼяті ШІ назавжди — відновити не вийде.",
    confirmButton: "Видалити назавжди",
    deleteError: "Не вдалося видалити факт. Спробуй ще раз.",
  },
};
