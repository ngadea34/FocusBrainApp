import { randomUUID } from "expo-crypto";
import { useRef, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { createEpisode, toAppError } from "../api";
import { useI18n } from "../I18nContext";
import { defaultOutputLocale, format } from "../i18n";
import { supabase } from "../supabase";
import { colors, font, space, TOUCH } from "../theme";
import { Button, Card, Choice, ErrorText, H2, Title } from "../ui";

/** Durées proposées en V1 ; le plan « discovery » plafonne à 15 min (vérifié côté SQL). */
export const OFFERED_DURATIONS = [5, 15] as const;

export function NewEpisode({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const { t, lang } = useI18n();
  const [topic, setTopic] = useState("");
  const [locale, setLocale] = useState(defaultOutputLocale(lang));
  const [minutes, setMinutes] = useState<number>(5);
  const [approval, setApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Même clé pour les nouvelles tentatives du même formulaire : pas de double consommation du quota.
  const key = useRef(randomUUID());

  async function submit() {
    if (topic.trim().length < 3) return setError(t.create.tooShort);
    setBusy(true); setError(null);
    try {
      const { episodeId } = await createEpisode(supabase, {
        topic, outputLocale: locale, durationMinutes: minutes, requireOutlineApproval: approval, idempotencyKey: key.current,
      });
      onCreated(episodeId);
    } catch (e) {
      setError(t.errors[toAppError(e).code]);
      key.current = randomUUID();
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <Title>{t.create.title}</Title>
      <H2>{t.create.topic}</H2>
      <TextInput
        accessibilityLabel={t.create.topic}
        placeholder={t.create.topicHint}
        multiline maxLength={2000}
        value={topic} onChangeText={setTopic}
        style={styles.input}
      />
      <H2>{t.create.language}</H2>
      <View style={styles.row} accessibilityRole="radiogroup">
        {["fr-FR", "en-GB"].map((l) => <Choice key={l} label={t.languages[l] ?? l} selected={locale === l} onPress={() => setLocale(l)} />)}
      </View>
      <H2>{t.create.duration}</H2>
      <View style={styles.row} accessibilityRole="radiogroup">
        {OFFERED_DURATIONS.map((m) => <Choice key={m} label={format(t.create.minutes, { n: m })} selected={minutes === m} onPress={() => setMinutes(m)} />)}
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t.create.approval}</Text>
        <Switch accessibilityLabel={t.create.approval} value={approval} onValueChange={setApproval} trackColor={{ true: colors.accent }} />
      </View>
      {error && <ErrorText>{error}</ErrorText>}
      <Button label={t.create.submit} onPress={submit} busy={busy} />
      <Button label={t.create.cancel} kind="secondary" onPress={onCancel} />
    </Card>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 96, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: space.m, fontSize: font.body, color: colors.text, backgroundColor: colors.bg, marginBottom: space.m, textAlignVertical: "top" },
  row: { flexDirection: "row", flexWrap: "wrap", marginBottom: space.s },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: TOUCH, marginBottom: space.m },
  switchLabel: { flex: 1, fontSize: font.body, color: colors.text, marginRight: space.m },
});
