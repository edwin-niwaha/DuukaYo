import { useFeedback } from "../../lib/feedback";
import Icon, { type IconName } from "../../components/Icon";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api, ApiError, getSession, publicApi, restoreSession, signIn, signOut, subscribeSession, verifySession } from "../../lib/api";
import { googleConfigured, signInWithGoogle } from "../../lib/google";
import type { Session } from "../../lib/types";
import { useCustomer } from "../storefront/CustomerProvider";

import { OrdersTab } from "../storefront/CustomerTabs";

const version = Constants.expoConfig?.version || "0.1.0";
const emailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const messageOf = (e: unknown) => e instanceof Error ? e.message : "Something went wrong. Please try again.";

export function Action({ title, onPress, busy = false, disabled = false, secondary = false, danger = false }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: busy || disabled, busy }} disabled={busy || disabled} onPress={onPress}
    style={({ pressed }) => [s.action, secondary && s.secondary, danger && s.danger, (busy || disabled || pressed) && { opacity: 0.55 }]}>
    {busy && <ActivityIndicator color={secondary ? "#24543b" : "white"} />}<Text style={[s.actionText, secondary && { color: "#24543b" }, danger && { color: "#913f2e" }]}>{title}</Text>
  </Pressable>;
}
function Field({ label, secret = false, ...props }: TextInputProps & { label: string; secret?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <View style={s.field}><Text style={s.label}>{label}</Text><View style={s.inputRow}>
    <TextInput {...props} accessibilityLabel={label} style={[s.input, props.editable === false && s.readOnly]} secureTextEntry={secret && !visible} autoCapitalize={props.autoCapitalize || (secret ? "none" : "sentences")} autoCorrect={secret ? false : props.autoCorrect} />
    {secret && <Pressable accessibilityRole="button" accessibilityLabel={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} style={s.reveal} onPress={() => setVisible(!visible)}><Text style={s.link}>{visible ? "Hide" : "Show"}</Text></Pressable>}
  </View></View>;
}
function Feedback({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return <Text accessibilityRole={error ? "alert" : undefined} accessibilityLiveRegion="polite" style={[s.feedback, error ? s.error : s.success]}>{error || message}</Text>;
}
function Section({ title, subtitle, icon, expanded, onPress, children }: { title: string; subtitle: string; icon: IconName; expanded: boolean; onPress: () => void; children: ReactNode }) {
  return <View style={[s.card, expanded && s.expanded]}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded }} onPress={onPress} style={s.sectionHeader}>
      <View style={s.sectionIcon}><Icon name={icon} size={24} /></View><View style={s.flex}><Text style={s.sectionTitle}>{title}</Text><Text style={s.muted}>{subtitle}</Text></View><Icon name={expanded ? "up" : "down"} />
    </Pressable>{expanded && <View style={s.sectionBody}>{children}</View>}
  </View>;
}
function Shell({ children }: { children: ReactNode }) {
  return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>{children}</ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

export function RecoveryForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail), [code, setCode] = useState("");
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useFeedback("error"), [message, setMessage] = useFeedback("success");
  const [enterCode, setEnterCode] = useState(false), [complete, setComplete] = useState(false);
  const working = useRef(false);
  async function submit(reset: boolean) {
    if (working.current) return;
    setError(""); setMessage("");
    if (!reset && !emailValid(email)) { setError("Enter a valid email address."); return; }
    if (reset && (!code.trim() || password.length < 10 || password !== confirm)) { setError("Enter your recovery code and matching passwords of at least 10 characters."); return; }
    working.current = true; setBusy(true);
    try {
      const response = await publicApi<{ detail: string }>(reset ? "auth/password/reset/" : "auth/password/recovery/", reset ? { code: code.trim(), new_password: password, confirm_password: confirm } : { email: email.trim() });
      setMessage(response.detail);
      if (reset) { setPassword(""); setConfirm(""); setCode(""); setComplete(true); }
      else setEnterCode(true);
    } catch (e) { setError(messageOf(e)); }
    finally { working.current = false; setBusy(false); }
  }
  if (complete) return <View style={s.form}><Feedback message={message} /><Text style={s.muted}>Use your new password the next time you sign in.</Text></View>;
  return <View style={s.form}>
    <Text style={s.sectionTitle}>Password recovery</Text>
    <Text style={s.muted}>We’ll email a single-use code to your account’s email address.</Text>
    <Field label="Recovery email" value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={254} />
    <Action title={enterCode ? "Send another code" : "Send recovery code"} busy={busy} secondary={enterCode} onPress={() => void submit(false)} />
    {!enterCode && <Action title="I already have a code" secondary onPress={() => setEnterCode(true)} />}
    {enterCode && <>
      <Text style={s.muted}>Paste the full code from the email. It expires after one hour.</Text>
      <Field label="Recovery code" value={code} onChangeText={setCode} editable={!busy} autoCapitalize="none" autoCorrect={false} maxLength={300} />
      <Field label="New recovery password" value={password} onChangeText={setPassword} editable={!busy} secret maxLength={128} autoComplete="new-password" />
      <Field label="Confirm recovery password" value={confirm} onChangeText={setConfirm} editable={!busy} secret maxLength={128} autoComplete="new-password" />
      <Action title="Reset password" busy={busy} onPress={() => void submit(true)} />
    </>}
    <Feedback error={error} message={message} />
  </View>;
}
export function RecoveryScreen() {
  const router = useRouter();
  return <Shell><Action title="Back to Account" secondary onPress={() => router.replace("/(tabs)/account")} /><RecoveryForm initialEmail={getSession()?.profile.email || ""} /></Shell>;
}

