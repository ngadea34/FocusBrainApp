import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, Platform, ScrollView, StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { I18nProvider } from "./src/I18nContext";
import { Episode } from "./src/screens/Episode";
import { Library } from "./src/screens/Library";
import { NewEpisode } from "./src/screens/NewEpisode";
import { SignIn } from "./src/screens/SignIn";
import { supabase } from "./src/supabase";
import { colors, space } from "./src/theme";

type Screen = { name: "library" } | { name: "new" } | { name: "episode"; id: string };

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>({ name: "library" });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Bouton retour d'Android : revient à la bibliothèque au lieu de quitter l'application.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen.name === "library") return false;
      setScreen({ name: "library" });
      return true;
    });
    return () => sub.remove();
  }, [screen]);

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SafeAreaView style={styles.safe}>
          <StatusBar style="dark" />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {session === undefined ? <ActivityIndicator color={colors.accent} /> :
              !session ? <SignIn /> :
              screen.name === "new" ? <NewEpisode onCreated={(id) => setScreen({ name: "episode", id })} onCancel={() => setScreen({ name: "library" })} /> :
              screen.name === "episode" ? <Episode id={screen.id} onBack={() => setScreen({ name: "library" })} /> :
              <Library onOpen={(id) => setScreen({ name: "episode", id })} onCreate={() => setScreen({ name: "new" })} />}
          </ScrollView>
        </SafeAreaView>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.m, maxWidth: 640, width: "100%", alignSelf: "center" },
});
