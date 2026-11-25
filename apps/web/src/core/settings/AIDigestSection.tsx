/**
 * Last validated: 2026-11-18
 * Status: Active
 */
import { useState } from "react";
import { useHubPref, HUB_PREF_MONDAY_AUTO } from "./hubPrefs";
import { settingsSectionTitle } from "../hub/settingsSectionsCatalog";
import { useWeeklyDigest } from "../insights/useWeeklyDigest";
import { IosInstallPushHint } from "@shared/components/ui/IosInstallPushHint";
import { requestNotificationPermission } from "@shared/hooks/useModuleReminder";
import { usePushNotifications } from "@shared/hooks/usePushNotifications";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { isIOSBrowserTab } from "@shared/lib/platform/iosStandalone";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";
import { useServerPreference } from "./useServerPreference";
import { formatDateTimeShort } from "@shared/lib/time/formatDate";

const sergeantCopy = messages.sergeant;

/**
 * Секція «Сержант»: усе, що Сержант робить сам, без запиту людини, — звіт
 * тижня і повідомлення, коли тебе не було кілька днів.
 *
 * AI-CONTEXT: рішення власника 2026-11-18 (варіант Б, PR-S8 аудиту
 * 2026-09-13). Доти тут був один тумблер звіту, а «Повідомлення від
 * Сержанта» жили в «Сповіщеннях». Згода на памʼять лишається в «Дані та
 * приватність» (це згода, а не дія Сержанта), сама памʼять — у Профілі.
 * Сховище тумблера не змінювалось: `sergeantNudges` у `/api/me/preferences`.
 */
export function AIDigestSection() {
  const { digest, weekRange } = useWeeklyDigest();
  const { warning: toastWarning } = useToast();
  const { subscribed: pushSubscribed } = usePushNotifications();
  // iPhone/iPad у вкладці Safari: push неможливий, тож замість тосту
  // показуємо, як встановити застосунок (О-1 (б), рішення власника
  // 2026-11-18); тумблер лишається вимкненим.
  const [showInstallHint, setShowInstallHint] = useState(false);
  // Default ON з 2026-08-30: дайджест поза AI-квотою, тож автозапуск
  // більше нічого не «зʼїдає». Відсутнє значення = увімкнено; «0» —
  // явний opt-out.
  // Тумблер переїхав у мішок `hub_prefs_v1` і тепер їде на акаунт
  // (залишок PR-S13). Дефолт лишається ON: відсутність ключа = увімкнено,
  // тож нічого не змінюється для тих, хто його не чіпав.
  const [mondayAuto, setMondayAuto] = useHubPref<boolean>(
    HUB_PREF_MONDAY_AUTO,
    true,
  );

  // Живе на сервері, а не в localStorage: цей прапорець читає серверний
  // шедулер тоді, коли жодного клієнта не запущено.
  const sergeantNudges = useServerPreference(
    "sergeantNudges",
    {
      saveError: sergeantCopy.nudgesSaveError,
      authRequired: sergeantCopy.nudgesAuthRequired,
    },
    false,
  );

  const handleToggleMondayAuto = (next: boolean) => {
    setMondayAuto(next);
  };

  const handleToggleNudges = (checked: boolean) => {
    if (checked && isIOSBrowserTab()) {
      setShowInstallHint(true);
      return;
    }
    // Дозвіл питаємо поруч із записом: увімкнений на сервері канал без
    // дозволу браузера — це тиха підписка на нічого. Запис не блокуємо,
    // як і доти в «Сповіщеннях»: дозвіл можна дати пізніше.
    if (
      checked &&
      typeof Notification !== "undefined" &&
      Notification.permission !== "granted"
    ) {
      void requestNotificationPermission().then((perm) => {
        if (perm === "install-required") {
          setShowInstallHint(true);
          return;
        }
        if (perm === "denied" || perm === "default") {
          toastWarning(sergeantCopy.nudgesPermissionDenied);
        }
      });
    }
    void sergeantNudges.set(checked);
  };

  const generatedAt = digest?.generatedAt
    ? // Видимий текст тут ЗМІНЕНО навмисно: було «13 вересня о 14:30»
      // (`month:"long"` із часом дає в uk-UA прийменник, не кому), стало
      // «13 вер., 14:30». Це єдиний носій прийменникової форми на весь
      // застосунок, і власного імені вона не отримала — інакше форм дати з
      // часом було б три замість двох. Рішення на одне слово: якщо
      // милозвучність тут важливіша, форма повертається окремою функцією, а
      // не сирим `Intl` у call-site.
      formatDateTimeShort(new Date(digest.generatedAt))
    : null;

  // UX-feedback 2026-05-08: видалили кнопку «Згенерувати звіт зараз» —
  // вона дублювала аналогічну дію на дашборді (`WeeklyDigestCard` /
  // `WeeklyDigestFooter`), тож «Згенерувати/Оновити» було двічі. У
  // налаштуваннях лишився тільки тумблер автогенерації (з 2026-11-18 не
  // лише в понеділок, а при першому відкритті головної після тижня, С-3 (а)).
  // 2026-09-03: ручного «Згенерувати» більше немає ніде — звіт створює
  // лише автогенерація, тож тумблер нижче — єдиний спосіб його отримати.
  return (
    // V-7 (2026-08-08): title читається з каталогу — раніше цей рядок і
    // ⌘K-індекс (settingsSectionsCatalog.ts) розходились ("AI Звіт тижня"
    // тут vs "AI-дайджести" у пошуку) без жодної перевірки.
    <SettingsGroup
      title={settingsSectionTitle("ai")}
      value={mondayAuto ? "Звіт щотижня" : "Звіт вимкнено"}
    >
      <SettingsSubGroup variant="bounded" title="Звіт тижня">
        <p className="text-style-body text-subtle leading-snug">
          Підсумок тижня від Сержанта: фінанси, тренування, харчування й звички.
          Шукай його на головній, у блоці «Звіт тижня».
        </p>
        <div>
          <p className="text-style-label text-text">Поточний тиждень</p>
          <p className="text-style-caption text-muted mt-0.5">{weekRange}</p>
          {generatedAt && (
            <p className="text-style-caption text-subtle mt-1">
              Згенеровано: {generatedAt}
            </p>
          )}
        </div>
        <ToggleRow
          label="Автогенерація звіту"
          description="Звіт збирається при першому відкритті головної після кінця тижня. Ліміт дій Сержанта не витрачає."
          checked={mondayAuto}
          onChange={handleToggleMondayAuto}
        />
      </SettingsSubGroup>

      <SettingsSubGroup variant="bounded" title="Повідомлення">
        <ToggleRow
          label={sergeantCopy.nudgesToggleLabel}
          description={
            pushSubscribed
              ? sergeantCopy.nudgesToggleDescription
              : `${sergeantCopy.nudgesToggleDescription} ${sergeantCopy.nudgesNeedsPushHint}`
          }
          checked={sergeantNudges.value}
          onChange={handleToggleNudges}
        />
        {showInstallHint && <IosInstallPushHint className="mt-2" />}
        {/* Огляд 2026-09-04: до першого завантаження «помилка» — це гість
            («увійди, щоб…»), не збій. Червоним лишається лише збій
            збереження після успішного завантаження. */}
        {sergeantNudges.error && (
          <p
            className={
              sergeantNudges.loaded
                ? "text-style-caption text-danger-strong"
                : "text-style-caption text-muted"
            }
            role={sergeantNudges.loaded ? "alert" : "status"}
          >
            {sergeantNudges.error}
          </p>
        )}
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
