/**
 * Востаннє перевірено: 2026-07-16
 * Статус: Активний
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiError, monoWebhookApi, type MonoSyncState } from "@shared/api";
import { Notice } from "@shared/components/ui/Notice";
import { Button } from "@shared/components/ui/Button";
import { ContentGroup, ContentRow } from "@shared/components/ui/ContentGroup";
import { finykKeys, hubKeys } from "@shared/lib/api/queryKeys";
import { isRetriableError } from "@shared/lib/api/queryClient";
import { cn } from "@shared/lib/ui/cn";
import { BackfillProgressPill } from "@finyk/components/BackfillProgressPill";
import { useMonoBackfillProgress } from "@finyk/hooks/useMonoBackfillProgress";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { SettingsSubGroup } from "./SettingsPrimitives";
import { MonoTokenInlineForm } from "./MonoTokenInlineForm";
import { failedCopy } from "@shared/i18n/failedCopy";

type ConfirmKind = "cache" | "disconnect" | null;

interface FinykWebhookServiceSectionProps {
  inView: boolean;
}

const COPY = {
  clearCacheTitle: "Перезавантажити операції?",
  disconnectTitle: "Вийти з Monobank?",
  clearCacheBody:
    "Відкриті списки операцій знову завантажаться із сервера Sergeant. Збережена історія, ручні записи та категорії залишаться.",
  disconnectBody:
    "Автоматичне отримання операцій з Monobank вимкнеться. Щоб відновити, введи токен заново.",
  clear: "Перезавантажити",
  exit: "Вийти",
  accounts: "рахунків",
  disconnect: "Відʼєднати",
  tokenHelp:
    "Токен відправляється на сервер і не зберігається у браузері. Mono → Налаштування → Інші → API.",
  connect: "Підключити Monobank",
  integrationTitle: "Monobank",
  serviceRefreshTitle: "Оновлення операцій",
  serviceCacheTitle: "Відновлення списку операцій",
  serviceRefreshHelp:
    "Операції з Monobank приходять самі й оновлюються, коли ти повертаєшся у вкладку. Щоб перевірити просто зараз, натисни «Оновити дані».",
  serviceCacheHelp:
    "Якщо список виглядає застарілим, завантаж операції із сервера заново. Збережена історія залишиться доступною.",
  refreshing: "Оновлення…",
  refresh: "Оновити дані",
  clearTransactions: "Перезавантажити операції",
  reloading: "Перезавантажую…",
  // L-15: `GET /api/mono/sync-state` може впасти через мережу/5xx —
  // окремо від чесного "ще не підключено". Раніше обидва стани малювали
  // однакову форму вводу токена, тож юзер із живим підключенням бачив
  // прохання "підключити Monobank" через тимчасовий збій перевірки.
  checkFailed:
    "Не вдалося перевірити стан підключення Monobank. Це не означає, що підключення втрачено, перевір мережу і спробуй ще раз.",
  retryCheck: "Спробувати ще раз",
  // F7 (review): сусідня кнопка «Оновити дані» показує busy-стан
  // (`disabled` + «Оновлення…») під час запиту — ретрай тут мав ту саму
  // прогалину: без цього тап на повільній мережі виглядав мертвим.
  checking: "Перевіряю…",
  // Перевірка живості токена (міграція 120). Формулювання навмисно не
  // звинувачує людину й не каже «помилка»: найчастіша причина — вона сама
  // відкликала токен у Monobank, і це нормальна дія, а не поломка.
  reconnectTitle: "Monobank втратив звʼязок",
  reconnectBody:
    "Monobank більше не приймає збережений токен, найчастіше так буває, якщо його відкликали в застосунку банку. Операції не оновлюються. Встав новий токен, щоб відновити: Mono → Налаштування → Інші → API.",
  reconnect: "Підключити новий токен",
} as const;

/**
 * AI-CONTEXT: підключення Monobank і backfill — БЕЗКОШТОВНІ, і Pro-гейта тут
 * бути не має. Канон: `docs/product/model/product-overview.md`, рядок 7 —
 * «Ядро безкоштовне + банк-sync Free назавжди; AI — пейвол». До 2026-09-02
 * пейволл стояв саме тут, і лише тут: другий вхід у те саме
 * `POST /api/mono/connect` (Фінік → `NoBankBanner` → `FinykLoginScreen`)
 * гейта не мав ніколи, тож Free-юзер підключав банк повз пейволл з одного
 * екрана і бачив пропозицію купити Pro з іншого. Не помічали, бо тест мокає
 * `usePlan: () => ({ isPro: true })` — гілка пейволу не виконувалась жодного
 * разу. Знято за рішенням власника; `requirePlan` на сервер для цього
 * маршруту НЕ додаємо — платити тут нема за що.
 */
