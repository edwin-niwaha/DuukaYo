import { Image, type ColorValue } from "react-native";
const icons = {
  operations: require("../../assets/icons/operations.png"),
  overview: require("../../assets/icons/overview.png"),
  checkout: require("../../assets/icons/checkout.png"),
  catalog: require("../../assets/icons/catalog.png"),
  inventory: require("../../assets/icons/inventory.png"),
  orders: require("../../assets/icons/orders.png"),
  customers: require("../../assets/icons/customers.png"),
  sales: require("../../assets/icons/sales.png"),
  settings: require("../../assets/icons/settings.png"),
  team: require("../../assets/icons/team.png"),
  left: require("../../assets/icons/left.png"),
  right: require("../../assets/icons/right.png"),
  refresh: require("../../assets/icons/refresh.png"),
  menu: require("../../assets/icons/menu.png"),
  close: require("../../assets/icons/close.png"),
  external: require("../../assets/icons/external.png"),
  logout: require("../../assets/icons/logout.png"),
  plus: require("../../assets/icons/plus.png"),
  edit: require("../../assets/icons/edit.png"),
  copy: require("../../assets/icons/copy.png"),
  archive: require("../../assets/icons/archive.png"),
  trash: require("../../assets/icons/trash.png"),
  save: require("../../assets/icons/save.png"),
  home: require("../../assets/icons/home.png"),
  cart: require("../../assets/icons/cart.png"),
  heart: require("../../assets/icons/heart.png"),
  profile: require("../../assets/icons/profile.png"),
  lock: require("../../assets/icons/lock.png"),
  help: require("../../assets/icons/help.png"),
  down: require("../../assets/icons/down.png"),
  up: require("../../assets/icons/up.png"),
  check: require("../../assets/icons/check.png"),
};
export type IconName = keyof typeof icons;
export default function Icon({
  name,
  size = 22,
  color = "#24543b",
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  return (
    <Image
      source={icons[name]}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
