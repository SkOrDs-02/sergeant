import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { Button } from "@shared/components/ui/Button";
import {
  privatApi,
  isApiError,
  monoWebhookApi,
  type MonoSyncState,
} from "@shared/api";
import {
  safeReadStringLS,
  safeWriteLS,
  safeRemoveLS,
} from "@shared/lib/storage/storage";
import { finykKeys, hubKeys } from "@shared/lib/api/queryKeys";
import { useStorage as useFinykStorage } from "../../modules/finyk/hooks/useStorage";
import { useMonoBackfillProgress } from "../../modules/finyk/hooks/useMonoBackfillProgress";
import { BackfillProgressPill } from "../../modules/finyk/components/BackfillProgressPill";
import {
  ConfirmModal,
  SettingsGroup,
  SettingsSubGroup,
} from "./SettingsPrimitives";

const PRIVAT_ENABLED = false;

type ConfirmKind = "cache" | "disconnect" | null;

interface CustomCategory {
  id: string;
  label: string;
}

interface FinykStorageShape {
  customCategories: CustomCategory[];
  addCustomCategory: (label: string) => void;
  removeCustomCategory: (id: string) => void;
}

export function FinykSection() {
  const queryClient = useQueryClient();
  const { customCategories, addCustomCategory, removeCustomCategory } =
    useFinykStorage({}) as FinykStorageShape;

  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");

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
      } catch (err) {
        if (isApiError(err) && err.kind === "http") {
          setPrivatError(err.serverMessage || `Помилка ${err.status}`);
          return;
        }
        throw err;
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
    } catch (e) {
      setPrivatError(
        e instanceof Error && e.message ? e.message : "Помилка підключення",
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

  // === Webhook mode: server-side connect (only mode after roadmap A cleanup) ===
  const [webhookTokenInput, setWebhookTokenInput] = useState("");
  const [webhookConnecting, setWebhookConnecting] = useState(false);
  const [webhookError, setWebhookError] = useState("");
  const [showWebhookToken, setShowWebhookToken] = useState(false);

  const syncStateQuery = useQuery<MonoSyncState>({
    queryKey: finykKeys.monoSyncState,
    queryFn: ({ signal }) => monoWebhookApi.syncState({ signal }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const webhookSyncState = syncStateQuery.data ?? null;
  const webhookConnected =
    webhookSyncState != null && webhookSyncState.status !== "disconnected";

  // Backfill progress: only worth polling once Monobank is connected. The
  // hook itself decides when to stop polling (server flips out of `running`).
  const { progress: backfillProgress } = useMonoBackfillProgress({
    enabled: webhookConnected,
  });

  const connectWebhook = async () => {
    const clean = webhookTokenInput.trim();
    if (!clean) {
      setWebhookError("Введи токен");
      return;
    }
    setWebhookConnecting(true);
    setWebhookError("");
    try {
      await monoWebhookApi.connect(clean, {
        signal: AbortSignal.timeout(30_000),
      });
      setWebhookTokenInput("");
      await queryClient.invalidateQueries({
        queryKey: finykKeys.monoSyncState,
      });
      queryClient.invalidateQueries({
        queryKey: finykKeys.monoWebhookAccounts,
      });
      queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
    } catch (e) {
      if (isApiError(e) && e.kind === "http" && e.isAuth) {
        setWebhookError(
          e.serverMessage ||
            "Токен Monobank недійсний або закінчився. Оновіть токен.",
        );
      } else if (isApiError(e) && e.kind === "aborted") {
        setWebhookError("Monobank API не відповідає. Спробуйте пізніше.");
      } else {
        setWebhookError(
          e instanceof Error && e.message ? e.message : "Помилка підключення",
        );
      }
    } finally {
      setWebhookConnecting(false);
    }
  };

  const disconnectWebhook = async () => {
    try {
      await monoWebhookApi.disconnect();
    } catch {
      /* best-effort */
    }
    queryClient.removeQueries({ queryKey: finykKeys.mono });
    queryClient.removeQueries({ queryKey: finykKeys.monoSyncState });
    queryClient.removeQueries({ queryKey: finykKeys.monoWebhookAccounts });
    queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
  };

  const triggerBackfill = async () => {
    try {
      await monoWebhookApi.backfill();
      // Refresh sync-state and progress simultaneously: progress flips to
      // `running` server-side the moment we get a 200 back, so kicking the
      // poller now means the pill animates in within the next render.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: finykKeys.monoSyncState }),
        queryClient.invalidateQueries({
          queryKey: finykKeys.monoBackfillProgress,
        }),
      ]);
    } catch (e) {
      setWebhookError(
        e instanceof Error && e.message ? e.message : "Помилка re-sync",
      );
    }
  };

  const clearTxCache = () => {
    safeRemoveLS("finyk_tx_cache");
    safeRemoveLS("finyk_tx_cache_last_good");
    queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
    queryClient.removeQueries({
      queryKey: finykKeys.monoWebhookTransactions(),
    });
    queryClient.invalidateQueries({ queryKey: finykKeys.monoSyncState });
  };

  const [refreshing, setRefreshing] = useState(false);
  const refreshAllData = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: finykKeys.mono }),
        queryClient.invalidateQueries({ queryKey: finykKeys.monoSyncState }),
        queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const catInputClass =
    "input-focus-finyk flex-1 min-w-0 h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text";

  return (
    <SettingsGroup title="Фінік" emoji="💳">
      <ConfirmModal
        open={confirmKind !== null}
        title={confirmKind === "cache" ? "Очистити кеш?" : "Вийти з Monobank?"}
        body={
          confirmKind === "cache"
            ? "Буде видалено збережені транзакції в кеші. Потім дані підтягнуться з Monobank знову."
            : "Webhook-з'єднання буде від'єднано. Щоб відновити — введіть токен заново."
        }
        confirmLabel={confirmKind === "cache" ? "Очистити" : "Вийти"}
        danger={confirmKind === "disconnect"}
        onCancel={() => setConfirmKind(null)}
        onConfirm={() => {
          if (confirmKind === "cache") clearTxCache();
          if (confirmKind === "disconnect") disconnectWebhook();
          setConfirmKind(null);
        }}
      />

      <SettingsSubGroup title="Власні категорії витрат">
        <p className="text-xs text-subtle leading-snug">
          Додаються до списку категорій у транзакціях, сплітах і лімітах (можна
          вказати емодзі на початку назви).
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCategoryLabel}
            onChange={(e) => setNewCategoryLabel(e.target.value)}
            placeholder="Напр. 🎨 Хобі"
            maxLength={80}
            className={catInputClass}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCategoryLabel.trim()) {
                addCustomCategory(newCategoryLabel);
                setNewCategoryLabel("");
              }
            }}
          />
          <Button
            type="button"
            className="shrink-0 h-11 px-4"
            onClick={() => {
              addCustomCategory(newCategoryLabel);
              setNewCategoryLabel("");
            }}
          >
            Додати
          </Button>
        </div>
        {customCategories.length > 0 ? (
          <ul className="space-y-0 -mx-4">
            {customCategories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line last:border-0"
              >
                <span className="text-style-label truncate">{c.label}</span>
                <button
                  type="button"
                  onClick={() => removeCustomCategory(c.id)}
                  className="text-xs font-semibold text-danger/80 hover:text-danger shrink-0"
                >
                  Видалити
                </button>
              </li>
            ))}
          </ul>
        ) : (
          // eslint-disable-next-line sergeant-design/no-bare-empty-text
          <p className="text-xs text-muted">Поки немає власних категорій.</p>
        )}
      </SettingsSubGroup>

      {/* ── Webhook mode: Monobank status & connect ── */}
      <SettingsSubGroup title="Monobank (Webhook)">
        {webhookConnected && webhookSyncState ? (
          <div className="space-y-3">
            <div
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border",
                webhookSyncState.status === "active"
                  ? "bg-bg border-green-500/30"
                  : webhookSyncState.status === "pending"
                    ? "bg-bg border-yellow-500/30"
                    : "bg-bg border-red-500/30",
              )}
            >
              <div
                className={cn(
                  "w-2.5 h-2.5 rounded-full shrink-0",
                  webhookSyncState.status === "active"
                    ? "bg-success"
                    : webhookSyncState.status === "pending"
                      ? "bg-warning"
                      : "bg-danger",
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="text-style-label">
                  {webhookSyncState.status === "active"
                    ? "Webhook active"
                    : webhookSyncState.status === "pending"
                      ? "Webhook pending"
                      : "Webhook error"}
                </div>
                <div className="text-xs text-subtle mt-0.5">
                  {webhookSyncState.accountsCount} рахунків
                  {webhookSyncState.lastEventAt && (
                    <>
                      {" · "}
                      {new Date(webhookSyncState.lastEventAt).toLocaleString(
                        "uk-UA",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "numeric",
                          month: "short",
                        },
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1 h-11"
                onClick={triggerBackfill}
                disabled={backfillProgress?.status === "running"}
              >
                {backfillProgress?.status === "running"
                  ? "Re-sync…"
                  : "Re-sync (backfill)"}
              </Button>
              <Button
                variant="danger"
                className="flex-1 h-11"
                onClick={() => setConfirmKind("disconnect")}
              >
                Від{"'"}єднати
              </Button>
            </div>
            <BackfillProgressPill progress={backfillProgress} />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-subtle leading-snug">
              Токен відправляється на сервер і не зберігається у браузері. Mono
              → Налаштування → Інші → API.
            </p>
            <div className="relative">
              <input
                type={showWebhookToken ? "text" : "password"}
                value={webhookTokenInput}
                onChange={(e) => setWebhookTokenInput(e.target.value)}
                placeholder="Токен Monobank API"
                autoComplete="off"
                className="input-focus-finyk w-full h-11 rounded-xl border border-line bg-panelHi px-3 pr-10 text-sm text-text"
                onKeyDown={(e) => e.key === "Enter" && connectWebhook()}
              />
              <button
                type="button"
                onClick={() => setShowWebhookToken((v) => !v)}
                className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-xl text-subtle hover:text-text"
                aria-label={
                  showWebhookToken ? "Приховати токен" : "Показати токен"
                }
              >
                {showWebhookToken ? "\u{1F648}" : "\u{1F441}"}
              </button>
            </div>
            {webhookError && (
              <p className="text-sm text-danger bg-danger/10 rounded-xl px-3 py-2">
                {webhookError}
              </p>
            )}
            <Button
              className="w-full h-11"
              onClick={connectWebhook}
              disabled={webhookConnecting}
            >
              {webhookConnecting
                ? messages.loadingActions.connecting
                : "Підключити Monobank"}
            </Button>
          </div>
        )}
      </SettingsSubGroup>

      <SettingsSubGroup title="Сервіс">
        <p className="text-xs text-subtle leading-snug">
          Дані Monobank приходять автоматично через webhook та оновлюються при
          поверненні у вкладку. Якщо потрібно примусово перепитати сервер —
          натисни «Оновити дані». Якщо список операцій виглядає некоректно —
          очисти кеш і синхронізуй знову.
        </p>
        <Button
          variant="ghost"
          className="w-full h-11"
          onClick={refreshAllData}
          disabled={refreshing}
        >
          {refreshing ? "Оновлення…" : "🔄 Оновити дані"}
        </Button>
        <Button
          variant="ghost"
          className="w-full h-11"
          onClick={() => setConfirmKind("cache")}
        >
          🧹 Очистити кеш транзакцій
        </Button>
      </SettingsSubGroup>

      {PRIVAT_ENABLED && (
        <SettingsSubGroup title="ПриватБанк (Приват24 для підприємців)">
          {confirmDisconnectPrivat && (
            <ConfirmModal
              open
              title="Від'єднати ПриватБанк?"
              body="Credentials та кеш транзакцій ПриватБанку буде видалено з цього браузера."
              confirmLabel="Від'єднати"
              danger
              onCancel={() => setConfirmDisconnectPrivat(false)}
              onConfirm={disconnectPrivat}
            />
          )}
          {privatConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-bg border border-green-500/30 rounded-xl">
                <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-base shrink-0">
                  🏦
                </div>
                <div>
                  <div className="text-style-label text-text">
                    ПриватБанк підключено
                  </div>
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
                Від{"'"}єднати ПриватБанк
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-subtle leading-snug">
                API Приват24 для підприємців. Merchant ID та токен знаходяться у
                Приват24 Бізнес → Налаштування → API.
              </p>
              <div>
                <label
                  htmlFor="hub-privat-merchant-id"
                  className="text-xs text-muted mb-1 block"
                >
                  Merchant ID
                </label>
                <input
                  id="hub-privat-merchant-id"
                  type="text"
                  value={privatIdInput}
                  onChange={(e) => setPrivatIdInput(e.target.value)}
                  placeholder="Ваш Merchant ID"
                  autoComplete="off"
                  className="input-focus-finyk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
                />
              </div>
              <div>
                <label
                  htmlFor="hub-privat-token"
                  className="text-xs text-muted mb-1 block"
                >
                  Токен / пароль
                </label>
                <div className="relative">
                  <input
                    id="hub-privat-token"
                    type={showPrivatToken ? "text" : "password"}
                    value={privatTokenInput}
                    onChange={(e) => setPrivatTokenInput(e.target.value)}
                    placeholder="Merchant token"
                    autoComplete="off"
                    className="input-focus-finyk w-full h-11 rounded-xl border border-line bg-panelHi px-3 pr-10 text-sm text-text"
                    onKeyDown={(e) => e.key === "Enter" && connectPrivat()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPrivatToken((v) => !v)}
                    className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-xl text-subtle hover:text-text"
                    aria-label={showPrivatToken ? "Приховати" : "Показати"}
                  >
                    {showPrivatToken ? "🙈" : "👁"}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                  checked={rememberPrivat}
                  onChange={(e) => setRememberPrivat(e.target.checked)}
                />
                <span className="text-sm text-muted">
                  Запам{"'"}ятати на цьому пристрої
                </span>
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
                  : "Підключити ПриватБанк"}
              </Button>
            </div>
          )}
        </SettingsSubGroup>
      )}
    </SettingsGroup>
  );
}
