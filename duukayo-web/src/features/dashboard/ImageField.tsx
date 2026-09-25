"use client";
import { useFeedback } from "../../lib/feedback";

import { useEffect, useRef, useState } from "react";
import { uploadImage } from "@/lib/api";
import { ProductImage } from "@/features/storefront/ProductShowcase";
export default function ImageField({
  businessId,
  name = "image",
  initial = "",
  onSave,
  uploadEndpoint,
}: {
  businessId: number;
  name?: string;
  initial?: string;
  onSave?: (url: string) => Promise<unknown>;
  uploadEndpoint?: string;
}) {
  const root = useRef<HTMLFieldSetElement>(null);
  const [url, setUrl] = useState(initial),
    [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(""),
    [progress, setProgress] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useFeedback("error");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const src = URL.createObjectURL(file);
    setPreview(src);
    return () => URL.revokeObjectURL(src);
  }, [file]);
  useEffect(() => {
    const form = root.current?.closest("form");
    const guard = (event: Event) => {
      if (busy || file) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setError(
          "Upload the selected image before saving, or clear the file selection.",
        );
      }
    };
    form?.addEventListener("submit", guard, true);
    return () => form?.removeEventListener("submit", guard, true);
  }, [busy, file, setError]);
  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      const value = await uploadImage(businessId, file, setProgress, uploadEndpoint);
      await onSave?.(value);
      setUrl(value);
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset ref={root} className="image-field" disabled={busy}>
      <legend>{name === "photo" ? "Profile picture" : name === "logo" ? "Shop logo" : "Product image"}</legend>
      {(preview || url) && (
        <div style={{ height: 130, width: 160 }}>
          <ProductImage src={preview || url} name="Image preview" />
        </div>
      )}
      <label>
        Image URL
        <input
          type="url"
          name={name}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => {
            if (onSave && url !== initial)
              void onSave(url).catch((e) => setError(e.message));
          }}
        />
      </label>
      <label>
        Choose image
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setError("");
            if (f && f.size > 8 * 1024 * 1024) {
              setError("Maximum file size is 8 MB.");
              return;
            }
            setFile(f || null);
          }}
        />
      </label>
      {file && (
        <button type="button" onClick={() => void upload()}>
          {busy
            ? `Uploading ${progress}%`
            : error
              ? "Retry upload"
              : "Upload selected image"}
        </button>
      )}
      {busy && (
        <progress max={100} value={progress} aria-label="Upload progress" />
      )}
      {url && (
        <button
          type="button"
          className="secondary"
          onClick={async () => {
            try {
              await onSave?.("");
              setUrl("");
              setFile(null);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Remove image
        </button>
      )}
      {error && <p>{error}</p>}
      <small>JPEG, PNG or WebP · up to 8 MB. Upload before saving.</small>
    </fieldset>
  );
}
