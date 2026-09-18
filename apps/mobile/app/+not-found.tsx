import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Не знайдено" }} />
      <View style={styles.container}>
        <Text style={styles.title}>Сторінку не знайдено</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>На головну</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: spacing.lg,
  },
  link: { paddingVertical: spacing.md },
  linkText: { color: colors.accent, fontSize: 16 },
});
