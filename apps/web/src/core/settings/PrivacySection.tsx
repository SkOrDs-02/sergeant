import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
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
  getAnalyticsConsent,
  hydrateAnalyticsConsent,
  setAnalyticsConsent,
  subscribeAnalyticsConsent,
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
  // Локальна згода на аналітику — для гостя (див. гілку `loadFailure ===
  // "auth"` нижче): сервера в нього немає, а рішення живе на пристрої.
  const localAnalyticsConsent = useSyncExternalStore(
    subscribeAnalyticsConsent,
    getAnalyticsConsent,
    getAnalyticsConsent,
  );

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
        // Гість (`auth`) — не збій: його гілка рендеру нижче без тексту
        // помилки й без «Спробувати ще».
        setPreferencesError(
          failure === "auth" ? null : PREFERENCE_LOAD_FAILURE_COPY[failure],
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
      if (key === "analytics") {
        // Явний вибір людини на цьому пристрої — фіксуємо як рішення.
        setAnalyticsConsent(next.analytics);
      } else {
        // Інший тумблер (aiMemory, healthDataConsent…) — не відповідь про
        // аналітику: лише синхронізуємо кеш із сервером, не записуючи
        // «рішення» на пристрої (інакше банер згоди мовчки зникав би).
        hydrateAnalyticsConsent(next.analytics);
      }
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
            {/* Рішення власника 2026-09-29 (вузький гейт, GDPR Art. 9): це
                ЄДИНА згода на дані про здоровʼя, і вона працює на СЕРВЕРІ —
                без неї тренування, вага, самопочуття й харчування не йдуть у
                модель (чат, коуч, тижневий звіт, фото страв) і не осідають у
                памʼяті AI. Модулі Фізрук/Харчування від неї не залежать.
                Раніше (PR-S3, 2026-09-14) тумблер гейтив лише запис у памʼять
                і чесно казав, що відповідь у чаті працює без згоди; це
                скасовано, бо згода без наслідків не має юридичної сили.
                Копія каже рівно те, що робить код, включно з тим, чого
                тумблер НЕ охоплює (вільний текст у повідомленнях). */}
            <ToggleRow
              label="Дані про здоровʼя для Сержанта"
              description={
                savingPreference === "healthDataConsent"
                  ? "Зберігаю…"
                  : "Дозволяє Сержанту бачити й запамʼятовувати тренування, вагу, самопочуття та харчування: у чаті, повідомленнях дня, тижневих звітах і при аналізі фото страв. Без згоди він цього не бачить і скаже, що потрібен дозвіл; фінанси й звички працюють як завжди. Вимкнення не видаляє вже збережене."
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
        ) : loadFailure === "auth" ? (
          // priv-18 (аудит 2026-10-01): гість теж дає згоду на аналітику
          // (крок онбордингу, банер), тож і відкликати її має змогу тут,
          // «так само легко, як дати» (GDPR ст. 7(3)); крок і банер обіцяють
          // «Передумати можна в Налаштуваннях». Серверних записів немає:
          // рішення лишається на пристрої з позначкою `pendingServerSync`, і
          // після входу `useAnalyticsConsentBoot` віддасть його акаунту.
          // «Спробувати ще» тут марне — повторний запит дасть той самий 401.
          <>
            <ToggleRow
              label="Аналітика продукту"
              description="Допомагає бачити, де інтерфейс незручний або ламається. Вибір зберігається на цьому пристрої, а після входу піде в акаунт."
              checked={localAnalyticsConsent}
              onChange={(checked) =>
                setAnalyticsConsent(checked, { pendingServerSync: true })
              }
            />
            <p
              className="text-style-body text-subtle leading-relaxed"
              role="status"
            >
              Памʼять для Сержанта і дані про здоровʼя зберігаються в акаунті.
              Керувати ними можна після входу.
            </p>
          </>
        ) : preferencesError ? (
          // Збій завантаження, що НЕ є «ти гість» (гість — гілка вище): офлайн
          // чи 500 — це таки поломка, і людина має почути її як поломку (PR-S2,
          // 2026-09-14: подача іде за ПРИЧИНОЮ). Помилка ЗБЕРЕЖЕННЯ (гілка ще
          // вище) теж червона: тумблер щойно відкотився.
          // Finding #9: справжній retry, а не глухий кут.
          <div className="flex flex-col items-start gap-2">
            <p className="text-style-caption text-danger-strong" role="alert">
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
