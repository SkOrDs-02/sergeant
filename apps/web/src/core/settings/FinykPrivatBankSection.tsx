/**
 * Востаннє перевірено: 2026-07-31
 * Статус: Активний
 */
import { useEffect, useState } from "react";
import { isApiError, privatApi } from "@shared/api";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
// V-8 (аудит 2026-08-08): переїзд із локального `ConfirmModal` на канонічний
// портальний `ConfirmDialog` — причина в `FinykWebhookServiceSection.tsx`.
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { SettingsSubGroup } from "./SettingsPrimitives";

interface FinykPrivatBankSectionProps {
  enabled: boolean;
}

const COPY = {
  title: "ПриватБанк (Приват24 для підприємців)",
  disconnectTitle: "Відʼєднати ПриватБанк?",
  disconnectBody:
    "Збережені облікові дані ПриватБанку буде видалено з твого акаунта.",
  disconnectLabel: "Відʼєднати",
  connected: "ПриватБанк підключено",
  disconnect: "Відʼєднати ПриватБанк",
  help: "API Приват24 для підприємців. Merchant ID та токен знаходяться у Приват24 Бізнес → Налаштування → API.",
  storageNote:
    "Токен зберігається зашифрованим на сервері й привʼязаний до твого акаунта, у браузері він не лишається.",
  merchantId: "Merchant ID",
  merchantIdPlaceholder: "Твій Merchant ID",
  tokenLabel: "Токен / пароль",
  tokenPlaceholder: "Токен продавця",
  hide: "Приховати",
  show: "Показати",
  connect: "Підключити ПриватБанк",
} as const;

/**
 * Креденшели ПриватБанку більше не осідають у браузері: форма віддає їх
 * один раз у `POST /api/privat/connect`, далі вони живуть зашифровані на
 * сервері. До цієї зміни merchant-токен лежав у `localStorage` і був видимий
 * будь-кому, хто відкриє DevTools — спека
 * `docs/90-work/planning/specs/beta-security-readiness.md` (F1).
 *
 * Чекбокса «Запамʼятати на цьому пристрої» більше немає: підключення тепер
 * властивість акаунта, а не пристрою, тож вибір нічого не означав би.
 */
