// @vitest-environment jsdom
/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * PhotoStep — гейти автоаналізу (рішення founder-а 2026-08-13):
 * аналіз стартує сам після вибору/заміни фото, але ТІЛЬКИ коли
 * privacy-нотіс підтверджено і користувач Pro; один запуск на кадр.
 *
 * AI-CONTEXT (A1, 2026-09-11 хвиля 2): `PhotoStep` тепер безумовно
 * викликає `useOpenSignIn()` (Rules of Hooks — потрібен лише в гілці
 * `!authenticated`, але виклик хука не може бути умовним), тому кожен
 * рендер файлу обгортається в `<MemoryRouter>`, навіть тести, яким сам
 * вхід байдужий.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { messages } from "@shared/i18n/uk";

import { PhotoStep } from "./PhotoStep";
import { usePhotoAnalysis } from "../../hooks/usePhotoAnalysis";

// ─── Storage chain (уникаємо db-schema imports + контролюємо ack) ──────────
const { storageState } = vi.hoisted(() => ({
  storageState: { privacyAcked: false },
}));
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: vi.fn((key: string, fallback: unknown) =>
    key === "sergeant.nutrition.photoPrivacyAck.v1"
      ? storageState.privacyAcked
      : fallback,
  ),
  safeWriteLS: vi.fn(() => true),
  safeReadStringLS: vi.fn(() => null),
  safeReadLSValidated: vi.fn(() => null),
  safeRemoveLS: vi.fn(() => true),
  safeListLSKeys: vi.fn(() => []),
  webKVStore: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
}));

// ─── Billing gate — керований isPro ────────────────────────────────────────
const { gateState, requireAccessMock } = vi.hoisted(() => ({
  gateState: { canAccess: true },
  requireAccessMock: vi.fn(() => true),
}));
vi.mock("../../../../core/billing", () => ({
  useFeatureGate: () => ({
    canAccess: gateState.canAccess,
    requireAccess: requireAccessMock,
    paywallOpen: false,
    paywallSurface: "unlimited_ai_photo" as const,
    featureId: "ai-photo-analysis" as const,
    closePaywall: vi.fn(),
  }),
  PaywallModal: () => null,
}));

vi.mock("@shared/i18n/useLocale", () => ({
  useLocale: () => ({ locale: "uk" as const, messages, setLocale: vi.fn() }),
}));

// `auth === null` (за замовчуванням) — той самий стан, який компонент
// трактує як "поза провайдером = вважай авторизованим" (див. коментар у
// `PhotoStep`). Один тест нижче підміняє це на справжню анонімну сесію
// (`{ user: null }`), щоб перевірити гілку `!authenticated`.
const { useAuthOptionalMock } = vi.hoisted(() => ({
  useAuthOptionalMock: vi.fn((): { user: unknown } | null => null),
}));
vi.mock("../../../../core/auth/AuthContext", () => ({
  useAuthOptional: useAuthOptionalMock,
}));

// ─── usePhotoAnalysis — контрольований контролер ───────────────────────────
const { photoState } = vi.hoisted(() => ({
  photoState: {
    photoPreviewUrl: "",
    analyzePhoto: vi.fn(),
    // Заповнюється моком: канал, яким контролер повідомляє про помилку
    // аналізу. Тримаємо його, щоб тест міг увійти в гілку retry.
    setErr: null as null | ((message: string) => void),
  },
}));
vi.mock("../../hooks/usePhotoAnalysis", () => ({
  usePhotoAnalysis: vi.fn((opts: { setErr: (message: string) => void }) => {
    photoState.setErr = opts.setErr;
    return {
      fileRef: { current: null },
      photoPreviewUrl: photoState.photoPreviewUrl,
      photoResult: null,
      lastPhotoPayload: null,
      answers: {},
      setAnswers: vi.fn(),
      portionGrams: "",
      setPortionGrams: vi.fn(),
      onPickPhoto: vi.fn(),
      analyzePhoto: photoState.analyzePhoto,
      refinePhoto: vi.fn(),
      isAnalyzing: false,
      isRefining: false,
    };
  }),
}));

beforeEach(() => {
  storageState.privacyAcked = false;
  gateState.canAccess = true;
  photoState.photoPreviewUrl = "";
  photoState.analyzePhoto = vi.fn();
  photoState.setErr = null;
});

afterEach(() => {
  cleanup();
  useAuthOptionalMock.mockReturnValue(null);
});

