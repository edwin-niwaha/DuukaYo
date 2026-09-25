import Storefront from "@/features/storefront/Storefront";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ product?: string }>;
}) {
  const { storeSlug } = await params;
  const { product } = await searchParams;
  return <Storefront key={storeSlug} slug={storeSlug} productId={product} />;
}