export default function AccountScreen() {
  const router = useRouter();
  const { carts, tokens } = useCustomer();
  const [session, setSession] = useState<Session | null>(getSession());
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useFeedback("error"), [message, setMessage] = useFeedback("success");
  const [section, setSection] = useState<string | null>(null);
  const [first, setFirst] = useState(""), [last, setLast] = useState("");
  const [current, setCurrent] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [username, setUsername] = useState(""), [loginPassword, setLoginPassword] = useState("");
  const [permission, setPermission] = useState<Notifications.NotificationPermissionsStatus | null>(null);
  const [permissionError, setPermissionError] = useFeedback("error");
  const working = useRef(false);
  const profile = session?.profile;
  const signedIn = !!session;
  useEffect(() => subscribeSession(setSession), []);
  useFocusEffect(useCallback(() => {
    let live = true;
    void restoreSession().then(async saved => {
      if (live) { setSession(saved); setReady(true); }
      if (saved) await verifySession();
    }).catch(async e => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) await signOut().catch(() => {});
      if (live) { setError(messageOf(e)); setReady(true); }
    });
    return () => { live = false; };
  }, [setError]));
  useEffect(() => {
    setFirst(profile?.first_name || ""); setLast(profile?.last_name || "");
  }, [profile?.id, profile?.first_name, profile?.last_name]);
  useEffect(() => { setCurrent(""); setPassword(""); setConfirm(""); setLoginPassword(""); }, [profile?.id]);
  const refreshPermission = useCallback(async () => {
    try { setPermission(await Notifications.getPermissionsAsync()); setPermissionError(""); }
    catch { setPermissionError("Permission status unavailable. Open device settings to check."); }
  }, [setPermissionError]);
  useEffect(() => {
    void refreshPermission();
    const listener = AppState.addEventListener("change", state => { if (state === "active") void refreshPermission(); });
    return () => listener.remove();
  }, [refreshPermission]);
  async function work(task: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(""); setMessage("");
    try { await task(); } catch (e) { setError(messageOf(e)); }
    finally { working.current = false; setBusy(false); }
  }
  function toggle(value: string) { setSection(old => old === value ? null : value); setError(""); setMessage(""); }
  const dirty = first.trim() !== (profile?.first_name || "") || last.trim() !== (profile?.last_name || "");
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.username || "Welcome to DuukaYo";
  const permissionAllowed = permission?.granted || permission?.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  async function notificationAction() {
    if (!permission || permissionAllowed || !permission.canAskAgain) { await Linking.openSettings(); return; }
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("orders", { name: "Shop orders", importance: Notifications.AndroidImportance.HIGH });
    await Notifications.requestPermissionsAsync(); await refreshPermission();
  }
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim();
  return <Shell>
    <View style={s.heading}><Text style={s.eyebrow}>YOUR SPACE</Text><Text style={s.title}>Accounts</Text></View>
    <View style={s.identity}><View style={s.avatar}><Text style={s.avatarText}>{signedIn ? (profile?.first_name?.[0] || profile?.username[0] || "D").toUpperCase() : "◈"}</Text></View>
      <View style={s.flex}><Text style={s.name}>{displayName}</Text><Text style={s.identityDetail}>{profile?.email || (signedIn ? "No recovery email on file" : "Shop freely. Sign in when you need to.")}</Text><Text style={s.pill}>{signedIn ? "Signed in" : "Guest"}</Text></View>
    </View>
    <View style={s.shortcuts}>
      <Pressable accessibilityRole="button" accessibilityLabel="Saved carts" style={s.shortcut} onPress={() => router.navigate("/(tabs)/cart")}><Text style={s.number}>{carts.length}</Text><Text style={s.muted}>Carts</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Recent orders" style={s.shortcut} onPress={() => router.navigate("/(tabs)/orders")}><Text style={s.number}>{tokens.length}</Text><Text style={s.muted}>Orders</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Business tools" style={s.shortcut} onPress={() => router.push("/pos")}><Icon name="external" size={26} /><Text style={s.muted}>Business</Text></Pressable>
    </View>
    {!ready && <ActivityIndicator color="#24543b" />}
    <Feedback error={error} message={message} />
    {signedIn && <OrdersTab embedded />}
    <Section title="Profile" subtitle={signedIn ? "Your name and account details" : "Sign in to manage your profile"} icon="profile" expanded={section === "profile"} onPress={() => toggle("profile")}>
      {signedIn ? <>
        <Field label="First name" value={first} onChangeText={setFirst} editable={!busy} maxLength={150} autoComplete="given-name" />
        <Field label="Last name" value={last} onChangeText={setLast} editable={!busy} maxLength={150} autoComplete="family-name" />
        <Field label="Username" value={profile?.username || ""} editable={false} />
        <Field label="Account email" value={profile?.email || "Not provided"} editable={false} />
        <Text style={s.muted}>Your sign-in name and recovery email are read-only. Contact your account administrator if they need correcting.</Text>
        <Action title="Save changes" busy={busy} disabled={!dirty} onPress={() => void work(async () => {
          await api("auth/profile/", { first_name: first.trim(), last_name: last.trim() });
          await verifySession(); setMessage("Profile saved.");
        })} />
        {dirty && <Action title="Discard changes" secondary disabled={busy} onPress={() => { setFirst(profile?.first_name || ""); setLast(profile?.last_name || ""); }} />}
      </> : <>
        <Field label="Sign-in username" value={username} onChangeText={setUsername} editable={!busy} autoCapitalize="none" autoComplete="username" maxLength={150} />
        <Field label="Sign-in password" value={loginPassword} onChangeText={setLoginPassword} editable={!busy} secret autoComplete="current-password" maxLength={128} />
        <Action title="Sign in" busy={busy} disabled={!username.trim() || !loginPassword} onPress={() => void work(async () => { await signIn(username.trim(), loginPassword); setLoginPassword(""); setMessage("Welcome back."); })} />
        {googleConfigured && <Action title="Continue with Google" secondary busy={busy} onPress={() => void work(async () => { await signInWithGoogle(); })} />}
        <Action title="Create account" secondary disabled={busy} onPress={() => router.push("../signup")} />
        <Action title="Forgot password?" secondary disabled={busy} onPress={() => router.push("/recover")} />
      </>}
      <Feedback error={error} message={message} />
    </Section>
    <Section title="Account & security" subtitle="Password and recovery" icon="lock" expanded={section === "security"} onPress={() => toggle("security")}>
      {signedIn && profile?.has_password !== false ? <>
        <Text style={s.sectionTitle}>Change password</Text><Text style={s.muted}>Use at least 10 characters. Changing your password ends online sessions on your devices.</Text>
        <Field label="Current password" secret value={current} onChangeText={setCurrent} editable={!busy} autoComplete="current-password" maxLength={128} />
        <Field label="New password" secret value={password} onChangeText={setPassword} editable={!busy} autoComplete="new-password" maxLength={128} />
        <Field label="Confirm new password" secret value={confirm} onChangeText={setConfirm} editable={!busy} autoComplete="new-password" maxLength={128} />
        <Action title="Change password" busy={busy} disabled={!current || !password || !confirm} onPress={() => void work(async () => {
          if (password.length < 10) throw new Error("Use at least 10 characters.");
          if (password !== confirm) throw new Error("New passwords do not match.");
          if (password === current) throw new Error("Choose a different password.");
          await api("auth/password/change/", { current_password: current, new_password: password, confirm_password: confirm });
          await signOut(); setSection("profile"); setMessage("Password changed. Sign in with your new password.");
        })} />
      </> : <Text style={s.muted}>{signedIn ? "You use Google sign-in. Recover your account by email to set a DuukaYo password." : "Sign in to change your password, or recover it by email."}</Text>}
      <Action title="Password recovery" secondary disabled={busy} onPress={() => router.push("/recover")} />
      <Feedback error={error} message={message} />
    </Section>
    <Section title="App permissions" subtitle="You control access" icon="settings" expanded={section === "permissions"} onPress={() => toggle("permissions")}>
      <View style={s.permissionRow}><View style={s.flex}><Text style={s.sectionTitle}>Notifications</Text><Text style={s.muted}>Order alerts on this device</Text></View><Text style={s.status}>{permission ? permissionAllowed ? "Allowed" : "Not allowed" : "Unknown"}</Text></View>
      <Feedback error={permissionError} />
      <Action title={permission && !permissionAllowed && permission.canAskAgain ? "Enable notifications" : "Open notification settings"} secondary busy={busy} onPress={() => void work(notificationAction)} />
      <Text style={s.muted}>Shop staff can connect order alerts from Business tools. Guest orders can always be followed in Orders.</Text>
      <View style={s.note}><Text style={s.label}>No unnecessary access</Text><Text style={s.muted}>Shopping does not require your contacts, camera, photo library, or location.</Text></View>
      <Action title="Open device settings" secondary busy={busy} onPress={() => void work(async () => { await Linking.openSettings(); })} />
      <Feedback error={error} message={message} />
    </Section>
    <Section title="App & support" subtitle="Help, privacy and app details" icon="help" expanded={section === "support"} onPress={() => toggle("support")}>
      <Text style={s.sectionTitle}>DuukaYo · {version}</Text>
      <Text style={s.label}>Orders & payments</Text><Text style={s.muted}>Open an order for its status and the shop’s contact details. Your shop confirms availability and arranges payment.</Text>
      {signedIn && <Action title="Register & cash drawer" secondary onPress={() => router.push("/register")} />}
      {signedIn && <Action title="Manage shops and products" secondary onPress={() => router.push("/manage")} />}
      <Action title="Open my orders" secondary onPress={() => router.navigate("/(tabs)/orders")} />
      <Text style={s.label}>Your data on this device</Text><Text style={s.muted}>Saved carts and private order links stay on this device. Logging out removes your account session; pending offline sales stay saved for the same cashier.</Text>
      <Text style={s.label}>Need help signing in?</Text><Text style={s.muted}>Use Password recovery, or ask your business owner to check your account email and membership.</Text>
      {supportEmail && emailValid(supportEmail) && <Action title="Contact app support" secondary onPress={() => void work(async () => { await Linking.openURL(`mailto:${supportEmail}?subject=${encodeURIComponent("DuukaYo support · " + version)}`); })} />}
      <Action title="Share app details" secondary busy={busy} onPress={() => void work(async () => { await Share.share({ message: `DuukaYo ${version}\n${Platform.OS} ${Platform.Version}\n${Device.modelName || "Mobile device"}\nIssue: ` }); })} />
      <Text style={s.muted}>Only the app version and device model are included. Add a description of your issue before sharing.</Text>
      <Feedback error={error} message={message} />
    </Section>
    <View style={s.sessionCard}><Text style={s.eyebrow}>CURRENT SESSION</Text><Text style={s.sectionTitle}>{signedIn ? "This device" : "Browsing as a guest"}</Text>
      <Text style={s.muted}>{Device.modelName || "Mobile device"} · {Platform.OS}</Text>
      {signedIn && <><Text style={s.muted}>{profile?.username}{session?.verifiedAt ? " · Last verified " + new Date(session.verifiedAt).toLocaleString() : ""}</Text>
        <Text style={s.muted}>Pending offline sales remain saved after logout.</Text>
        <Action title="Log out" danger busy={busy} onPress={() => Alert.alert("Log out of this device?", `${dirty ? "Unsaved profile edits will be discarded. " : ""}Pending offline sales stay saved. You can continue shopping as a guest.`, [
          { text: "Stay signed in", style: "cancel" }, { text: "Log out", style: "destructive", onPress: () => void work(async () => { await signOut(); setSection(null); setMessage("You’re logged out of this device."); }) }
        ])} />
      </>}
      {!signedIn && <Action title="Manage your account" secondary disabled={!ready} onPress={() => setSection("profile")} />}
    </View>
  </Shell>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f8f2" }, flex: { flex: 1, minWidth: 0 },
  content: { padding: 20, paddingBottom: 125, gap: 16, width: "100%", maxWidth: 720, alignSelf: "center" },
  heading: { gap: 5, paddingTop: 10 }, eyebrow: { fontSize: 10, letterSpacing: 1.8, fontWeight: "700", color: "#61764f" },
  title: { fontSize: 34, fontWeight: "700", color: "#234c34", letterSpacing: -1 },
  identity: { flexDirection: "row", alignItems: "center", gap: 16, padding: 22, borderRadius: 26, backgroundColor: "#24543b" },
  avatar: { width: 58, height: 58, borderRadius: 21, backgroundColor: "#e8eed6", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 28, fontWeight: "700", color: "#24543b" }, name: { fontSize: 22, fontWeight: "700", color: "#fff" },
  identityDetail: { fontSize: 12, lineHeight: 19, color: "#dae5d1", marginTop: 5 },
  pill: { fontSize: 10, color: "#f1f5db", backgroundColor: "#ffffff16", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, marginTop: 10 },
  shortcuts: { flexDirection: "row", gap: 10 }, shortcut: { flex: 1, alignItems: "center", padding: 14, backgroundColor: "#fff", borderRadius: 18, gap: 3 }, number: { fontSize: 24, color: "#315739", fontWeight: "700" },
  card: { backgroundColor: "white", borderWidth: 1, borderColor: "#e1e7d8", borderRadius: 20, overflow: "hidden" }, expanded: { borderColor: "#98ad7d" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, minHeight: 82 },
  sectionIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: "#edf2e5", alignItems: "center", justifyContent: "center" }, iconText: { fontSize: 24, color: "#315739" },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#264e37" }, muted: { fontSize: 12, lineHeight: 20, color: "#65745e" }, chevron: { fontSize: 24, color: "#75856a" },
  sectionBody: { padding: 18, gap: 16, borderTopWidth: 1, borderColor: "#edf0e5" }, form: { gap: 16 }, field: { gap: 7 }, label: { fontSize: 12, fontWeight: "700", color: "#3c5634" },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#dce4d1", backgroundColor: "#fafbf6", borderRadius: 13, overflow: "hidden" },
  input: { flex: 1, minWidth: 0, fontSize: 16, minHeight: 50, paddingHorizontal: 13, paddingVertical: 12, color: "#244b35" }, readOnly: { color: "#718067", backgroundColor: "#f0f3e9" },
  reveal: { minWidth: 54, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 }, link: { color: "#315739", fontSize: 12, fontWeight: "700" },
  action: { backgroundColor: "#28543a", minHeight: 50, borderRadius: 15, padding: 14, flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "center" },
  actionText: { fontSize: 13, fontWeight: "700", color: "white", textAlign: "center" }, secondary: { backgroundColor: "#edf2e3" }, danger: { backgroundColor: "#fbedE6" },
  feedback: { padding: 15, borderRadius: 13, fontSize: 13, lineHeight: 20 }, error: { color: "#913f2e", backgroundColor: "#fcece5" }, success: { color: "#28543a", backgroundColor: "#eaf2df" },
  permissionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }, status: { fontSize: 11, fontWeight: "700", color: "#315739", padding: 8, borderRadius: 10, backgroundColor: "#edf2e5" },
  note: { padding: 15, borderRadius: 14, backgroundColor: "#f5f7ef", gap: 5 }, sessionCard: { padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#dedfce", gap: 12, backgroundColor: "#fffdf7", marginTop: 4 },
});
