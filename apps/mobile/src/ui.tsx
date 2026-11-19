import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, font, space, TOUCH } from "./theme";

export function Button({ label, onPress, kind = "primary", disabled, busy }: {
  label: string; onPress: () => void; kind?: "primary" | "secondary" | "danger"; disabled?: boolean; busy?: boolean;
}) {
  const bg = kind === "primary" ? colors.accent : colors.card;
  const fg = kind === "primary" ? colors.accentText : kind === "danger" ? colors.danger : colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, borderColor: kind === "primary" ? bg : colors.border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={styles.title}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={styles.h2}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.muted }]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="alert" style={[styles.body, { color: colors.danger }]}>{children}</Text>;
}

export function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.choice, selected && { backgroundColor: colors.accent, borderColor: colors.accent }]}
    >
      <Text style={[styles.choiceText, selected && { color: colors.accentText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: TOUCH, borderRadius: 10, borderWidth: 1, paddingHorizontal: space.m, alignItems: "center", justifyContent: "center", marginVertical: space.xs },
  buttonText: { fontSize: font.body, fontWeight: "600" },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.m, marginBottom: space.m },
  title: { fontSize: font.title, fontWeight: "700", color: colors.text, marginBottom: space.m },
  h2: { fontSize: font.h2, fontWeight: "700", color: colors.text, marginBottom: space.s },
  body: { fontSize: font.body, lineHeight: 25, color: colors.text, marginBottom: space.s },
  choice: { minHeight: TOUCH, minWidth: TOUCH, paddingHorizontal: space.m, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", marginRight: space.s, marginBottom: space.s },
  choiceText: { fontSize: font.body, color: colors.text },
});
