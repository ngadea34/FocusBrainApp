import { useAudioPlaylist, useAudioPlaylistStatus } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { chapterAt, type Chapter, type Progress } from "../api";
import { useI18n } from "../I18nContext";
import { format } from "../i18n";
import { colors, font, space, TOUCH } from "../theme";
import { Body, Button, Choice } from "../ui";

/** La voix est enregistrée à vitesse normale ; c'est le lecteur qui accélère (décision D3). */
export const SPEEDS = [1, 1.25, 1.5, 2] as const;
/** Fréquence d'enregistrement de la position pendant la lecture. */
export const SAVE_EVERY_MS = 15_000;
/** Au-delà, l'épisode est considéré comme écouté jusqu'au bout. */
export const COMPLETION_RATIO = 0.97;

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60));
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm.padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

/** Position de reprise : on ne reprend ni un épisode terminé ni les 5 premières secondes. */
export function resumePositionSec(p: Progress | null): number {
  if (!p || p.completed || p.positionMs < 5000) return 0;
  return p.positionMs / 1000;
}

export function Player({ urls, chapters = [], progress = null, onProgress }: {
  urls: string[];
  chapters?: readonly Chapter[];
  progress?: Progress | null;
  onProgress?: (p: Progress) => void;
}) {
  const { t } = useI18n();
  const playlist = useAudioPlaylist({ sources: urls.map((uri) => ({ uri })) });
  const status = useAudioPlaylistStatus(playlist);
  const single = urls.length === 1;
  const [speed, setSpeed] = useState<number>(progress?.playbackRate && SPEEDS.includes(progress.playbackRate as never) ? progress.playbackRate : 1);
  const [resumedAt, setResumedAt] = useState<number>(0);
  const resumed = useRef(false);
  const lastSave = useRef(0);

  useEffect(() => { playlist.playbackRate = speed; }, [playlist, speed]);

  // Reprise : une fois le fichier chargé, on se place là où l'écoute s'était arrêtée.
  useEffect(() => {
    if (resumed.current || !single || !status.duration) return;
    resumed.current = true;
    const at = resumePositionSec(progress);
    if (at > 0 && at < status.duration) { void playlist.seekTo(at); setResumedAt(at); }
  }, [single, status.duration, progress, playlist]);

  const positionMs = status.currentTime * 1000;
  const chapterIdx = chapterAt(chapters, positionMs);
  const report = (completed = false) => {
    if (!single || !onProgress) return;
    lastSave.current = Date.now();
    onProgress({ positionMs, chapterIndex: chapterIdx, playbackRate: speed, completed });
  };

  useEffect(() => {
    if (!single || !status.duration) return;
    if (status.currentTime / status.duration >= COMPLETION_RATIO) { if (Date.now() - lastSave.current > 2000) report(true); return; }
    if (status.playing && Date.now() - lastSave.current >= SAVE_EVERY_MS) report();
  });

  const seek = (sec: number) => { void playlist.seekTo(Math.max(0, Math.min(status.duration || 0, sec))); };
  const toggle = () => { if (status.playing) { playlist.pause(); report(); } else playlist.play(); };

  return (
    <View>
      {!single && <Text style={styles.meta}>{format(t.player.part, { i: status.currentIndex + 1, n: status.trackCount || urls.length })}</Text>}
      {resumedAt > 0 && (
        <View>
          <Body muted>{format(t.player.resumed, { time: formatTime(resumedAt) })}</Body>
          <Button kind="secondary" label={t.player.restart} onPress={() => { seek(0); setResumedAt(0); }} />
        </View>
      )}
      {chapterIdx >= 0 && <Text style={styles.chapterNow}>{chapters[chapterIdx]!.title}</Text>}
      <Text style={styles.time} accessibilityLiveRegion="polite">{formatTime(status.currentTime)} / {formatTime(status.duration)}</Text>
      <Button label={status.playing ? t.player.pause : t.player.play} onPress={toggle} />
      <View style={styles.row}>
        <View style={styles.half}><Button kind="secondary" label={t.player.back15} onPress={() => seek(status.currentTime - 15)} /></View>
        <View style={styles.half}><Button kind="secondary" label={t.player.forward15} onPress={() => seek(status.currentTime + 15)} /></View>
      </View>
      <Text style={styles.meta}>{t.player.speed}</Text>
      <View style={styles.wrap} accessibilityRole="radiogroup">
        {SPEEDS.map((s) => <Choice key={s} label={`×${s}`} selected={speed === s} onPress={() => setSpeed(s)} />)}
      </View>
      {single && chapters.length > 1 && (
        <View>
          <Text style={styles.meta}>{t.player.chapters}</Text>
          {chapters.map((c, i) => (
            <Pressable key={i} accessibilityRole="button" accessibilityState={{ selected: i === chapterIdx }} accessibilityLabel={`${c.title}, ${formatTime(c.start_ms / 1000)}`}
              onPress={() => seek(c.start_ms / 1000)} style={[styles.chapter, i === chapterIdx && styles.chapterActive]}>
              <Text style={styles.chapterTime}>{formatTime(c.start_ms / 1000)}</Text>
              <Text style={[styles.chapterTitle, i === chapterIdx && { fontWeight: "700" }]}>{c.title}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  time: { fontSize: font.h2, fontVariant: ["tabular-nums"], color: colors.text, textAlign: "center", marginVertical: space.s },
  meta: { fontSize: font.small, color: colors.muted, marginTop: space.s, marginBottom: space.xs },
  chapterNow: { fontSize: font.body, color: colors.accent, textAlign: "center", fontWeight: "600" },
  row: { flexDirection: "row", gap: space.s },
  half: { flex: 1 },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  chapter: { flexDirection: "row", alignItems: "center", minHeight: TOUCH, paddingHorizontal: space.s, borderRadius: 8 },
  chapterActive: { backgroundColor: colors.bg },
  chapterTime: { width: 64, fontSize: font.small, color: colors.muted, fontVariant: ["tabular-nums"] },
  chapterTitle: { flex: 1, fontSize: font.body, color: colors.text },
});
