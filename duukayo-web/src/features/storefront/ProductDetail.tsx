"use client";
import { useEffect, useRef, useState } from "react";
import type { ShopCatalog } from "@/lib/storefront";
import { money } from "@/lib/api";
import { productName, variantLabel, variantsFor } from "@/lib/variants";
import { ProductImage } from "./ProductShowcase";
import { WishlistButton } from "./Wishlist";

export default function ProductDetail({
  id,
  catalog,
  close,
  add,
  disabled,
  quantities = {},
}: {
  id: string;
  catalog: ShopCatalog;
  close: () => void;
  add: (id: number) => void;
  disabled: boolean;
  quantities?: Record<number, number>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(Number(id));
  const [image, setImage] = useState("");
  const product = catalog.products.find((p) => p.id === selected);
  const variants = product ? variantsFor(catalog.products, product) : [];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="product-dialog"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-labelledby="product-detail-title"
    >
      <button
        className="detail-close secondary"
        onClick={close}
        aria-label="Close product details"
      >
        ×
      </button>
      {product ? (
        <div className="detail-layout">
          <div>
            <div className="detail-art">
              <ProductImage
                src={image || product.image}
                name={productName(product)}
              />
            </div>
            {!!product.gallery?.length && (
              <div className="gallery-thumbnails">
                {[product.image, ...product.gallery]
                  .filter(Boolean)
                  .map((src, i) => (
                    <button
                      type="button"
                      key={src + i}
                      aria-label={"View photo " + (i + 1)}
                      onClick={() => setImage(src)}
                    >
                      <ProductImage src={src} name={product.name} />
                    </button>
                  ))}
              </div>
            )}
          </div>
          <div>
            <p className="eyebrow">
              {catalog.shop.name} · {product.category_name}
            </p>
            <h2 id="product-detail-title">{product.name}</h2>
            {product.description && <p>{product.description}</p>}
            {!!product.variant_group && (
              <fieldset className="variant-picker">
                <legend>Choose your option</legend>
                {variants.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={
                      p.id === selected
                        ? "variant-choice selected"
                        : "variant-choice"
                    }
                    aria-pressed={p.id === selected}
                    onClick={() => {
                      setSelected(p.id);
                      setImage("");
                    }}
                  >
                    {variantLabel(p)}
                    {!p.available || p.preview ? " · Unavailable" : ""}
                  </button>
                ))}
              </fieldset>
            )}
            {product.attributes && !product.variant_group && (
              <dl>
                {Object.entries(product.attributes).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="detail-price">
              {money(product.price, catalog.shop.currency)}
            </p>
            <p aria-live="polite">
              {product.preview
                ? "Preview · coming soon"
                : product.available
                  ? product.available + " available to order"
                  : "Currently sold out"}
            </p>
            <div className="catalog-actions">
              <button
                disabled={
                  disabled ||
                  !!product.preview ||
                  !product.available ||
                  (quantities[product.id] || 0) >=
                    Math.min(product.available, 10000)
                }
                onClick={() => {
                  add(product.id);
                  close();
                }}
              >
                Add to cart +
              </button>
              <WishlistButton
                product={{
                  ...product,
                  slug: catalog.shop.slug,
                  shop: catalog.shop.name,
                  currency: catalog.shop.currency,
                }}
              />
            </div>
            <p className="muted">{catalog.availability_notice}</p>
            <p className="payment-note">
              Pickup available
              {catalog.shop.delivery_enabled
                ? " · Shop delivery available"
                : ""}
            </p>
          </div>
        </div>
      ) : (
        <>
          <h2 id="product-detail-title">This product is unavailable</h2>
          <p>It may have been removed from the shop.</p>
          <button onClick={close}>Browse products</button>
        </>
      )}
    </dialog>
  );
}
