import { useCallback, useEffect, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { meApi, type UserPreferences } from "@shared/api";
import { useOptionalHubShell } from "../app/HubShellContext";
import { LegalLinks } from "../legal/LegalLinks";
import { settingsSectionTitle } from "../hub/settingsSectionsCatalog";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";
import { setAnalyticsConsent } from "../observability/analyticsConsent";

// Експортовано для `PrivacySection.test.tsx` (L-3): loading-гейт нижче
// означає, що це значення НІКОЛИ не може просочитись у DOM чи
// `analyticsConsent` до завершення гідрації, тож перевіряти його треба
// напряму, а не виводити з відрендереного виводу (2026-08-08 adversarial
// review, finding #4).
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
  healthDataConsent: false,
  // Приватність цим екраном не керує — вибір модулів живе в «Головна»
  // (`DashboardSection`) і синхронізується окремо (`activeModulesSync`).
  activeModules: null,
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
        setAnalyticsConsent(next.analytics);
      })
      .catch(() => {
        if (cancelled) return;
        setPreferencesLoaded(false);
        setPreferencesError(
          "Увійди в акаунт, щоб керувати налаштуваннями згоди на сервері.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => loadPreferences(), [loadPreferences]);

  const updatePreference = async (key: PreferenceKey, checked: boolean) => {
    setPreferencesError(null);
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
            <ToggleRow
              label="Дані про здоровʼя"
              description={
                savingPreference === "healthDataConsent"
                  ? "Зберігаю…"
                  : "Явна згода на обробку тренувань, самопочуття й харчування, без неї ця інформація не використовується."
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
          // Огляд 2026-09-04: для гостя це не збій, а очікуваний стан —
          // «увійди, і зможеш керувати» — тож фарбувати його danger і
          // оголошувати як alert означало показувати демо зламаним.
          // Помилка ЗБЕРЕЖЕННЯ (гілка вище) лишається червоною: там
          // людина щойно щось натиснула, і тумблер відкотився.
          // Finding #9: справжній retry, а не глухий кут.
          <div className="flex flex-col items-start gap-2">
            <p className="text-style-caption text-muted" role="status">
              {preferencesError}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreferencesError(null);
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
        <LegalLinks compact className="justify-start" />
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
