import { Redirect, Stack } from "expo-router";
import { useUser } from "@sergeant/api-client/react";
import { colors } from "@/theme";

export default function AuthLayout() {
  const { data, isLoading } = useUser();

  if (!isLoading && data?.user) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
