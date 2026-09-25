import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { subscribeToasts, type Toast } from "../lib/feedback";

function ToastCard({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(toast.message);
    // Errors persist so assistive technology users have time to review them.
    if (toast.tone === "error") return;
    const timer = setTimeout(() => dismiss(toast.id), 8000);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);
  const color = toast.tone === "error" ? "#b74433" : toast.tone === "success" ? "#21725d" : "#35618a";
  return <View style={[s.card, { borderLeftColor: color }]} accessibilityLiveRegion={toast.tone === "error" ? "assertive" : "polite"}>
    <Text style={[s.symbol, { color }]} accessible={false}>{toast.tone === "error" ? "!" : toast.tone === "success" ? "✓" : "i"}</Text>
    <View style={s.body}><Text style={s.title}>{toast.tone === "error" ? "Please review" : toast.tone === "success" ? "All done" : "Good to know"}</Text><Text style={s.message}>{toast.message}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => dismiss(toast.id)} style={s.close}><Text style={s.closeText}>×</Text></Pressable>
  </View>;
}
export default function Toasts() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(toast => setItems(old => [...old.slice(-2), toast])), []);
  return <View pointerEvents="box-none" style={[s.viewport, { top: insets.top + 12 }]}>{items.map(toast => <ToastCard key={toast.id} toast={toast} dismiss={id => setItems(old => old.filter(item => item.id !== id))} />)}</View>;
}
const s = StyleSheet.create({
  viewport: { position: "absolute", left: 16, right: 16, zIndex: 10000, gap: 10, maxWidth: 520, alignSelf: "center" },
  card: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#fffdf8", borderWidth: 1, borderColor: "#e6e5dd", borderLeftWidth: 4, borderRadius: 18, padding: 14, elevation: 12, shadowColor: "#142b25", shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 5 } },
  symbol: { fontWeight: "800", fontSize: 22, width: 30, paddingTop: 2 },
  body: { flex: 1, gap: 4 }, title: { color: "#183c31", fontWeight: "800", fontSize: 15 },
  message: { color: "#46554f", fontSize: 14, lineHeight: 21 },
  close: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", marginRight: -8, marginTop: -8 }, closeText: { color: "#58675f", fontSize: 26 },
});
