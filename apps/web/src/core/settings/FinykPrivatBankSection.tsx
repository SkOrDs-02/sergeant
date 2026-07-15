/**
 * Last validated: 2026-07-15
 * Status: Active
 */
import { useState } from "react";
import { isApiError, privatApi } from "@shared/api";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import {
  safeReadStringLS,
  safeRemoveLS,
  safeWriteLS,
} from "@shared/lib/storage/storage";
import { ConfirmModal, SettingsSubGroup } from "./SettingsPrimitives";

interface FinykPrivatBankSectionProps {
  enabled: boolean;
}

const COPY = {
  title: "ПриватБанк (Приват24 для підприємців)",
  disconnectTitle: "Від'єднати ПриватБанк?",
  disconnectBody:
    "Облікові дані та кеш транзакцій ПриватБанку буде видалено з цього браузера.",
  disconnectLabel: "Від'єднати",
  connected: "ПриватБанк підключено",
  disconnect: "Від'єднати ПриватБанк",
  help: "API Приват24 для підприємців. Merchant ID та токен знаходяться у Приват24 Бізнес → Налаштування → API.",
  merchantId: "Merchant ID",
  merchantIdPlaceholder: "Ваш Merchant ID",
  tokenLabel: "Токен / пароль",
  tokenPlaceholder: "Токен продавця",
  hide: "Приховати",
  show: "Показати",
  remember: "Запам'ятати на цьому пристрої",
  connect: "Підключити ПриватБанк",
} as const;

export function FinykPrivatBankSection({
  enabled,
}: FinykPrivatBankSectionProps) {
  const [privatIdInput, setPrivatIdInput] = useState<string>(
    () =>
      safeReadStringLS("finyk_privat_id", null) ??
      sessionStorage.getItem("finyk_privat_id") ??
      "",
  );
  const [privatTokenInput, setPrivatTokenInput] = useState<string>(
    () =>
      safeReadStringLS("finyk_privat_token", null) ??
      sessionStorage.getItem("finyk_privat_token") ??
      "",
  );
  const [showPrivatToken, setShowPrivatToken] = useState(false);
  const [rememberPrivat, setRememberPrivat] = useState<boolean>(
    () => !!safeReadStringLS("finyk_privat_id", null),
  );
  const [privatError, setPrivatError] = useState("");
  const [privatConnecting, setPrivatConnecting] = useState(false);
  const [privatConnected, setPrivatConnected] = useState<boolean>(
    () =>
      !!(
        safeReadStringLS("finyk_privat_id", null) ||
        sessionStorage.getItem("finyk_privat_id")
      ),
  );
  const [confirmDisconnectPrivat, setConfirmDisconnectPrivat] = useState(false);

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
      try {
        await privatApi.balanceFinal({
          merchantId: cleanId,
          merchantToken: cleanToken,
        });
      } catch (error) {
        if (isApiError(error) && error.kind === "http") {
          setPrivatError(error.serverMessage || `Помилка ${error.status}`);
          return;
        }
        throw error;
      }
      if (rememberPrivat) {
        safeWriteLS("finyk_privat_id", cleanId);
        safeWriteLS("finyk_privat_token", cleanToken);
        sessionStorage.removeItem("finyk_privat_id");
        sessionStorage.removeItem("finyk_privat_token");
      } else {
        sessionStorage.setItem("finyk_privat_id", cleanId);
        sessionStorage.setItem("finyk_privat_token", cleanToken);
        safeRemoveLS("finyk_privat_id");
        safeRemoveLS("finyk_privat_token");
      }
      setPrivatConnected(true);
      window.location.reload();
    } catch (error) {
      setPrivatError(
        error instanceof Error && error.message
          ? error.message
          : "Помилка підключення",
      );
    } finally {
      setPrivatConnecting(false);
    }
  };

  const disconnectPrivat = () => {
    safeRemoveLS("finyk_privat_id");
    safeRemoveLS("finyk_privat_token");
    sessionStorage.removeItem("finyk_privat_id");
    sessionStorage.removeItem("finyk_privat_token");
    safeRemoveLS("finyk_privat_tx_cache");
    safeRemoveLS("finyk_privat_balance_cache");
    setPrivatConnected(false);
    setPrivatIdInput("");
    setPrivatTokenInput("");
    setConfirmDisconnectPrivat(false);
    window.location.reload();
  };

  if (!enabled) return null;

  return (
    <SettingsSubGroup title={COPY.title}>
      {confirmDisconnectPrivat && (
        <ConfirmModal
          open
          title={COPY.disconnectTitle}
          body={COPY.disconnectBody}
          confirmLabel={COPY.disconnectLabel}
          danger
          onCancel={() => setConfirmDisconnectPrivat(false)}
          onConfirm={disconnectPrivat}
        />
      )}
      {privatConnected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-bg border border-green-500/30 rounded-xl">
            <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-base shrink-0">
              <Icon name="credit-card" size={18} aria-hidden />
            </div>
            <div>
              <div className="text-style-label text-text">{COPY.connected}</div>
              <div className="text-xs text-subtle mt-0.5 font-mono truncate">
                ID: {(privatIdInput || "").slice(0, 6)}••••
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
          <p className="text-xs text-subtle leading-snug">{COPY.help}</p>
          <div>
            <label
              htmlFor="hub-privat-merchant-id"
              className="text-xs text-muted mb-1 block"
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
              className="input-focus-finyk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
            />
          </div>
          <div>
            <label
              htmlFor="hub-privat-token"
              className="text-xs text-muted mb-1 block"
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
                className="input-focus-finyk w-full h-11 rounded-xl border border-line bg-panelHi px-3 pr-10 text-sm text-text"
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
          <label className="flex items-center gap-2.5 cursor-pointer select-none touch-target">
            <input
              type="checkbox"
              className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
              checked={rememberPrivat}
              onChange={(event) => setRememberPrivat(event.target.checked)}
            />
            <span className="text-sm text-muted">{COPY.remember}</span>
          </label>
          {privatError && (
            <p className="text-sm text-danger bg-danger/10 rounded-xl px-3 py-2">
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