describe("PhotoStep — auto-analyze gating", () => {
  it("auto-runs analysis once when a photo appears for an acked Pro user", () => {
    storageState.privacyAcked = true;
    photoState.photoPreviewUrl = "blob:photo-1";
    const { rerender } = render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(1);
    // Ре-рендер без нового кадру не дублює запуск (і не палить квоту).
    rerender(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(1);
  });

  it("re-runs analysis when the photo is replaced (new preview URL)", () => {
    storageState.privacyAcked = true;
    photoState.photoPreviewUrl = "blob:photo-1";
    const { rerender } = render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(1);
    // «Замінити фото» → новий blob-URL → автоперезапуск (founder 2026-08-13).
    photoState.photoPreviewUrl = "blob:photo-2";
    rerender(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(2);
  });

  it("does NOT auto-run before the privacy notice is acknowledged", () => {
    // Нотіс просить перевірити кадр ДО відправлення — автозапуск до
    // «Зрозуміло» зробив би цю перевірку фікцією.
    photoState.photoPreviewUrl = "blob:photo-1";
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(photoState.analyzePhoto).not.toHaveBeenCalled();
  });

  it("acking the notice with a photo already picked starts the analysis", () => {
    photoState.photoPreviewUrl = "blob:photo-1";
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(photoState.analyzePhoto).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Зрозуміло, аналізувати" }),
    );
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(1);
  });

  /**
   * Глухий кут: Pro без ack обирає файл — автоаналіз мовчить (privacy-гейт),
   * кнопки «Аналізувати» нема (навмисно, щоб не обходити гейт), і ніщо не
   * каже, що розблоковує саме нотіс. Гейт лишається, підказка зʼявляється.
   */
  it("Pro без ack: нотіс сам називає себе наступним кроком", () => {
    photoState.photoPreviewUrl = "blob:photo-1";
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );

    expect(photoState.analyzePhoto).not.toHaveBeenCalled();
    // Обхідної кнопки як не було, так і немає — гейт не послаблено.
    expect(screen.queryByRole("button", { name: "Аналізувати" })).toBeNull();
    expect(
      screen.getByText(/Аналіз почнеться, щойно підтвердиш це/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Зрозуміло, аналізувати" }),
    ).toBeInTheDocument();
  });

  it("без кадру нотіс лишається звичайним — нічого не блокується", () => {
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Зрозуміло" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Аналіз почнеться/)).toBeNull();
  });

  it("Free без ack: підказка не потрібна — у них є явна кнопка", () => {
    gateState.canAccess = false;
    photoState.photoPreviewUrl = "blob:photo-1";
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Аналізувати" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Аналіз почнеться/)).toBeNull();
  });

  it("копія нотіса не називає вендора — маршрут залежить від деплою", () => {
    photoState.photoPreviewUrl = "blob:photo-1";
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    // `VISION_VIA_OPENROUTER` за замовчуванням true, тож кадр іде через
    // OpenRouter, а не напряму до Anthropic — назва вендора в копії була
    // просто неправдою для дефолтного деплою.
    expect(screen.queryByText(/Anthropic/)).toBeNull();
    expect(screen.getByText(/до зовнішнього\s+AI-сервісу/)).toBeInTheDocument();
  });

  it("does NOT auto-run for a Free user — the paywall stays on the explicit tap", () => {
    storageState.privacyAcked = true;
    gateState.canAccess = false;
    photoState.photoPreviewUrl = "blob:photo-1";
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(photoState.analyzePhoto).not.toHaveBeenCalled();
    // Явний тап «Аналізувати» іде через requireAccess → paywall.
    requireAccessMock.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Аналізувати" }));
    expect(requireAccessMock).toHaveBeenCalled();
    expect(photoState.analyzePhoto).not.toHaveBeenCalled();
  });

  it("does NOT auto-run without a photo", () => {
    storageState.privacyAcked = true;
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(photoState.analyzePhoto).not.toHaveBeenCalled();
  });
});

describe("PhotoStep — коли кнопка «Аналізувати» взагалі потрібна", () => {
  // Кнопка — запасний вихід, а не основний шлях: автоаналіз уже
  // запускає розбір сам. Показана на щасливому шляху, вона пропонує
  // дію, яку система щойно зробила.
  it("ховає кнопку, поки фото ще не обрано", () => {
    storageState.privacyAcked = true;
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Аналізувати" })).toBeNull();
  });

  it("ховає кнопку на щасливому шляху Pro — аналіз іде сам", () => {
    storageState.privacyAcked = true;
    photoState.photoPreviewUrl = "blob:photo-1";
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Аналізувати" })).toBeNull();
  });

  it("після помилки показує кнопку саме як повтор", () => {
    storageState.privacyAcked = true;
    photoState.photoPreviewUrl = "blob:photo-1";
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("button", { name: "Спробувати ще раз" }),
    ).toBeNull();

    act(() => photoState.setErr?.("Не вдалось розпізнати"));

    const retry = screen.getByRole("button", { name: "Спробувати ще раз" });
    fireEvent.click(retry);
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(2);
  });

  it("лишає кнопку для Free — для них автозапуск навмисно вимкнено", () => {
    storageState.privacyAcked = true;
    gateState.canAccess = false;
    photoState.photoPreviewUrl = "blob:photo-1";
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Аналізувати" }),
    ).toBeInTheDocument();
  });

  it("ховає кнопку в Pro до privacy-ack, щоб вона не обійшла гейт згоди", () => {
    // Гейт тримають ДВОЄ: тут кнопки просто нема, а `gatedAnalyzePhoto`
    // усе одно відсік би клік — див. наступний тест.
    photoState.photoPreviewUrl = "blob:photo-1";
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Аналізувати" })).toBeNull();
    // Підпис нотіса в цьому стані — «Зрозуміло, аналізувати»: гейт той
    // самий, просто перестав бути невидимим (див. тест про глухий кут).
    fireEvent.click(
      screen.getByRole("button", { name: "Зрозуміло, аналізувати" }),
    );
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(1);
  });

  it("не пускає retry після помилки повз privacy-ack", () => {
    // Регресія (ревʼю CodeRabbit). Помилку вміє покласти не лише аналіз,
    // а й піккер — і тоді превʼю лишається, а нотіс досі не підтверджено.
    // Доти гілка `photoErr` стояла ПЕРШОЮ в `analyzeLabel`, тож кнопка
    // «Спробувати ще раз» зʼявлялась і в цьому стані та йшла в
    // `gatedAnalyzePhoto`, який перевіряв самий лише тариф — тобто
    // відправляла кадр Pro-користувача, який згоди ще не дав.
    photoState.photoPreviewUrl = "blob:photo-1";
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );
    act(() => photoState.setErr?.("Не вдалось прочитати файл"));

    expect(
      screen.queryByRole("button", { name: "Спробувати ще раз" }),
    ).toBeNull();
    expect(photoState.analyzePhoto).not.toHaveBeenCalled();

    // Вихід зі стану лишається один — той самий нотіс.
    fireEvent.click(
      screen.getByRole("button", { name: "Зрозуміло, аналізувати" }),
    );
    expect(photoState.analyzePhoto).toHaveBeenCalledTimes(1);
  });

  it("`gatedAnalyzePhoto` тримає ack навіть коли тариф пропустив", () => {
    // Другий шар того самого гейта, окремо від сховування кнопки: тут
    // вона видима (Free), а `requireAccess()` віддає доступ — і кадр усе
    // одно не їде, бо згоди нема. Ховати кнопку й перевіряти в обробнику
    // треба разом: приберуть одне — лишиться друге.
    // `requireAccessMock` за замовчуванням віддає true — саме той стан,
    // що нас цікавить (тариф пропустив, ack не питали).
    gateState.canAccess = false;
    photoState.photoPreviewUrl = "blob:photo-1";
    render(
      <MemoryRouter>
        <PhotoStep onApply={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Аналізувати" }));
    expect(photoState.analyzePhoto).not.toHaveBeenCalled();
  });
});

