"use client";
import Link from "next/link";
import Icon from "@/components/Icon";
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/api";
import type { ShowcaseProduct } from "@/lib/storefront";

export function ProductImage({
  src,
  name,
  eager = false,
}: {
  src?: string;
  name: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState("");
  return src && failed !== src ? (
    // Shop-managed image hosts vary.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="product-photo"
      src={src}
      alt={name}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      onError={() => setFailed(src)}
    />
  ) : (
    <span className="product-placeholder" aria-label={name}>
      <span>◈</span>
      <small>{name}</small>
    </span>
  );
}
export default function ProductShowcase({
  products,
}: {
  products: ShowcaseProduct[];
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const engaged = hovered || focused;
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const start = useRef(0);
  const suppressClick = useRef(false);
  const interactionUntil = useRef(0);
  const [windowActive, setWindowActive] = useState(true);
  useEffect(() => {
    const update = () =>
      setWindowActive(!document.hidden && document.hasFocus());
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    change();
    media.addEventListener("change", change);
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (root.current) observer.observe(root.current);
    return () => {
      media.removeEventListener("change", change);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (
      paused ||
      engaged ||
      reduced ||
      !visible ||
      !windowActive ||
      products.length < 2
    )
      return;
    const timer = setInterval(() => {
      if (!document.hidden && Date.now() > interactionUntil.current)
        setIndex((i) => (i + 1) % products.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [paused, engaged, reduced, visible, windowActive, products.length]);
  const safeIndex = products.length ? index % products.length : 0;
  const selected = products[safeIndex];
  function move(delta: number) {
    interactionUntil.current = Date.now() + 8000;
    setIndex((i) => (i + delta + products.length) % products.length);
  }
  return (
    <div
      className="product-showcase"
      ref={root}
      aria-label="Explore products"
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      onTouchStart={(e) => {
        start.current = e.touches[0].clientX;
        suppressClick.current = false;
        interactionUntil.current = Date.now() + 8000;
      }}
      onTouchEnd={(e) => {
        const distance = e.changedTouches[0].clientX - start.current;
        if (products.length > 1 && Math.abs(distance) > 50) {
          suppressClick.current = true;
          move(distance < 0 ? 1 : -1);
        }
      }}
    >
      {selected ? (
        <>
          <div
            className="showcase-viewport"
            onClickCapture={(e) => {
              if (suppressClick.current) {
                e.preventDefault();
                e.stopPropagation();
                suppressClick.current = false;
              }
            }}
          >
            <div
              className="showcase-track"
              style={{
                transform: `translateX(-${safeIndex * 100}%)`,
                transition: reduced ? "none" : "transform 450ms ease",
              }}
            >
              {products.map((selected, position) => (
                <div
                  key={selected.slug + selected.id}
                  className="showcase-slide"
                  inert={position !== safeIndex}
                  aria-hidden={position !== safeIndex}
                >
                  <Link
                    key={selected.slug + selected.id}
                    className="showcase-product"
                    href={`/shop/${selected.slug}?product=${selected.id}`}
                  >
                    <span className="showcase-label">{selected.preview ? "PREVIEW · COMING SOON" : "IN THE SPOTLIGHT"}</span>
                    <div className="showcase-image">
                      <ProductImage
                        eager
                        src={selected.image}
                        name={selected.name}
                      />
                    </div>
                    <span className="showcase-shop">{selected.shop}</span>
                    <strong>{selected.name}</strong>
                    <span className="showcase-price">
                      {money(selected.price, selected.currency)}{" "}
                      <span>Explore ↗</span>
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
          {products.length > 1 && (
            <div className="showcase-controls">
              <button
                type="button"
                aria-label="Previous product"
                onClick={() => move(-1)}
              >
                <Icon name="left" />
              </button>
              <span>
                {(index % products.length) + 1} / {products.length}
              </span>
              <button
                type="button"
                aria-label="Next product"
                onClick={() => move(1)}
              >
                <Icon name="right" />
              </button>
              <button
                type="button"
                disabled={reduced}
                onClick={() => setPaused(!paused)}
              >
                {reduced ? "Motion off" : paused ? "Play" : "Pause"}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="showcase-empty">
          <span>◈</span>
          <h2>Your next discovery awaits.</h2>
          <p>Products will appear here when shops open their shelves.</p>
        </div>
      )}
    </div>
  );
}