export function FinykPrivatBankSection({
  enabled,
}: FinykPrivatBankSectionProps) {
  const [privatIdInput, setPrivatIdInput] = useState("");
  const [privatTokenInput, setPrivatTokenInput] = useState("");
  const [showPrivatToken, setShowPrivatToken] = useState(false);
  const [privatError, setPrivatError] = useState("");
  const [privatConnecting, setPrivatConnecting] = useState(false);
  const [privatConnected, setPrivatConnected] = useState(false);
  const [connectedMerchantId, setConnectedMerchantId] = useState("");
  const [confirmDisconnectPrivat, setConfirmDisconnectPrivat] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const status = await privatApi.status();
        if (cancelled) return;
        setPrivatConnected(status.connected);
        setConnectedMerchantId(status.merchantId ?? "");
      } catch {
        // Офлайн або 401 — показуємо форму підключення, а не помилку:
        // користувач усе одно нічого не може з цим зробити.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const connectPrivat = async () => {
    const cleanId = privatIdInput.trim();
    const cleanToken = privatTokenInput.trim();
    if (!cleanId || !cleanToken) {
      setPrivatError("Введи Merchant ID та токен");
      return;
    }
    setPrivatConnecting(true);
    setPrivatError("");
    try {
      // Сервер сам перевіряє креденшели проти ПриватБанку перед збереженням,
      // тож окремий пробний запит із фронта більше не потрібен.
      await privatApi.connect({ merchantId: cleanId, token: cleanToken });
      setPrivatConnected(true);
      setConnectedMerchantId(cleanId);
      setPrivatTokenInput("");
      window.location.reload();
    } catch (error) {
      if (isApiError(error) && error.kind === "http") {
        setPrivatError(error.serverMessage || `Помилка ${error.status}`);
        return;
      }
      setPrivatError(
        error instanceof Error && error.message
          ? error.message
          : "Помилка підключення",
      );
    } finally {
      setPrivatConnecting(false);
    }
  };

  const disconnectPrivat = async () => {
    try {
      await privatApi.disconnect();
    } catch {
      // Навіть якщо запит не пройшов, лишати UI у стані «підключено» гірше:
      // користувач щойно попросив відключити банк.
    }
    setPrivatConnected(false);
    setConnectedMerchantId("");
    setPrivatIdInput("");
    setPrivatTokenInput("");
    setConfirmDisconnectPrivat(false);
    window.location.reload();
  };

  if (!enabled) return null;

  return (
    <SettingsSubGroup title={COPY.title}>
      {confirmDisconnectPrivat && (
        <ConfirmDialog
          open
          title={COPY.disconnectTitle}
          description={COPY.disconnectBody}
          confirmLabel={COPY.disconnectLabel}
          danger
          onCancel={() => setConfirmDisconnectPrivat(false)}
          onConfirm={disconnectPrivat}
        />
      )}
      {privatConnected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-bg border border-success/30 rounded-xl">
            <div className="w-9 h-9 rounded-xl bg-success/10 border border-success/20 flex items-center justify-center shrink-0">
              {/* icon-size, not type */}
              <Icon name="credit-card" size={18} aria-hidden />
            </div>
            <div>
              <div className="text-style-label text-text">{COPY.connected}</div>
              <div className="text-style-code text-subtle mt-0.5 truncate">
                ID: {connectedMerchantId.slice(0, 6)}••••
              </div>
            </div>
          </div>
          <Button
            variant="danger"
            className="w-full h-11"
            onClick={() => setConfirmDisconnectPrivat(true)}
          >
            {COPY.disconnect}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-style-caption text-subtle leading-snug">
            {COPY.help}
          </p>
          <div>
            <label
              htmlFor="hub-privat-merchant-id"
              className="text-style-label text-muted mb-1 block"
            >
              {COPY.merchantId}
            </label>
            <input
              id="hub-privat-merchant-id"
              type="text"
              value={privatIdInput}
              onChange={(event) => setPrivatIdInput(event.target.value)}
              placeholder={COPY.merchantIdPlaceholder}
              autoComplete="off"
              className="input-focus-finyk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-style-body text-text"
            />
          </div>
          <div>
            <label
              htmlFor="hub-privat-token"
              className="text-style-label text-muted mb-1 block"
            >
              {COPY.tokenLabel}
            </label>
            <div className="relative">
              <input
                id="hub-privat-token"
                type={showPrivatToken ? "text" : "password"}
                value={privatTokenInput}
                onChange={(event) => setPrivatTokenInput(event.target.value)}
                placeholder={COPY.tokenPlaceholder}
                autoComplete="off"
                className="input-focus-finyk w-full h-11 rounded-xl border border-line bg-panelHi px-3 pr-10 text-style-body text-text"
                onKeyDown={(event) => event.key === "Enter" && connectPrivat()}
              />
              <button
                type="button"
                onClick={() => setShowPrivatToken((visible) => !visible)}
                className="focus-ring touch-target absolute right-0 top-1/2 -translate-y-1/2 rounded-xl text-subtle hover:text-text"
                aria-label={showPrivatToken ? COPY.hide : COPY.show}
              >
                <Icon
                  name={showPrivatToken ? "eye-off" : "eye"}
                  size={16}
                  aria-hidden
                />
              </button>
            </div>
          </div>
          <p className="text-style-caption text-subtle leading-snug">
            {COPY.storageNote}
          </p>
          {privatError && (
            <p className="text-style-body text-danger bg-danger/10 rounded-xl px-3 py-2">
              {privatError}
            </p>
          )}
          <Button
            className="w-full h-11"
            onClick={connectPrivat}
            disabled={privatConnecting}
          >
            {privatConnecting
              ? messages.loadingActions.connecting
              : COPY.connect}
          </Button>
        </div>
      )}
    </SettingsSubGroup>
  );
}