// Санітарна перевірка, що мок контролера справді підмінив хук.
it("uses the mocked usePhotoAnalysis controller", () => {
  render(
    <MemoryRouter>
      <PhotoStep onApply={vi.fn()} />
    </MemoryRouter>,
  );
  expect(vi.mocked(usePhotoAnalysis)).toHaveBeenCalled();
});

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="probe-location">{location.pathname}</span>;
}

// Регресія A1 (аудит 2026-09-11, хвиля 2): вхід для незалогінованого
// відвідувача раніше вів на `<a href="/auth">` — аліас-редірект замість
// прямого SPA-переходу на `/sign-in`, і повне перезавантаження сторінки
// замість client-side навігації.
describe("PhotoStep — вхід для незалогінованого відвідувача (A1)", () => {
  it("кнопка веде на /sign-in прямим SPA-переходом, без /auth-хопу й без reload", () => {
    useAuthOptionalMock.mockReturnValue({ user: null });
    render(
      <MemoryRouter initialEntries={["/nutrition/menu"]}>
        <PhotoStep onApply={vi.fn()} />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("probe-location")).toHaveTextContent(
      "/nutrition/menu",
    );

    fireEvent.click(
      screen.getByRole("button", { name: messages.nutrition.photoAuth.signIn }),
    );

    // Немає жодного маршруту `/auth` у цьому дереві — якби код і далі
    // ходив через аліас, локація лишилась би на ньому (тут не змонтовано
    // `StandaloneRoutes`, який у проді робить редірект `/auth` →
    // `/sign-in`).
    expect(screen.getByTestId("probe-location")).toHaveTextContent("/sign-in");
  });
});
