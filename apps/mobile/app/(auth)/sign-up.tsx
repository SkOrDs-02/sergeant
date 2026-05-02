import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { UserPlus } from "lucide-react-native";

import { signUp } from "@/auth/authClient";
import { colors } from "@/theme";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const len = password.length;
  const level = len < 6 ? 0 : len < 10 ? 1 : 2;
  const labels = ["Слабкий", "Середній", "Надійний"];
  const levelColors = [colors.danger, "#f59e0b", "#84cc16"];
  const widths = ["33%", "66%", "100%"] as const;

  return (
    <View className="mt-1.5">
      <View className="h-1 bg-surface rounded overflow-hidden">
        <View
          style={{
            height: "100%",
            width: widths[level],
            backgroundColor: levelColors[level],
            borderRadius: 4,
          }}
        />
      </View>
      <Text
        style={{ color: levelColors[level] }}
        className="text-xs mt-1 font-semibold"
      >
        {labels[level]}
      </Text>
    </View>
  );
}

export default function SignUpScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      const res = await signUp.email({ email, password, name });
      if (res.error) {
        setError(res.error.message ?? "Не вдалося створити акаунт");
        return;
      }
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося створити акаунт");
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
          <UserPlus size={28} color={colors.accent} strokeWidth={2} />
          <Text className="text-text text-3xl font-bold">Створити акаунт</Text>
        </View>
        <Text className="text-muted text-sm mb-4">
          Безкоштовно. Без зайвого.
        </Text>

        <Input
          placeholder="Твоє ім'я"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          textContentType="name"
          size="lg"
        />
        <Input
          type="email"
          placeholder="ваш@email.com"
          value={email}
          onChangeText={setEmail}
          size="lg"
        />

        <View>
          <Input
            type="password"
            placeholder="Придумай надійний пароль"
            value={password}
            onChangeText={setPassword}
            size="lg"
          />
          <PasswordStrength password={password} />
        </View>

        {error ? <Text className="text-danger text-xs">{error}</Text> : null}

        <Button
          variant="primary"
          size="lg"
          loading={loading}
          disabled={!name || !email || password.length < 10}
          onPress={onSubmit}
        >
          Зареєструватися
        </Button>

        <View className="flex-row justify-center items-center mt-4 gap-1.5">
          <Text className="text-muted text-sm">Вже є акаунт?</Text>
          <Link href="/(auth)/sign-in" className="px-1">
            <Text className="text-accent text-sm font-medium">Увійти</Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
