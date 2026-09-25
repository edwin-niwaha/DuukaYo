import { useFeedback } from "../src/lib/feedback";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { api, getSession, verifySession } from "../src/lib/api";
import { money, type Membership } from "../src/lib/types";
import { definiteRejection } from "../src/lib/order-attempt";
type Shift = {
  id: number;
  cashier: number;
  closed: boolean;
  register_name: string;
  expected_cash: number;
};
type Attempt = { path: string; body: Record<string, unknown> };
function ActionButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}
export default function RegisterScreen() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<Membership[]>([]),
    [selected, setSelected] = useState(0);
  const [registers, setRegisters] = useState<{ id: number; name: string }[]>(
      [],
    ),
    [shifts, setShifts] = useState<Shift[]>([]);
  const [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [name, setName] = useState("");
  const [error, setError] = useFeedback("error"),
    [notice, setNotice] = useFeedback("info"),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Attempt | null>(null);
  const saving = useRef(false),
    membership = memberships[selected];
  const userId = getSession()?.profile.id;
  const base = membership ? `businesses/${membership.business.id}/` : "";
  const key = `register-command-${userId}-${membership?.business.id}-${membership?.branch}`;
  const load = useCallback(async () => {
    if (!base) return;
    const [r, s, saved] = await Promise.all([
      api<typeof registers>(base + "registers/"),
      api<Shift[]>(base + "shifts/"),
      SecureStore.getItemAsync(key),
    ]);
    setRegisters(r);
    setShifts(s);
    setPending(saved ? JSON.parse(saved) : null);
  }, [base, key]);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void verifySession()
        .then(() => {
          if (live) setMemberships(getSession()?.profile.memberships || []);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
      return () => {
        live = false;
      };
    }, [setError]),
  );
  useFocusEffect(
    useCallback(() => {
      void load().catch((e) => setError(e.message));
    }, [load, setError]),
  );
  async function command(
    path: string,
    body: Record<string, unknown>,
    retry = false,
  ) {
    if (saving.current || !membership) return;
    if (pending && !retry) {
      setError("Retry the pending operation first.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const attempt =
      retry && pending
        ? pending
        : { path, body: { ...body, client_id: Crypto.randomUUID() } };
    try {
      await SecureStore.setItemAsync(key, JSON.stringify(attempt));
      setPending(attempt);
      await api(attempt.path, attempt.body);
      await SecureStore.deleteItemAsync(key);
      setPending(null);
      setNotice("Operation recorded.");
    } catch (e) {
      if (
        definiteRejection(e) &&
        ![401, 403, 404].includes((e as { status: number }).status)
      ) {
        await SecureStore.deleteItemAsync(key);
        setPending(null);
      }
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
    try {
      await load();
    } catch {
      setError(
        "Unable to refresh the drawer. Retry refresh before the next operation.",
      );
    }
  }
  const shift = shifts.find((s) => !s.closed && s.cashier === userId);
  const validAmount =
    /^\d+$/.test(amount) && Number.isSafeInteger(Number(amount));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {
          <ActionButton
            title={"Back"}
            onPress={() => router.back()}
            disabled={busy || false}
          />
        }
        <Text style={styles.title}>Register & cash drawer</Text>
        {memberships.map((m, i) => (
          <Pressable
            key={m.business.id}
            disabled={busy || !!pending}
            onPress={() => setSelected(i)}
          >
            <Text style={styles.shop}>
              {selected === i ? "● " : "○ "}
              {m.business.name}
            </Text>
          </Pressable>
        ))}
        {!memberships.length && (
          <Text>Sign in to a business account to manage a register.</Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        {!!notice && <Text style={styles.shop}>{notice}</Text>}
        {busy && <ActivityIndicator />}
        {pending && (
          <ActionButton
            title={"Retry pending operation"}
            onPress={() => void command(pending.path, pending.body, true)}
            disabled={busy || false}
          />
        )}
        {membership && (
          <View style={styles.card}>
            <Text style={styles.heading}>
              {shift ? shift.register_name : "Open your shift"}
            </Text>
            {shift && (
              <Text>
                Expected cash:{" "}
                {money(shift.expected_cash, membership.business.currency)}
              </Text>
            )}
            <Text style={styles.label}>
              {shift ? "Counted cash / movement amount" : "Opening cash"} (
              {membership.business.currency})
            </Text>
            <TextInput
              accessibilityLabel="Cash amount"
              style={styles.input}
              keyboardType="number-pad"
              value={amount}
              onChangeText={setAmount}
              editable={!busy && !pending}
            />
            <Text style={styles.label}>Reason or count discrepancy</Text>
            <TextInput
              accessibilityLabel="Cash operation reason"
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              maxLength={250}
              editable={!busy && !pending}
            />
            {shift ? (
              <>
                {
                  <ActionButton
                    title={"Close & balance shift"}
                    onPress={() =>
                      void command(base + "shifts/", {
                        action: "close",
                        shift: shift.id,
                        amount: Number(amount),
                        reason,
                      })
                    }
                    disabled={busy || !validAmount || !!pending}
                  />
                }
                {membership.role !== "cashier" && (
                  <>
                    {
                      <ActionButton
                        title={"Record cash in"}
                        onPress={() =>
                          void command(base + "shifts/", {
                            action: "cash_in",
                            shift: shift.id,
                            amount: Number(amount),
                            reason,
                          })
                        }
                        disabled={busy || !validAmount || !!pending}
                      />
                    }
                    {
                      <ActionButton
                        title={"Record cash out"}
                        onPress={() =>
                          void command(base + "shifts/", {
                            action: "cash_out",
                            shift: shift.id,
                            amount: Number(amount),
                            reason,
                          })
                        }
                        disabled={busy || !validAmount || !!pending}
                      />
                    }
                  </>
                )}
              </>
            ) : (
              registers.map((r) => (
                <View key={r.id}>
                  {
                    <ActionButton
                      title={`Open ${r.name}`}
                      onPress={() =>
                        void command(base + "shifts/", {
                          action: "open",
                          register: r.id,
                          amount: Number(amount),
                        })
                      }
                      disabled={busy || !validAmount || !!pending}
                    />
                  }
                </View>
              ))
            )}
            {!shift && membership.role !== "cashier" && (
              <>
                <Text style={styles.label}>New register name</Text>
                <TextInput
                  style={styles.input}
                  accessibilityLabel="Register name"
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                />
                {
                  <ActionButton
                    title={"Add register"}
                    onPress={() => void command(base + "registers/", { name })}
                    disabled={busy || !name.trim() || !!pending}
                  />
                }
              </>
            )}
          </View>
        )}
        {
          <ActionButton
            title={"Refresh drawer"}
            onPress={() => void load().catch((e) => setError(e.message))}
            disabled={busy || false}
          />
        }
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6ef" },
  content: { padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: "800", color: "#203d2c" },
  heading: { fontSize: 21, fontWeight: "700" },
  shop: { color: "#24543b", fontSize: 17 },
  label: { fontSize: 14, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#c4d0c0",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "white",
  },
  card: { backgroundColor: "white", padding: 20, borderRadius: 20, gap: 10 },
  button: {
    backgroundColor: "#24543b",
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  buttonText: { color: "white", fontWeight: "700", textAlign: "center" },
  error: { color: "#a32929" },
});
