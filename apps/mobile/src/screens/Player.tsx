import { useAudioPlaylist, useAudioPlaylistStatus } from "expo-audio";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useI18n } from "../I18nContext";
import { format } from "../i18n";
import { colors, font, space } from "../theme";
import { Button, Choice } from "../ui";

/** La voix est enregistrée à vitesse normale ; c'est le lecteur qui accélère (décision D3). */
export const SPEEDS = [1, 1.25, 1.5, 2] as const;

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Player({ urls }: { urls: string[] }) {
  const { t } = useI18n();
  const playlist = useAudioPlaylist({ sources: urls.map((uri) => ({ uri })) });
  const status = useAudioPlaylistStatus(playlist);
  const [speed, setSpeed] = useState<number>(1);

  useEffect(() => { playlist.playbackRate = speed; }, [playlist, speed]);

  const seek = (delta: number) => { void playlist.seekTo(Math.max(0, Math.min(status.duration || 0, status.currentTime + delta))); };

  return (
    <View>
      {urls.length > 1 && <Text style={styles.meta}>{format(t.player.part, { i: status.currentIndex + 1, n: status.trackCount || urls.length })}</Text>}
      <Text style={styles.time} accessibilityLiveRegion="polite">{formatTime(status.currentTime)} / {formatTime(status.duration)}</Text>
      <Button label={status.playing ? t.player.pause : t.player.play} onPress={() => (status.playing ? playlist.pause() : playlist.play())} />
      <View style={styles.row}>
        <View style={styles.half}><Button kind="secondary" label={t.player.back15} onPress={() => seek(-15)} /></View>
        <View style={styles.half}><Button kind="secondary" label={t.player.forward15} onPress={() => seek(15)} /></View>
      </View>
      <Text style={styles.meta}>{t.player.speed}</Text>
      <View style={styles.speeds} accessibilityRole="radiogroup">
        {SPEEDS.map((s) => <Choice key={s} label={`×${s}`} selected={speed === s} onPress={() => setSpeed(s)} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  time: { fontSize: font.h2, fontVariant: ["tabular-nums"], color: colors.text, textAlign: "center", marginVertical: space.s },
  meta: { fontSize: font.small, color: colors.muted, marginBottom: space.xs },
  row: { flexDirection: "row", gap: space.s },
  half: { flex: 1 },
  speeds: { flexDirection: "row", flexWrap: "wrap" },
});
