/**
 * Sergeant Hub-core — ErrorBoundary (React Native)
 *
 * Mobile port of the web top-level ErrorBoundary. Class-component API is
 * universal between React DOM and React Native, so the boundary behaviour
 * (`getDerivedStateFromError`, `componentDidCatch`, state shape, reset
 * semantics) stays identical.
 *
 * @see apps/web/src/core/ErrorBoundary.tsx — canonical source of truth
 *
 * Parity notes:
 * - Same public props: `children`, `fallback` as `ReactNode` **or**
 *   render-prop `({error, resetError}) => ReactNode`.
 * - Same `FallbackProps` contract passed to the render-prop form.
 * - Same `resetError` instance method bound in the constructor (callers
 *   rely on stable identity).
 *
 * Differences from web (intentional — see PR body):
 * - Telemetry: web forwards to `captureException` from `./sentry.js`
 *   (a lazy bridge to `@sentry/react`). Mobile uses plain
 *   `console.error` — `@sentry/react-native` is deliberately **not**
 *   added yet; observability lands in Phase 10+.
 * - Default fallback: web leaves `Fallback || null` when no prop is
 *   supplied; mobile renders a shared `Card` + `Button` card with the
 *   same Ukrainian strings the web host screens use
 *   (`"Щось пішло не так"` / `"Перезавантажити"` —
 *   see `apps/web/src/main.jsx`'s inline `ErrorFallback`).
 *   The reset button calls `resetError()` **and** navigates to `'/'`
 *   via `expo-router` so the user lands on the hub after a crash
 *   (chosen over `DevSettings.reload()` which is dev-only; see PR body
 *   for the trade-off write-up).
 * - NativeWind classes resolve through the shared semantic
 *   `fg` / `fg-muted` / `panel` / `line` CSS-variable tokens so the
 *   fallback re-tints with the active light/dark palette — same
 *   wiring noted in `Card.tsx`.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { captureError } from "@/lib/observability";

interface FallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode | ((props: FallbackProps) => ReactNode);
}

interface ErrorBoundaryState {
  error: Error | null;
}

function DefaultErrorFallback({ error, resetError }: FallbackProps) {
  return (
    <View className="flex-1 bg-bg dark:bg-bg items-stretch justify-center p-6">
      <Card variant="default" padding="lg">
        <Text className="text-lg font-semibold text-fg mb-2">
          Щось пішло не так
        </Text>
        <ScrollView className="max-h-40 mb-4">
          <Text className="text-xs text-danger">{error?.message}</Text>
        </ScrollView>
        <Button
          variant="primary"
          size="lg"
          onPress={() => {
            resetError();
            // Return the user to the hub root so a broken deep route
            // can't re-throw on the same tick.
            try {
              router.replace("/");
            } catch {
              // `router` is unavailable outside the expo-router tree
              // (e.g. Storybook / isolated tests) — reset is enough.
            }
          }}
        >
          Перезавантажити
        </Button>
      </Card>
    </View>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  resetError: () => void;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
    this.resetError = () => this.setState({ error: null });
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Forward to Sentry when a DSN is configured; `captureError`
    // falls back to `console.error` in no-op mode so the diagnostic
    // is never silently dropped. The boundary itself must never
    // throw because of telemetry — `captureError` is wrapped in
    // try/catch internally, and this outer guard is belt-and-braces
    // for the `console.error` call itself (RN's console is backed
    // by a LogBox bridge that has been known to throw on very large
    // payloads).
    try {
      console.error("[ErrorBoundary] caught error", error, {
        componentStack: info?.componentStack,
      });
    } catch {
      /* noop */
    }
    captureError(error, { componentStack: info?.componentStack });
  }

  render() {
    const { error } = this.state;
    const { fallback: Fallback, children } = this.props;
    if (error) {
      if (typeof Fallback === "function") {
        return <Fallback error={error} resetError={this.resetError} />;
      }
      if (Fallback !== undefined) {
        return Fallback;
      }
      return (
        <DefaultErrorFallback error={error} resetError={this.resetError} />
      );
    }
    return children;
  }
}
