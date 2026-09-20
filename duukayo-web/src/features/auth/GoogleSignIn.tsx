"use client";
import Script from "next/script";
import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

type GoogleIdentity = {
  initialize: (options: {
    client_id: string;
    callback: (result: { credential: string }) => void;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: { theme: string; size: string; text: string },
  ) => void;
};

export default function GoogleSignIn({
  onSuccess,
  onError,
  disabled,
  onBusyChange,
}: {
  onSuccess: () => Promise<void>;
  onError: (message: string) => void;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const blocked = useRef(disabled);
  useEffect(() => {
    blocked.current = disabled;
  }, [disabled]);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  function ready() {
    const identity = (
      window as Window & { google?: { accounts: { id: GoogleIdentity } } }
    ).google?.accounts.id;
    if (!identity || !container.current) return;
    identity.initialize({
      client_id: clientId!,
      callback: async ({ credential }) => {
        if (pending.current || blocked.current) return;
        pending.current = true;
        onBusyChange(true);
        onError("");
        try {
          await api("auth/google/session/", { id_token: credential });
          await onSuccess();
        } catch (error) {
          onError(
            error instanceof Error
              ? error.message
              : "Google sign-in failed. Please retry.",
          );
        } finally {
          pending.current = false;
          onBusyChange(false);
        }
      },
    });
    container.current.replaceChildren();
    identity.renderButton(container.current, {
      theme: "outline",
      size: "large",
      text: "continue_with",
    });
  }
  return (
    <fieldset
      disabled={disabled}
      style={{
        border: 0,
        padding: 0,
        margin: "16px 0",
        pointerEvents: disabled ? "none" : "auto",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Script
        src="https://accounts.google.com/gsi/client"
        onReady={ready}
        onError={() =>
          onError(
            "Google sign-in could not load. Check your connection or sign in with your password.",
          )
        }
      />
      <div ref={container} />
    </fieldset>
  );
}
