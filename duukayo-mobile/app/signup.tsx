import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { publicApi } from "../src/lib/api";
import { useFeedback } from "../src/lib/feedback";

export default function Signup() {
  const router = useRouter();
  const [username, setUsername] = useState(""), [email, setEmail] = useState("");
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const [error, setError] = useFeedback("error"), [message, setMessage] = useFeedback("success");
  const running = useRef(false);
  async function submit() {
    if (running.current) return;
    setError("");
    if (!/^[a-zA-Z0-9@.+_-]{3,150}$/.test(username.trim())) { setError("Use a username of at least 3 letters, digits or @ . + - _."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
    if (password.length < 10) { setError("Use at least 10 characters for your password."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    running.current = true; setBusy(true);
    try { const result = await publicApi<{ detail: string }>("auth/accounts/", { username: username.trim(), email: email.trim(), password, confirm_password: confirm }); setPassword(""); setConfirm(""); setDone(true); setMessage(result.detail); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to register. Try again."); }
    finally { running.current = false; setBusy(false); }
  }
  return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}><Text style={s.brand}>DuukaYo</Text><Text style={s.title}>Create your account</Text><Text style={s.copy}>Shop with one account. Your administrator can add team access after you register.</Text>{!!error && <Text style={s.error}>{error}</Text>}{done ? <Text style={s.copy}>{message}</Text> : <View style={s.form}>
    <Text>Username</Text><TextInput accessibilityLabel="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" maxLength={150} editable={!busy} style={s.input} />
    <Text>Email</Text><TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" maxLength={254} editable={!busy} style={s.input} />
    <Text>Password</Text><TextInput accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" maxLength={128} editable={!busy} style={s.input} /><Text style={s.copy}>Use at least 10 characters. Keep your password private.</Text>
    <Text>Confirm password</Text><TextInput accessibilityLabel="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" maxLength={128} editable={!busy} style={s.input} />
    <Pressable accessibilityRole="button" accessibilityLabel="Create account" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void submit()} style={s.button}><Text style={s.buttonText}>{busy ? "Creating account…" : "Create account"}</Text></Pressable></View>}
    <Pressable accessibilityRole="button" accessibilityLabel="Back to account" disabled={busy} onPress={() => router.replace("/(tabs)/account")}><Text style={s.link}>{done ? "Continue to sign in" : "Already registered? Sign in"}</Text></Pressable></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: "#f6f8f1" }, content: { padding: 24, gap: 18, width: "100%", maxWidth: 560, alignSelf: "center" }, brand: { fontSize: 22, fontWeight: "800", color: "#17563d" }, title: { fontSize: 30, fontWeight: "700", color: "#183c31" }, copy: { color: "#627267", lineHeight: 22 }, form: { gap: 10 }, input: { backgroundColor: "white", borderWidth: 1, borderColor: "#d4dfd1", borderRadius: 12, padding: 14, marginBottom: 8 }, button: { backgroundColor: "#176447", borderRadius: 12, padding: 16, alignItems: "center" }, buttonText: { color: "white", fontWeight: "700" }, link: { color: "#176447", paddingVertical: 14, fontWeight: "700" }, error: { color: "#a1382c", padding: 14, backgroundColor: "#fff0e9", borderRadius: 12 } });
