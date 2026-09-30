import { useCallback, useEffect, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { meApi, type UserPreferences } from "@shared/api";
import { messages } from "@shared/i18n/uk";
import { PUSH_DAILY_CAP_DEFAULT } from "@sergeant/shared";
import { useOptionalHubShell } from "../app/HubShellContext";
import { LegalLinks } from "../legal/LegalLinks";
import { settingsSectionTitle } from "../hub/settingsSectionsCatalog";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";
import {
  hydrateAnalyticsConsent,
  setAnalyticsConsent,
} from "../observability/analyticsConsent";
import {
  classifyPreferenceLoadFailure,
  PREFERENCE_LOAD_FAILURE_COPY,
  type PreferenceLoadFailure,
} from "./preferenceLoadFailure";

// Експортовано для `PrivacySection.test.tsx` (L-3): loading-гейт нижче
// означає, що це значення НІКОЛИ не може просочитись у DOM чи
// `analyticsConsent` до завершення гідрації, тож перевіряти його треба
// напряму, а не виводити з відрендереного виводу (2026-08-08 adversarial
// review, finding #4).
const disclosure = messages.dataDisclosure;

export const DEFAULT_PREFERENCES: UserPreferences = {
  // L-3: продукт — opt-in analytics, не opt-out. Дефолт тут мусить
  // збігатися з серверним DEFAULT FALSE (apps/server/src/modules/me/
  // dataRights.ts, міграція 111) і з in-memory-кешем `analyticsConsent.ts`
  // ("DENY UNTIL HYDRATED"). До відповіді сервера екран нижче все одно не
  // стверджує ні "увімкнено", ні "вимкнено" — див. `preferencesLoaded`-гейт
  // у розмітці нижче.
  analytics: false,
  aiMemory: true,
  pushNotifications: false,
  sergeantNudges: false,
  pushDailyCap: PUSH_DAILY_CAP_DEFAULT,
  healthDataConsent: false,
  // Приватність цим екраном не керує — вибір модулів живе в «Головна»
  // (`DashboardSection`) і синхронізується окремо (`activeModulesSync`).
  activeModules: null,
  hubPrefs: null,
  updatedAt: null,
};

type PreferenceKey =
  "analytics" | "aiMemory" | "pushNotifications" | "healthDataConsent";

/**
 * «Дані та приватність» — згоди на обробку даних і правові документи.
 *
 * Огляд 2026-09-04: PIN-блокування переїхало в Профіль → «Безпека»
 * (`security/AppLockSettings.tsx`), список серверної памʼяті з очищенням —
 * у Профіль → «Памʼять» (`profile/AiMemorySection.tsx`). Тут лишилось
 * рівно те, що є ЗГОДОЮ: аналітика, памʼять для Сержанта, здоровʼя.
 */
export function PrivacySection() {
  const shell = useOptionalHubShell();
  const [preferences, setPreferences] =
    useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  // ЧОМУ не вдалося завантажити, а не лише «не вдалося»: гість і збій мережі
  // розходяться і в тексті, і в подачі (див. гілку рендеру нижче). `null`
  // поки нічого не падало або коли впало ЗБЕРЕЖЕННЯ (там гілка своя).
  const [loadFailure, setLoadFailure] = useState<PreferenceLoadFailure | null>(
    null,
  );
  const [savingPreference, setSavingPreference] =
    useState<PreferenceKey | null>(null);

  // L-3: винесено окремо, щоб стан помилки (див. рендер нижче) міг
  // пропонувати справжній retry, а не глухий кут (finding #9).
  const loadPreferences = useCallback(() => {
    let cancelled = false;
    meApi
      .getPreferences()
      .then((next) => {
        if (cancelled) return;
        setPreferences(next);
        setPreferencesLoaded(true);
        setPreferencesError(null);
        setLoadFailure(null);
        hydrateAnalyticsConsent(next.analytics);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // PR-S2: доти будь-який збій GET (офлайн, 5xx, таймаут) ставав
        // «Увійди в акаунт» — неправдиве твердження про стан акаунта, яке
        // жене залогінену людину перелогінюватись. Причину тепер
        // розрізняємо; обґрунтування сигналу — `preferenceLoadFailure.ts`.
        const failure = classifyPreferenceLoadFailure(err);
        setPreferencesLoaded(false);
        setLoadFailure(failure);
        setPreferencesError(
          failure === "auth"
            ? "Увійди в акаунт, щоб керувати налаштуваннями згоди на сервері."
            : PREFERENCE_LOAD_FAILURE_COPY[failure],
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => loadPreferences(), [loadPreferences]);

  const updatePreference = async (key: PreferenceKey, checked: boolean) => {
    setPreferencesError(null);
    setLoadFailure(null);
    setSavingPreference(key);
    const previous = preferences;
    setPreferences({ ...previous, [key]: checked });
    if (key === "analytics") {
      // Оптимістично, ще ДО мережевого round trip (CodeRabbit PR #627):
      // dismiss між кліком і відповіддю сервера має вже враховувати новий
      // вибір. Відкочується в `catch` нижче при збої.
      setAnalyticsConsent(checked);
    }
    try {
      const next = await meApi.updatePreferences({ [key]: checked });
      setPreferences(next);
      setPreferencesLoaded(true);
      setAnalyticsConsent(next.analytics);
    } catch {
      setPreferences(previous);
      if (key === "analytics") {
        setAnalyticsConsent(previous.analytics);
      }
      setPreferencesError("Не вдалося зберегти налаштування. Спробуй ще раз.");
    } finally {
      setSavingPreference(null);
    }
  };

  return (
    <SettingsGroup
      title={settingsSectionTitle("privacy")}
      icon="shield"
      anchorId="settings-privacy"
    >
      <SettingsSubGroup title="Згода та дані">
        <p className="text-style-body text-subtle leading-relaxed">
          Обери, що Sergeant може використовувати для якості продукту та
          персоналізації. Дані для входу, безпеки й оплати залишаються
          потрібними для роботи застосунку. Сповіщення налаштовуються в окремому
          розділі.
        </p>
        {preferencesLoaded ? (
          <>
            <ToggleRow
              label="Аналітика продукту"
              description={
                savingPreference === "analytics"
                  ? "Зберігаю…"
                  : "Допомагає бачити, де інтерфейс незручний або ламається."
              }
              checked={preferences.analytics}
              onChange={(checked) =>
                void updatePreference("analytics", checked)
              }
            />
            <ToggleRow
              label="Памʼять для Сержанта"
              description={
                savingPreference === "aiMemory"
                  ? "Зберігаю…"
                  : "Дозволяє Сержанту памʼятати корисні факти між сесіями, щоб відповіді були точнішими. Вимкнення не видаляє вже збережене."
              }
              checked={preferences.aiMemory}
              onChange={(checked) => void updatePreference("aiMemory", checked)}
            />
            {/* PR-S3 (рішення founder-а 2026-09-14). Копія доти обіцяла
                «без неї ця інформація не використовується» — і це було
                неправдою для КОЖНОГО, хто жодного разу не відкривав цей
                екран: тумблер дефолтиться у `false`, а коуч, дайджест і чат
                читали тренування й харчування однаково для всіх.

                Рішення: гейтити не використання, а ПЕРСИСТЕНТНИЙ ЗАПИС у
                памʼять (`ai-memory/ingestQueue.ts`, прапорець `healthData`).
                Гейт на використання вимкнув би AI-шар за замовчуванням;
                осідання назавжди — інша річ, бо вимкнути тумблер постфактум
                і цим прибрати вже записане неможливо.

                Копія тепер каже рівно те, що робить код. Не «ця інформація
                не використовується», а «не осідає в памʼяті» — і прямо
                проговорює, що відповідь у чаті працює без згоди. Обіцянка,
                ширша за механізм, гірша за відсутність обіцянки. */}
            <ToggleRow
              label="Памʼять про здоровʼя"
              description={
                savingPreference === "healthDataConsent"
                  ? "Зберігаю…"
                  : "Дозволяє Сержанту запамʼятовувати тренування, самопочуття й харчування надовго: тижневі звіти й факти з категорії «Здоровʼя». Без неї Сержант відповідає на питання як завжди, але нічого з цього не зберігає. Вимкнення не видаляє вже збережене."
              }
              checked={preferences.healthDataConsent}
              onChange={(checked) =>
                void updatePreference("healthDataConsent", checked)
              }
            />
            {preferencesError ? (
              // Finding #7: рендериться одразу біля групи тумблерів, що не
              // зберіглась — зрячий юзер, що щойно бачив, як тумблер
              // мовчки відкотився, потребує пояснення поруч із контролом.
              <p className="text-style-caption text-danger-strong" role="alert">
                {preferencesError}
              </p>
            ) : null}
          </>
        ) : preferencesError ? (
          // Огляд 2026-09-04: для ГОСТЯ це не збій, а очікуваний стан —
          // «увійди, і зможеш керувати» — тож фарбувати його danger і
          // оголошувати як alert означало показувати демо зламаним.
          // Помилка ЗБЕРЕЖЕННЯ (гілка вище) лишається червоною: там
          // людина щойно щось натиснула, і тумблер відкотився.
          // Finding #9: справжній retry, а не глухий кут.
          //
          // PR-S2 (2026-09-14): спокійна подача правильна саме для гостя, а
          // не для будь-якого збою. Офлайн чи 500 — це таки поломка, і
          // людина має почути її як поломку, інакше вона шукатиме проблему
          // в собі. Тому подача тепер іде за ПРИЧИНОЮ, а не за самим
          // фактом помилки.
          <div className="flex flex-col items-start gap-2">
            <p
              className={
                loadFailure === "auth"
                  ? "text-style-caption text-muted"
                  : "text-style-caption text-danger-strong"
              }
              role={loadFailure === "auth" ? "status" : "alert"}
            >
              {preferencesError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPreferencesError(null);
                setLoadFailure(null);
                loadPreferences();
              }}
            >
              Спробувати ще
            </Button>
          </div>
        ) : (
          // L-3: до відповіді сервера екран не має стверджувати НІ
          // "увімкнено", НІ "вимкнено" — явний loading-стан без тумблерів.
          <p
            className="text-style-caption text-subtle"
            role="status"
            aria-live="polite"
          >
            Завантажую налаштування…
          </p>
        )}
        {/* Що саме Сержант памʼятає і як це стерти — у Профілі, поруч із
            фактами, які людина розповіла сама (один вхід замість двох). */}
        {shell ? (
          <div className="flex flex-col items-start gap-1">
            <p className="text-style-body text-subtle leading-relaxed">
              Що саме Сержант памʼятає і як це стерти: у Профілі, поруч із
              твоїми фактами.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => shell.ui.setHubView("profile")}
            >
              Відкрити Профіль → Памʼять
            </Button>
          </div>
        ) : null}
        {/* Рішення founder-а 2026-09-14. Видалення акаунта ІСНУЄ —
            `profile/DangerZoneSection` із підтвердженням, — але живе воно в
            Профілі, а шукають його тут: це та сама поличка «мої дані й що з
            ними можна зробити», що й експорт зі згодами. Продуктовий огляд
            спершу записав це як «пункту немає взагалі», і помилився; чинна
            знахідка вужча — його немає ТАМ, ДЕ ЙОГО ШУКАЮТЬ.

            Тому тут вказівник, а не друга кнопка. Дублювати незворотну дію
            в два місця означало б два шляхи до неї й два місця, де може
            розʼїхатись підтвердження. Форма та сама, що у вказівника на
            памʼять вище. */}
        {shell ? (
          <div className="flex flex-col items-start gap-1">
            <p className="text-style-body text-subtle leading-relaxed">
              Видалити акаунт разом з усіма даними можна в Профілі, у розділі
              «Небезпечна зона».
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => shell.ui.setHubView("profile")}
            >
              Відкрити Профіль → Небезпечна зона
            </Button>
          </div>
        ) : null}
        <LegalLinks compact className="justify-start" />
      </SettingsSubGroup>

      {/* PR-S4 (рішення founder-а 2026-09-14): обидві декларації переїхали
          сюди з «Резервної копії». Вони стоять ПІСЛЯ згод і юрдоків
          навмисно — спершу те, чим людина керує, потім те, що їй обіцяють.
          Текст не змінено жодним словом, лише місце. */}
      <SettingsSubGroup title={disclosure.subprocessors.title}>
        <p className="text-style-body text-subtle leading-relaxed">
          {disclosure.subprocessors.body}
        </p>
        <p className="text-style-body text-subtle leading-relaxed">
          {disclosure.subprocessors.photoNote}
        </p>
      </SettingsSubGroup>

      <SettingsSubGroup title={disclosure.sunset.title}>
        <p className="text-style-body text-subtle leading-relaxed">
          {disclosure.sunset.body}
        </p>
        <p className="text-style-body text-subtle leading-relaxed">
          {disclosure.sunset.bankNote}
        </p>
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
