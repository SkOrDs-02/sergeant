import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eye, EyeOff, Sparkles } from "lucide-react-native";

import { signIn } from "@/auth/authClient";
import { colors } from "@/theme";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      const res = await signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message ?? "Не вдалося увійти");
        return;
      }
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося увійти");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 px-6 justify-center gap-4"
      >
        <View className="flex-row items-center gap-2 mb-2">
          <Sparkles size={28} color={colors.accent} strokeWidth={2} />
          <Text className="text-text text-3xl font-bold">З поверненням</Text>
        </View>
        <Text className="text-muted text-sm mb-4">Раді бачити тебе знову</Text>

        <Input
          type="email"
          placeholder="ваш@email.com"
          value={email}
          onChangeText={setEmail}
          size="lg"
        />

        <View>
          <View className="flex-row justify-between items-center mb-1.5">
            <Text className="text-muted text-xs">Пароль</Text>
            <Link href="/(auth)/forgot-password">
              <Text className="text-accent text-xs font-medium">
                Забув пароль?
              </Text>
            </Link>
          </View>
          <Input
            type="password"
            placeholder="••••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPass}
            size="lg"
            suffix={
              <Pressable
                onPress={() => setShowPass((v) => !v)}
                className="px-1 active:opacity-70"
                accessibilityLabel={
                  showPass ? "Сховати пароль" : "Показати пароль"
                }
              >
                {showPass ? (
                  <EyeOff size={20} color={colors.textMuted} strokeWidth={2} />
                ) : (
                  <Eye size={20} color={colors.textMuted} strokeWidth={2} />
                )}
              </Pressable>
            }
          />
        </View>

        {error ? <Text className="text-danger text-xs">{error}</Text> : null}

        <Button
          variant="primary"
          size="lg"
          loading={loading}
          disabled={!email || !password}
          onPress={onSubmit}
        >
          Увійти
        </Button>

        <View className="flex-row justify-center items-center mt-4 gap-1">
          <Text className="text-muted text-sm">Ще не маєш акаунта?</Text>
          <Link href="/(auth)/sign-up" className="px-1">
            <Text className="text-accent text-sm font-medium">Створити</Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