export function FinykWebhookServiceSection({
  inView,
}: FinykWebhookServiceSectionProps) {
  const queryClient = useQueryClient();
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [webhookTokenInput, setWebhookTokenInput] = useState("");
  const [webhookConnecting, setWebhookConnecting] = useState(false);
  const [webhookError, setWebhookError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [reloading, setReloading] = useState(false);

  const syncStateQuery = useQuery<MonoSyncState>({
    queryKey: finykKeys.monoSyncState,
    queryFn: ({ signal }) => monoWebhookApi.syncState({ signal }),
    enabled: inView,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const webhookSyncState = syncStateQuery.data ?? null;
  // `invalid` — це підключення, яке БУЛО живим і перестало: сервер сходив
  // у Monobank і дістав явну відмову в авторизації (перевірка живості
  // токена, міграція 120). Раніше такий статус потрапляв у
  // `webhookConnected` разом з `active`/`pending` і малював той самий блок
  // «підключено», тільки з червоною крапкою — тобто повідомляв про
  // проблему й водночас не давав жодного способу її полагодити, крім
  // «Відʼєднати» наосліп. Тепер це окрема гілка з формою нового токена.
  const webhookNeedsReconnect = webhookSyncState?.status === "invalid";
  const webhookConnected =
    webhookSyncState != null &&
    webhookSyncState.status !== "disconnected" &&
    !webhookNeedsReconnect;
  // L-15: query-помилка (мережа/5xx/timeout) — це НЕ те саме, що чесний
  // "disconnected" статус із валідної відповіді сервера. Без цього
  // розрізнення `webhookConnected === false` і в обох випадках рендерився
  // той самий "підключи Monobank" екран.
  //
  // F2 (review): `isError` саме по собі не розрізняє тимчасовий збій
  // (мережа/5xx — власне випадок L-15) від ПОСТІЙНОЇ HTTP-помилки (напр.
  // 404, коли `MONO_WEBHOOK_ENABLED=false` на сервері, або 401/403).
  // Для таких кодів "спробувати ще раз" ніколи не допоможе — і без цього
  // звуження `webhookCheckFailed` намертво ховав форму підключення позаду
  // банера, що бреше про мережу. `isRetriableError` (той самий гейт, що
  // й `queryClient`-ретраї) відсіює саме нересурсні/постійні помилки —
  // для них рендер провалюється до звичайної форми токена.
  const webhookCheckFailed =
    syncStateQuery.isError &&
    !webhookConnected &&
    isRetriableError(syncStateQuery.error);
  const { progress: backfillProgress } = useMonoBackfillProgress({
    enabled: inView && webhookConnected,
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
    } catch (error) {
      if (isApiError(error) && error.kind === "http" && error.isAuth) {
        setWebhookError(
          error.serverMessage ||
            "Токен Monobank недійсний або закінчився. Онови токен.",
        );
      } else if (isApiError(error) && error.kind === "aborted") {
        setWebhookError("Monobank API не відповідає. Спробуй пізніше.");
      } else {
        setWebhookError(failedCopy("підключити Monobank"));
      }
    } finally {
      setWebhookConnecting(false);
    }
  };

  const disconnectWebhook = async () => {
    setWebhookError("");
    try {
      await monoWebhookApi.disconnect();
    } catch (error) {
      setWebhookError(
        error instanceof Error && error.message
          ? error.message
          : "Не вдалося відʼєднати Monobank",
      );
      return;
    }
    queryClient.removeQueries({ queryKey: finykKeys.mono });
    queryClient.removeQueries({ queryKey: finykKeys.monoSyncState });
    queryClient.removeQueries({ queryKey: finykKeys.monoWebhookAccounts });
    queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
  };

  const triggerBackfill = async () => {
    setWebhookError("");
    try {
      await monoWebhookApi.backfill();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: finykKeys.monoSyncState }),
        queryClient.invalidateQueries({
          queryKey: finykKeys.monoBackfillProgress,
        }),
      ]);
    } catch {
      setWebhookError(failedCopy("повторити синхронізацію"));
    }
  };

  const clearTxCache = async () => {
    if (reloading) return;
    setReloading(true);
    setWebhookError("");
    try {
      // Date-bucketed read caches only: preserve the SQLite mirror and
      // user-authored records, and refetch every currently observed list.
      await queryClient.resetQueries(
        { queryKey: finykKeys.monoWebhookTransactionsPrefix },
        { throwOnError: true },
      );
      await queryClient.invalidateQueries({
        queryKey: hubKeys.preview("finyk"),
      });
    } catch {
      setWebhookError(failedCopy("перезавантажити операції Monobank"));
    } finally {
      setReloading(false);
    }
  };

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

  return (
    <>
      <ConfirmDialog
        open={confirmKind !== null}
        title={
          confirmKind === "cache" ? COPY.clearCacheTitle : COPY.disconnectTitle
        }
        description={
          confirmKind === "cache" ? COPY.clearCacheBody : COPY.disconnectBody
        }
        confirmLabel={confirmKind === "cache" ? COPY.clear : COPY.exit}
        danger={confirmKind === "disconnect"}
        onCancel={() => setConfirmKind(null)}
        onConfirm={() => {
          if (confirmKind === "cache") void clearTxCache();
          if (confirmKind === "disconnect") disconnectWebhook();
          setConfirmKind(null);
        }}
      />

      <SettingsSubGroup title={COPY.integrationTitle}>
        <ContentGroup
          as="section"
          variant="bounded"
          className="p-4"
          aria-label={COPY.integrationTitle}
        >
          {webhookConnected && webhookSyncState ? (
            <div className="space-y-3">
              <ContentGroup>
                <ContentRow className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-2.5 h-2.5 rounded-mark shrink-0",
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
                        ? "Синхронізація активна"
                        : webhookSyncState.status === "pending"
                          ? "Синхронізація очікує"
                          : "Синхронізація не працює"}
                    </div>
                    <div className="text-style-caption text-subtle mt-0.5">
                      {webhookSyncState.accountsCount} {COPY.accounts}
                      {webhookSyncState.lastEventAt && (
                        <>
                          {" · "}
                          {new Date(
                            webhookSyncState.lastEventAt,
                          ).toLocaleString("uk-UA", {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "numeric",
                            month: "short",
                            timeZone: "Europe/Kyiv",
                          })}
                        </>
                      )}
                    </div>
                  </div>
                </ContentRow>
                <ContentRow className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-11"
                    onClick={triggerBackfill}
                    disabled={backfillProgress?.status === "running"}
                  >
                    {backfillProgress?.status === "running"
                      ? "Повторна синхронізація…"
                      : "Синхронізувати історію"}
                  </Button>
                  <Button
                    variant="outline"
                    tone="danger"
                    className="flex-1 h-11"
                    onClick={() => setConfirmKind("disconnect")}
                  >
                    {COPY.disconnect}
                  </Button>
                </ContentRow>
              </ContentGroup>
              <BackfillProgressPill progress={backfillProgress} />
            </div>
          ) : webhookNeedsReconnect ? (
            <div className="space-y-3">
              <Notice tone="ink" role="alert">
                <div>{COPY.reconnectTitle}</div>
                <p className="mt-0.5 font-normal text-muted">
                  {COPY.reconnectBody}
                </p>
              </Notice>
              <MonoTokenInlineForm
                value={webhookTokenInput}
                onChange={setWebhookTokenInput}
                onSubmit={connectWebhook}
                submitting={webhookConnecting}
                submitLabel={COPY.reconnect}
                help={null}
              />
              <Button
                variant="outline"
                tone="danger"
                className="w-full h-11"
                onClick={() => setConfirmKind("disconnect")}
              >
                {COPY.disconnect}
              </Button>
            </div>
          ) : webhookCheckFailed ? (
            <div className="space-y-3">
              <p
                className="text-style-body text-danger bg-danger/10 rounded-panel px-3 py-2"
                role="alert"
              >
                {COPY.checkFailed}
              </p>
              <Button
                variant="outline"
                className="w-full h-11"
                onClick={() => syncStateQuery.refetch()}
                disabled={syncStateQuery.isFetching}
              >
                {syncStateQuery.isFetching ? COPY.checking : COPY.retryCheck}
              </Button>
            </div>
          ) : (
            <MonoTokenInlineForm
              value={webhookTokenInput}
              onChange={setWebhookTokenInput}
              onSubmit={connectWebhook}
              submitting={webhookConnecting}
              submitLabel={COPY.connect}
              help={COPY.tokenHelp}
            />
          )}
          {webhookError && (
            <p
              className="text-style-body text-danger bg-danger/10 rounded-panel px-3 py-2"
              role="alert"
            >
              {webhookError}
            </p>
          )}
          <ContentRow className="mt-4">
            <p className="text-style-label text-text">
              {COPY.serviceRefreshTitle}
            </p>
            <p className="mt-1 text-style-caption text-subtle leading-snug">
              {COPY.serviceRefreshHelp}
            </p>
            <Button
              variant="outline"
              className="mt-3 w-full h-11"
              onClick={refreshAllData}
              disabled={refreshing}
            >
              {refreshing ? COPY.refreshing : COPY.refresh}
            </Button>
          </ContentRow>
          <ContentRow>
            <p className="text-style-label text-text">
              {COPY.serviceCacheTitle}
            </p>
            <p className="mt-1 text-style-caption text-subtle leading-snug">
              {COPY.serviceCacheHelp}
            </p>
            <Button
              variant="outline"
              className="mt-3 w-full h-11"
              onClick={() => setConfirmKind("cache")}
              disabled={reloading}
            >
              {reloading ? COPY.reloading : COPY.clearTransactions}
            </Button>
          </ContentRow>
        </ContentGroup>
      </SettingsSubGroup>
    </>
  );
}
