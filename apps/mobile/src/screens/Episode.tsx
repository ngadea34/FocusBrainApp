import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  approveOutline, cancelGeneration, getEpisodeDetail, isActive, playbackPaths, progressOf, requestGeneration,
  signedUrls, toAppError, type EpisodeDetail,
} from "../api";
import { useI18n } from "../I18nContext";
import { format } from "../i18n";
import { supabase } from "../supabase";
import { colors, font, space } from "../theme";
import { Body, Button, Card, ErrorText, H2, Title } from "../ui";
import { Player } from "./Player";

export function Episode({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useI18n();
  const [d, setD] = useState<EpisodeDetail | null>(null);
  const [urls, setUrls] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await getEpisodeDetail(supabase, id);
      setD(detail);
      setError(null);
      if (detail.episode.status === "ready") {
        const paths = playbackPaths(detail.audio);
        setUrls(paths.length ? await signedUrls(supabase, paths) : []);
      }
    } catch (e) { setError(t.errors[toAppError(e).code]); }
  }, [id, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!d || !isActive(d.episode.status)) return;
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [d, load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await load(); } catch (e) { setError(t.errors[toAppError(e).code]); } finally { setBusy(false); }
  }

  if (!d) return <View><Button kind="secondary" label={t.episode.back} onPress={onBack} />{error ? <ErrorText>{error}</ErrorText> : <Body muted>…</Body>}</View>;
  const { episode, outline, sources, steps } = d;
  const progress = progressOf(steps);

  return (
    <View>
      <Button kind="secondary" label={t.episode.back} onPress={onBack} />
      <Title>{episode.title ?? episode.topic_prompt}</Title>
      <Card>
        <H2>{t.episode.status}</H2>
        <Text style={[styles.status, episode.status === "ready" && { color: colors.ok }, episode.status === "failed" && { color: colors.danger }]}>
          {t.status[episode.status]}
        </Text>
        {isActive(episode.status) && episode.status !== "queued" && progress.total > 0 && <Body muted>{format(t.episode.progress, progress)}</Body>}
        {episode.status === "queued" && progress.done === 0 && <Body muted>{t.episode.waitingWorker}</Body>}
        {error && <ErrorText>{error}</ErrorText>}
        {(isActive(episode.status) || episode.status === "awaiting_approval") &&
          <Button kind="danger" label={t.episode.cancel} busy={busy} onPress={() => act(() => cancelGeneration(supabase, id))} />}
        {episode.status === "failed" &&
          <Button label={t.episode.retry} busy={busy} onPress={() => act(() => requestGeneration(supabase, id, randomUUID()))} />}
      </Card>

      {episode.status === "ready" && (
        <Card>
          <H2>{t.episode.listen}</H2>
          {urls && urls.length > 0 ? <Player urls={urls} key={urls.join("|")} /> : <Body muted>{t.episode.noAudio}</Body>}
        </Card>
      )}

      {outline && (
        <Card>
          <H2>{t.episode.outline}</H2>
          {outline.content.sections.map((s, i) => (
            <View key={i} style={styles.section}>
              <Text style={styles.sectionTitle}>{i + 1}. {s.title}</Text>
              {s.goal ? <Body muted>{s.goal}</Body> : null}
            </View>
          ))}
          {episode.status === "awaiting_approval" &&
            <Button label={t.episode.approve} busy={busy} onPress={() => act(() => approveOutline(supabase, id))} />}
        </Card>
      )}

      <Card>
        <H2>{t.episode.sources}</H2>
        {sources.length === 0 && <Body muted>{t.episode.noSources}</Body>}
        {sources.map((s, i) => {
          const url = s.sources?.url ?? (s.sources?.doi ? `https://doi.org/${s.sources.doi}` : null);
          return (
            <Pressable key={i} disabled={!url} accessibilityRole={url ? "link" : undefined} onPress={() => url && void Linking.openURL(url)} style={styles.source}>
              <Text style={styles.sourceTitle}>{s.sources?.citation ?? s.sources?.title ?? "?"}</Text>
              <Text style={styles.meta}>{format(t.episode.tier, { n: s.quality_tier })}{s.sources?.license_code ? ` · ${s.sources.license_code}` : ""}</Text>
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { fontSize: font.h2, fontWeight: "600", color: colors.text, marginBottom: space.s },
  section: { marginBottom: space.s },
  sectionTitle: { fontSize: font.body, fontWeight: "600", color: colors.text },
  source: { paddingVertical: space.s, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sourceTitle: { fontSize: font.small, color: colors.accent, lineHeight: 21 },
  meta: { fontSize: font.small, color: colors.muted },
});
