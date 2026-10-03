/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useHubPref, HUB_PREF_MONDAY_AUTO } from "./hubPrefs";
import { settingsSectionTitle } from "../hub/settingsSectionsCatalog";
import { useWeeklyDigest } from "../insights/useWeeklyDigest";
import { SettingsGroup, ToggleRow } from "./SettingsPrimitives";
import { formatDateTimeShort } from "@shared/lib/time/formatDate";

export function AIDigestSection() {
  const { digest, weekRange } = useWeeklyDigest();
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

  const handleToggleMondayAuto = (next: boolean) => {
    setMondayAuto(next);
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
  // налаштуваннях лишився тільки тумблер автогенерації по понеділках.
  // 2026-09-03: ручного «Згенерувати» більше немає ніде — звіт створює
  // лише автогенерація, тож тумблер нижче — єдиний спосіб його отримати.
  return (
    // V-7 (2026-08-08): title читається з каталогу — раніше цей рядок і
    // ⌘K-індекс (settingsSectionsCatalog.ts) розходились ("AI Звіт тижня"
    // тут vs "AI-дайджести" у пошуку) без жодної перевірки.
    <SettingsGroup title={settingsSectionTitle("ai")} icon="clipboard">
      <div className="space-y-3">
        <p className="text-style-body text-subtle leading-snug">
          Тижневий аналіз прогресу від Сержанта по всіх модулях: фінанси,
          тренування, харчування та звички. Звіт збирається сам щопонеділка і
          чекає на головній у блоці «Звіт тижня»; там же його можна оновити.
        </p>
        <div className="p-3 rounded-xl bg-bg border border-line">
          <p className="text-style-label text-text">Поточний тиждень</p>
          <p className="text-style-caption text-muted mt-0.5">{weekRange}</p>
          {generatedAt && (
            <p className="text-style-caption text-subtle mt-1">
              Згенеровано: {generatedAt}
            </p>
          )}
        </div>
        <ToggleRow
          label="Автогенерація щопонеділка"
          description="Перша сесія понеділка сама збирає звіт за завершений тиждень. Звіт не витрачає денний ліміт AI-запитів."
          checked={mondayAuto}
          onChange={handleToggleMondayAuto}
        />
      </div>
    </SettingsGroup>
  );
}
