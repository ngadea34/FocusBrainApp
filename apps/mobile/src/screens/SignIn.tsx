import { useState } from "react";
import { StyleSheet, TextInput } from "react-native";
import { useI18n } from "../I18nContext";
import { format, type Dictionary } from "../i18n";
import { supabase } from "../supabase";
import { colors, font, space, TOUCH } from "../theme";
import { Body, Button, Card, ErrorText, Title } from "../ui";

export const isPlausibleEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
export const MIN_PASSWORD = 8;

/** Message d'erreur d'authentification compréhensible, à partir du code renvoyé par Supabase Auth. */
export function authErrorMessage(t: Dictionary, e: { code?: string; status?: number }): string {
  if (e.status === 429 || e.code === "over_email_send_rate_limit" || e.code === "over_request_rate_limit") return t.signIn.rateLimited;
  if (e.code === "email_not_confirmed") return t.signIn.notConfirmed;
  if (e.code === "invalid_credentials") return t.signIn.wrongCredentials;
  if (e.code === "weak_password") return t.signIn.shortPassword;
  if (e.code === "email_address_invalid") return t.signIn.invalidEmail;
  return t.errors.unknown;
}

export function SignIn() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    if (!isPlausibleEmail(email)) return setError(t.signIn.invalidEmail);
    if (password.length < MIN_PASSWORD) return setError(t.signIn.shortPassword);
    setBusy(true); setError(null); setNotice(null);
    const creds = { email: email.trim(), password };
    if (mode === "signIn") {
      const { error: e } = await supabase.auth.signInWithPassword(creds);
      if (e) setError(authErrorMessage(t, e));
    } else {
      const { data, error: e } = await supabase.auth.signUp(creds);
      if (e) setError(authErrorMessage(t, e));
      else if (!data.session) { setNotice(format(t.signIn.checkEmail, { email: creds.email })); setMode("signIn"); }
    }
    setBusy(false);
  }

  return (
    <Card>
      <Title>{mode === "signIn" ? t.signIn.title : t.signIn.signUp}</Title>
      {notice ? <Body>{notice}</Body> : <Body>{t.signIn.intro}</Body>}
      <TextInput
        accessibilityLabel={t.signIn.email} placeholder={t.signIn.email}
        autoCapitalize="none" autoComplete="email" keyboardType="email-address" inputMode="email"
        value={email} onChangeText={setEmail} style={styles.input}
      />
      <TextInput
        accessibilityLabel={t.signIn.password} placeholder={t.signIn.password}
        autoCapitalize="none" autoComplete={mode === "signIn" ? "current-password" : "new-password"} secureTextEntry
        value={password} onChangeText={setPassword} onSubmitEditing={submit} style={styles.input}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button label={mode === "signIn" ? t.signIn.signIn : t.signIn.signUp} onPress={submit} busy={busy} />
      <Button kind="secondary" label={mode === "signIn" ? t.signIn.toSignUp : t.signIn.toSignIn}
        onPress={() => { setMode(mode === "signIn" ? "signUp" : "signIn"); setError(null); }} />
    </Card>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: TOUCH, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: space.m, fontSize: font.body, color: colors.text, backgroundColor: colors.bg, marginBottom: space.s },
});
