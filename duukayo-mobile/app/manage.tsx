import { useFeedback } from "../src/lib/feedback";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import {
  ApiError,
  api,
  getSession,
  uploadImage,
  verifySession,
} from "../src/lib/api";
import type { Business, Membership, Product } from "../src/lib/types";
import Icon, { type IconName } from "../src/components/Icon";
import {
  emptyProduct,
  productDraft,
  familyOptions,
  generateVariants,
  catalogPayload,
  type Draft,
  type Option,
} from "../src/lib/catalog-editor";
import { productName } from "../src/lib/variants";
type Shop = Business & {
  description: string;
  website: string;
  logo: string;
  contact: string;
  published: boolean;
  delivery_enabled: boolean;
  delivery_fee: number;
  safety_buffer: number;
  storefront_branch: number | null;
  branches: { id: number; name: string }[];
};
type StockAttempt = {
  client_id: string;
  product: number;
  delta: number;
  kind: string;
  reason: string;
};
function Button({
  title,
  onPress,
  disabled = false,
  icon,
}: {
  icon?: IconName;
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, disabled && { opacity: 0.5 }]}
    >
      {icon && <Icon name={icon} color="#fff" />}
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChange,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? "number-pad" : "default"}
        autoCapitalize="none"
        style={s.input}
      />
    </View>
  );
}
function Toggle({
  title,
  value,
  onChange,
}: {
  title: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={s.row}>
      <Text>{title}</Text>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
      />
    </View>
  );
}
function ImageEditor({
  businessId,
  value,
  onChange,
  onPending,
}: {
  businessId: number;
  value: string;
  onChange: (url: string) => void;
  onPending: (pending: boolean) => void;
}) {
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useFeedback("error");
  async function choose() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });
      if (!result.canceled) {
        const item = result.assets[0];
        if ((item.fileSize || 0) > 8 * 1024 * 1024)
          throw new Error("Choose an image under 8 MB.");
        setAsset(item);
        onPending(true);
        setError("");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function upload() {
    if (!asset) return;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      onChange(await uploadImage(businessId, asset, setProgress));
      setAsset(null);
      onPending(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.card}>
      {!!(asset?.uri || value) && (
        <Image
          source={{ uri: asset?.uri || value }}
          style={{ height: 170, width: "100%" }}
          resizeMode="contain"
          accessibilityLabel="Image preview"
        />
      )}
      <Field label="Image URL" value={value} onChange={onChange} />
      <Button
        title="Choose photo"
        disabled={busy}
        onPress={() => void choose()}
      />
      {asset && (
        <Button
          title={
            busy
              ? `Uploading ${progress}%`
              : error
                ? "Retry upload"
                : "Upload selected photo"
          }
          disabled={busy}
          onPress={() => void upload()}
        />
      )}
      {busy && <ActivityIndicator />}
      {(!!value || !!asset) && (
        <Button
          title="Remove image"
          disabled={busy}
          onPress={() => {
            onChange("");
            setAsset(null);
            onPending(false);
          }}
        />
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <Text>JPEG, PNG or WebP · up to 8 MB. Upload before saving.</Text>
    </View>
  );
}
export default function Manage() {
  const router = useRouter();
  const scroll = useRef<ScrollView>(null);
  const loadGeneration = useRef(0);
  const [logoPending, setLogoPending] = useState(false),
    [productPending, setProductPending] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>(
      getSession()?.profile.memberships || [],
    ),
    [selected, setSelected] = useState<Membership | null>(null);
  const [shop, setShop] = useState<Shop | null>(null),
    [products, setProducts] = useState<Product[]>([]),
    [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [productRows, setProductRows] = useState<Draft[]>([emptyProduct()]);
  const [rowIndex, setRowIndex] = useState(0);
  const [options, setOptions] = useState<Option[]>([
    { name: "Size", values: "" },
  ]);
  const [search, setSearch] = useState("");
  const draft = productRows[rowIndex];
  const editing = draft.id || null;
  const dirty = useRef(false);
  const setDraft = (value: Draft) => {
    dirty.current = true;
    setProductRows((old) =>
      old.map((row, i) => (i === rowIndex ? value : row)),
    );
  };
  function resetProduct() {
    dirty.current = false;
    setProductRows([emptyProduct()]);
    setRowIndex(0);
    setOptions([{ name: "Size", values: "" }]);
  }
  const working = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useFeedback("info");
  const [name, setName] = useState(""),
    [slug, setSlug] = useState(""),
    [branch, setBranch] = useState(""),
    [category, setCategory] = useState(""),
    [delta, setDelta] = useState(""),
    [reason, setReason] = useState("");
  const [pendingStock, setPendingStock] = useState<StockAttempt | null>(null);
  const stockKey = selected
    ? `stock-attempt-${getSession()!.profile.id}-${selected.business.id}-${selected.branch}`
    : "";
  const base = selected ? `businesses/${selected.business.id}/` : "";
  const owner = selected?.role === "owner",
    manager = owner || selected?.role === "manager";
  const refresh = useCallback(async () => {
    if (!selected) return;
    const generation = ++loadGeneration.current;
    const path = `businesses/${selected.business.id}/`;
    const [b, p, c] = await Promise.all([
      api<Shop>(path),
      api<Product[]>(path + "products/"),
      api<{ id: number; name: string }[]>(path + "categories/"),
    ]);
    if (generation !== loadGeneration.current) return;
    setShop(b);
    setProducts(p);
    setCategories(c);
    const saved = await SecureStore.getItemAsync(
      `stock-attempt-${getSession()!.profile.id}-${selected.business.id}-${selected.branch}`,
    );
    if (generation === loadGeneration.current)
      setPendingStock(saved ? JSON.parse(saved) : null);
  }, [selected]);
  useFocusEffect(
    useCallback(() => {
      void refresh().catch((e) => setMessage(e.message));
    }, [refresh, setMessage]),
  );
  async function run(fn: () => Promise<unknown>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await refresh();
      setMessage("Saved successfully.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function sendStock(payload: StockAttempt) {
    setPendingStock(payload);
    await SecureStore.setItemAsync(stockKey, JSON.stringify(payload));
    try {
      await api(base + "stock/", payload);
      await SecureStore.deleteItemAsync(stockKey);
      setPendingStock(null);
      setDelta("");
      setReason("");
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 404)) {
        await SecureStore.deleteItemAsync(stockKey);
        setPendingStock(null);
      }
      throw e;
    }
  }
  function edit(p: Product) {
    const open = () => {
      dirty.current = false;
      scroll.current?.scrollTo({ y: 0, animated: true });
      const family = p.variant_group
        ? products.filter(
            (x) =>
              x.variant_group?.toLowerCase() === p.variant_group?.toLowerCase(),
          )
        : [p];
      const rows = family.map(productDraft);
      setProductRows(rows);
      setRowIndex(
        Math.max(
          0,
          family.findIndex((x) => x.id === p.id),
        ),
      );
      setOptions(familyOptions(rows));
      setMessage("");
    };
    if (dirty.current)
      Alert.alert(
        "Discard product changes?",
        "Your unsaved product edits will be lost.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: open },
        ],
      );
    else open();
  }
  if (!getSession())
    return (
      <SafeAreaView style={s.screen}>
        <Text>Sign in to manage your business.</Text>
        <Button
          title="Account"
          onPress={() => router.replace("/(tabs)/account")}
        />
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.screen}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <Button
          icon="left"
          title="Back to Account"
          onPress={() => router.back()}
        />
        <Text style={s.title}>Manage your shop</Text>
        {memberships.map((m) => (
          <Button
            key={m.business.id}
            title={`${m.business.name} · ${m.role}`}
            disabled={busy || logoPending || productPending}
            onPress={() => {
              loadGeneration.current++;
              setSelected(m);
              setLogoPending(false);
              setProductPending(false);
              setShop(null);
              resetProduct();
            }}
          />
        ))}
        {busy && <ActivityIndicator />}
        {!!message && (
          <Text accessibilityRole="alert" style={s.notice}>
            {message}
          </Text>
        )}
        {!selected && (
          <View style={s.card}>
            <Text style={s.title}>Open a shop</Text>
            <Field label="Shop name" value={name} onChange={setName} />
            <Field label="Unique shop URL" value={slug} onChange={setSlug} />
            <Button
              title="Create draft shop"
              disabled={busy || !name.trim() || !slug.trim()}
              onPress={() =>
                void run(async () => {
                  const b = await api<Shop>("businesses/", {
                    name: name.trim(),
                    slug: slug.trim(),
                  });
                  const session = await verifySession();
                  setMemberships(session.profile.memberships);
                  setSelected(
                    session.profile.memberships.find(
                      (m) => m.business.id === b.id,
                    ) || null,
                  );
                  setShop(b);
                })
              }
            />
          </View>
        )}
        {owner && shop && (
          <View style={s.card}>
            <Text style={s.title}>Shop details</Text>
            <Text>
              {shop.published ? "Published" : "Draft — hidden from customers"}
            </Text>
            {(
              ["name", "slug", "description", "website", "contact"] as const
            ).map((k) => (
              <Field
                key={k}
                label={k}
                value={shop[k]}
                onChange={(v) => setShop({ ...shop, [k]: v })}
              />
            ))}
            <ImageEditor
              key={`logo-${shop.id}`}
              onPending={setLogoPending}
              businessId={shop.id}
              value={shop.logo}
              onChange={(logo) => setShop({ ...shop, logo })}
            />
            <Text style={s.label}>Fulfilment branch</Text>
            {shop.branches.map((b) => (
              <Button
                key={b.id}
                title={`${shop.storefront_branch === b.id ? "✓ " : ""}${b.name}`}
                onPress={() => setShop({ ...shop, storefront_branch: b.id })}
              />
            ))}
            <Toggle
              title="Delivery available"
              value={shop.delivery_enabled}
              onChange={(v) => setShop({ ...shop, delivery_enabled: v })}
            />
            <Field
              label="Delivery fee"
              value={String(shop.delivery_fee)}
              numeric
              onChange={(v) => setShop({ ...shop, delivery_fee: Number(v) })}
            />
            <Field
              label="Safety stock buffer"
              value={String(shop.safety_buffer)}
              numeric
              onChange={(v) => setShop({ ...shop, safety_buffer: Number(v) })}
            />
            <Toggle
              title="Publish shop"
              value={shop.published}
              onChange={(v) => setShop({ ...shop, published: v })}
            />
            <Button
              title="Save shop"
              disabled={busy || logoPending}
              onPress={() => void run(() => api(base, shop, "PATCH"))}
            />
            <Field
              label="New branch name"
              value={branch}
              onChange={setBranch}
            />
            <Button
              title="Add branch"
              disabled={busy || !branch.trim()}
              onPress={() =>
                void run(async () => {
                  await api(base + "branches/", { name: branch.trim() });
                  setBranch("");
                })
              }
            />
          </View>
        )}
        {manager && pendingStock && (
          <View style={s.card}>
            <Text>
              Unconfirmed stock movement: product {pendingStock.product}, change{" "}
              {pendingStock.delta}. Recover this request before recording
              another.
            </Text>
            <Button
              title="Recover stock movement"
              disabled={busy}
              onPress={() => void run(() => sendStock(pendingStock))}
            />
          </View>
        )}
        {manager && shop && (
          <View style={s.card} pointerEvents={busy ? "none" : "auto"}>
            <Text style={s.title}>Products & variants</Text>
            <Text>
              Each variant has its own SKU, price, image and stock. Save all
              changes together.
            </Text>
            <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
              {productRows.map((row, i) => (
                <Button
                  key={i}
                  title={`Variant ${i + 1}${i === rowIndex ? " (selected)" : ""}`}
                  disabled={busy || productPending}
                  onPress={() => setRowIndex(i)}
                />
              ))}
            </ScrollView>
            <Text style={s.title}>
              {editing ? "Edit product" : "Create product"}
            </Text>
            {(["name", "sku", "barcode", "price", "cost"] as const).map((k) => (
              <Field
                key={k}
                label={k}
                value={draft[k]}
                numeric={k === "price" || k === "cost"}
                onChange={(v) => setDraft({ ...draft, [k]: v })}
              />
            ))}
            <Field
              label="Description"
              value={draft.description}
              onChange={(description) => setDraft({ ...draft, description })}
            />
            {Object.entries(draft.attributes).map(([key, value]) => (
              <Field
                key={key}
                label={key}
                value={value}
                onChange={(v) =>
                  setDraft({
                    ...draft,
                    attributes: { ...draft.attributes, [key]: v },
                  })
                }
              />
            ))}
            <Text style={s.label}>Category</Text>
            <Button
              title={
                draft.category === null ? "✓ Uncategorized" : "Uncategorized"
              }
              onPress={() => setDraft({ ...draft, category: null })}
            />
            {categories.map((c) => (
              <Button
                key={c.id}
                title={`${draft.category === c.id ? "✓ " : ""}${c.name}`}
                onPress={() => setDraft({ ...draft, category: c.id })}
              />
            ))}
            <Field
              label="New category"
              value={category}
              onChange={setCategory}
            />
            <Button
              title="Add category"
              disabled={busy || !category.trim()}
              onPress={() =>
                void run(async () => {
                  const c = await api<{ id: number }>(base + "categories/", {
                    name: category.trim(),
                  });
                  setDraft({ ...draft, category: c.id });
                  setCategory("");
                })
              }
            />
            <ImageEditor
              key={`product-${shop.id}-${editing}-${rowIndex}`}
              onPending={setProductPending}
              businessId={shop.id}
              value={draft.image}
              onChange={(image) => setDraft({ ...draft, image })}
            />
            <Text style={s.title}>{draft.name || "Product preview"}</Text>
            <Text>
              {shop.currency} {draft.price || "—"} · {shop.name}
            </Text>
            <Toggle
              title="Active in POS"
              value={draft.active}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  active: v,
                  published: v && draft.published,
                })
              }
            />
            <Toggle
              title="Published online"
              value={draft.published}
              onChange={(v) =>
                setDraft({ ...draft, published: v, active: v || draft.active })
              }
            />
            <Text style={s.label}>Variant options</Text>
            <Text>
              Separate values with commas, for example Small, Medium, Large.
              Generating adds missing combinations and preserves existing
              variants.
            </Text>
            {options.map((option, i) => (
              <View key={i} style={s.field}>
                <Field
                  label={`Option ${i + 1} name`}
                  value={option.name}
                  onChange={(name) =>
                    setOptions((old) =>
                      old.map((o, j) => (i === j ? { ...o, name } : o)),
                    )
                  }
                />
                <Field
                  label={`Option ${i + 1} values`}
                  value={option.values}
                  onChange={(values) =>
                    setOptions((old) =>
                      old.map((o, j) => (i === j ? { ...o, values } : o)),
                    )
                  }
                />
                {options.length > 1 && (
                  <Button
                    title={`Remove option ${i + 1}`}
                    icon="close"
                    onPress={() =>
                      setOptions((old) => old.filter((_, j) => j !== i))
                    }
                  />
                )}
              </View>
            ))}
            <Button
              title="Add option"
              icon="plus"
              disabled={busy || options.length >= 4}
              onPress={() =>
                setOptions((old) => [...old, { name: "", values: "" }])
              }
            />
            <Button
              title="Generate variants"
              icon="catalog"
              disabled={busy || productPending}
              onPress={() => {
                try {
                  setProductRows(
                    generateVariants(
                      productRows,
                      options,
                      products,
                      Crypto.randomUUID(),
                    ),
                  );
                  dirty.current = true;
                  setRowIndex(0);
                  setMessage("");
                } catch (error) {
                  setMessage((error as Error).message);
                }
              }}
            />
            {!editing && productRows.length > 1 && (
              <Button
                title="Remove unsaved variant"
                icon="trash"
                disabled={busy || productPending}
                onPress={() => {
                  dirty.current = true;
                  setProductRows((old) => old.filter((_, i) => i !== rowIndex));
                  setRowIndex(0);
                }}
              />
            )}
            {!!message && (
              <Text accessibilityLiveRegion="polite" style={s.notice}>
                {message}
              </Text>
            )}
            <Button
              title="Save products"
              icon="save"
              disabled={busy || productPending}
              onPress={() =>
                void run(async () => {
                  await api(base + "products/variant-set/", {
                    products: catalogPayload(productRows),
                  });
                  resetProduct();
                })
              }
            />
            <Button
              title="New product / discard edits"
              icon="plus"
              disabled={busy || productPending}
              onPress={() =>
                Alert.alert(
                  "Start a new product?",
                  "Unsaved product changes will be discarded.",
                  [
                    { text: "Keep editing", style: "cancel" },
                    {
                      text: "Discard",
                      style: "destructive",
                      onPress: resetProduct,
                    },
                  ],
                )
              }
            />
            <Text>
              New variants start without stock. Save first, then edit a variant
              to record its stock movement.
            </Text>
            {editing && (
              <>
                <Text style={s.label}>
                  Adjust stock at your assigned branch
                </Text>
                <Field
                  label="Quantity change (negative to reduce)"
                  value={delta}
                  onChange={setDelta}
                />
                <Field
                  label="Stock reason"
                  value={reason}
                  onChange={setReason}
                />
                <Button
                  title="Record stock movement"
                  disabled={
                    busy ||
                    !!pendingStock ||
                    reason.trim().length < 3 ||
                    !/^-?\d+$/.test(delta)
                  }
                  onPress={() =>
                    void run(async () => {
                      if (pendingStock)
                        throw new Error(
                          "Recover the previous stock movement first.",
                        );
                      await sendStock({
                        client_id: Crypto.randomUUID(),
                        product: editing,
                        delta: Number(delta),
                        kind: "adjustment",
                        reason,
                      });
                    })
                  }
                />
              </>
            )}
            <Text style={s.title}>Catalog</Text>
            <Field
              label="Search products"
              value={search}
              onChange={setSearch}
            />
            {!products.length && (
              <Text>Your catalog is empty. Add your first product above.</Text>
            )}
            {products
              .filter((p) =>
                [productName(p), p.sku, p.barcode]
                  .join(" ")
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((p) => (
                <View key={p.id} style={s.card}>
                  <Text style={s.label}>{productName(p)}</Text>
                  <Text>
                    {p.sku} · {shop.currency} {p.price} ·{" "}
                    {p.quantity - p.reserved} available
                  </Text>
                  <Text>
                    {p.published ? "Published" : "Draft"} ·{" "}
                    {p.active ? "Active" : "Archived"}
                  </Text>
                  <Button
                    icon="edit"
                    title={`Edit ${productName(p)}`}
                    disabled={busy || productPending}
                    onPress={() => edit(p)}
                  />
                </View>
              ))}
          </View>
        )}
        {selected && !manager && (
          <Text>
            Your cashier role can sell and view inventory in POS. Catalog
            changes require a manager.
          </Text>
        )}
        <Button
          icon="checkout"
          title="Open cashier POS"
          onPress={() => router.push("/pos")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f6ee" },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  card: { backgroundColor: "white", borderRadius: 18, padding: 16, gap: 12 },
  field: { gap: 6 },
  label: { fontWeight: "600", color: "#214f38" },
  input: {
    borderWidth: 1,
    borderColor: "#c7d3be",
    borderRadius: 10,
    padding: 12,
    minHeight: 48,
  },
  title: { fontSize: 24, fontWeight: "700", color: "#214f38" },
  button: {
    backgroundColor: "#214f38",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  buttonText: { color: "white", fontWeight: "600", flexShrink: 1 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  error: { color: "#a22222" },
  notice: { padding: 14, backgroundColor: "#fff4cd", borderRadius: 12 },
});
