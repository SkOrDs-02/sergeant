/**
 * Forgot Password Screen
 *
 * Allows users to request a password reset email.
 * Uses the same visual style as sign-in/sign-up screens.
 */

import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Mail, KeyRound } from "lucide-react-native";

import { forgetPassword } from "@/auth/authClient";
import { colors } from "@/theme";
import { BackButton } from "@/components/ui/BackButton";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!email) return;

    setError(null);
    setLoading(true);
    try {
      const res = await forgetPassword({
        email,
        redirectTo: "sergeant://reset-password",
      });
      if (res.error) {
        setError(res.error.message ?? "Не вдалося надіслати лист");
        return;
      }
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося надіслати лист");
    } finally {
      setLoading(false);
    }
  }

  // Success state - email sent
  if (success) {
    return (
      <SafeAreaView
        className="flex-1 bg-bg dark:bg-cream-950"
        edges={["bottom"]}
      >
        <View className="flex-1 px-6 justify-center items-center gap-4">
          <View className="w-20 h-20 items-center justify-center rounded-3xl bg-brand/15 dark:bg-brand/25 mb-2">
            <Mail size={40} color={colors.accent} strokeWidth={1.5} />
          </View>
          <Text className="text-fg text-2xl font-bold text-center">
            Перевірте пошту
          </Text>
          <Text className="text-fg-muted text-sm text-center max-w-xs leading-relaxed">
            Ми надіслали інструкції для відновлення пароля на{" "}
            <Text className="font-semibold text-fg">{email}</Text>
          </Text>
          <View className="mt-6 w-full gap-3">
            <Button variant="primary" size="lg" onPress={() => router.back()}>
              Повернутися до входу
            </Button>
            <Button
              variant="ghost"
              size="md"
              onPress={() => {
                setSuccess(false);
                setEmail("");
              }}
            >
              Спробувати іншу адресу
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg dark:bg-cream-950" edges={["bottom"]}>
      {/* Header with back button */}
      <View className="px-4 py-2">
        <BackButton />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 px-6 justify-center gap-4"
      >
        {/* Icon and Title */}
        <View className="flex-row items-center gap-3 mb-2">
          <View className="w-12 h-12 items-center justify-center rounded-2xl bg-brand/15 dark:bg-brand/25">
            <KeyRound size={24} color={colors.accent} strokeWidth={2} />
          </View>
          <View>
            <Text className="text-fg text-2xl font-bold">Забули пароль?</Text>
          </View>
        </View>
        <Text className="text-fg-muted text-sm mb-4 leading-relaxed">
          Введіть email, який ви використовували для реєстрації, і ми надішлемо
          інструкції для відновлення пароля.
        </Text>

        {/* Email Input */}
        <Input
          type="email"
          placeholder="ваш@email.com"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError(null);
          }}
          size="lg"
          error={!!error}
          helperText={error ?? undefined}
          showHelperIcon
        />

        {/* Submit Button */}
        <Button
          variant="primary"
          size="lg"
          loading={loading}
          disabled={!email || loading}
          onPress={onSubmit}
        >
          Надіслати інструкції
        </Button>

        {/* Back to sign in link */}
        <View className="flex-row justify-center items-center mt-4 gap-1">
          <Text className="text-fg-muted text-sm">Згадали пароль?</Text>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => router.back()}
            className="px-1"
          >
            Увійти
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
