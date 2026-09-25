import Icon from "../../components/Icon";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { resolveImageUrl } from "../../lib/media";
export function ProductPicture({ uri, name }: { uri?: string; name: string }) {
  const [failed, setFailed] = useState("");
  const imageUri = resolveImageUrl(uri);
  return imageUri && imageUri !== failed ? (
    <Image
      source={{ uri: imageUri }}
      resizeMode="contain"
      accessibilityLabel={name}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 16,
        overflow: "hidden",
      }}
      onError={() => setFailed(imageUri)}
    />
  ) : (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <Icon name="catalog" size={40} color="#688447" />
      <Text style={{ color: "#47603a", textAlign: "center", fontSize: 11 }}>
        {name}
      </Text>
    </View>
  );
}
