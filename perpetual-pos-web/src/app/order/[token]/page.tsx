import OrderStatus from "@/features/storefront/OrderStatus";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <OrderStatus token={token} />;
}
