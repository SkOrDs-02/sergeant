/**
 * Last validated: 2026-10-03
 * Status: Active
 *
 * Ключ локальної мітки «push увімкнено» (оптимістичний кеш для першого
 * рендера тумблера). Винесено в окремий крихітний модуль, щоб його могли
 * читати і хук `usePushNotifications`, і `core/auth/releasePushOnLogout`
 * (eager-поверхня) без статичного імпорту всього хука.
 */
export const PUSH_SUB_KEY = "hub_push_subscribed";
