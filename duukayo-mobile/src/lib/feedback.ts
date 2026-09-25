"use client";
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

export type Toast = { id: number; message: string; tone: "error" | "success" | "info" };
const listeners = new Set<(toast: Toast) => void>();
let sequence = 0;
let previous = { message: "", at: 0 };
export function notify(message: string, tone: Toast["tone"] = "info") {
  if (!message.trim()) return;
  const now = Date.now();
  if (previous.message === message && now - previous.at < 2500) return;
  previous = { message, at: now };
  const toast = { id: ++sequence, message, tone };
  listeners.forEach(listener => listener(toast));
}
export function subscribeToasts(listener: (toast: Toast) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Preserve inline feedback, while also making it visible above long forms. */
export function useFeedback(tone: Toast["tone"] = "error"): [string, Dispatch<SetStateAction<string>>] {
  const [value, setValue] = useState("");
  const current = useRef("");
  const set = useCallback<Dispatch<SetStateAction<string>>>((next) => {
    const message = typeof next === "function" ? next(current.current) : next;
    current.current = message;
    setValue(message);
    if (message) notify(message, tone);
  }, [tone]);
  return [value, set];
}
