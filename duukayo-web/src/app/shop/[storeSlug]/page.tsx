import Storefront from "@/features/storefront/Storefront";
export default async function Page({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  return <Storefront slug={storeSlug} />;
}
