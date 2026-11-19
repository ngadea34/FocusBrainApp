import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { isActive, listEpisodes, toAppError, type EpisodeRow } from "../api";
import { useI18n } from "../I18nContext";
import { supabase } from "../supabase";
import { colors, font, space } from "../theme";
import { Body, Button, Card, ErrorText, Title } from "../ui";

export function Library({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: () => void }) {
  const { t } = useI18n();
  const [items, setItems] = useState<EpisodeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await listEpisodes(supabase)); setError(null); }
    catch (e) { setError(t.errors[toAppError(e).code]); }
  }, [t]);

  useEffect(() => { void load(); }, [load]);
  // Actualisation douce tant qu'un épisode est en cours de fabrication.
  useEffect(() => {
    if (!items?.some((e) => isActive(e.status))) return;
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [items, load]);

  return (
    <View>
      <Title>{t.library.title}</Title>
      <Button label={t.library.create} onPress={onCreate} />
      {error && <ErrorText>{error}</ErrorText>}
      {!items && !error && <ActivityIndicator color={colors.accent} accessibilityLabel="…" style={{ marginVertical: space.l }} />}
      {items && items.length === 0 && <Card><Body>{t.library.empty}</Body></Card>}
      {items?.map((e) => (
        <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`${e.title ?? e.topic_prompt}, ${t.status[e.status]}`} onPress={() => onOpen(e.id)}>
          <Card>
            <Text style={styles.itemTitle}>{e.title ?? e.topic_prompt}</Text>
            <Text style={[styles.status, e.status === "ready" && { color: colors.ok }, e.status === "failed" && { color: colors.danger }]}>
              {t.status[e.status]}
            </Text>
          </Card>
        </Pressable>
      ))}
      <Button label={t.library.refresh} kind="secondary" onPress={() => void load()} />
      <Button label={t.library.signOut} kind="secondary" onPress={() => void supabase.auth.signOut()} />
    </View>
  );
}

const styles = StyleSheet.create({
  itemTitle: { fontSize: font.body, fontWeight: "600", color: colors.text, marginBottom: space.xs },
  status: { fontSize: font.small, color: colors.muted },
});
