"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";

export default function Signup() {
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const [error, setError] = useFeedback("error");
  const [message, setMessage] = useFeedback("success");
  const running = useRef(false);
  return <main className="signup-page"><Link href="/" className="brand">DuukaYo</Link><section className="panel"><span className="eyebrow">YOUR ACCOUNT, YOUR PASSWORD</span><h1>Create your account</h1><p>Shop with one account. Your administrator can add team access after you register.</p>{error && <p className="error">{error}</p>}{done ? <><p className="success">{message}</p><Link href="/dashboard">Continue to sign in →</Link></> : <form className="signup-form" onSubmit={async e => {
    e.preventDefault(); if (running.current) return;
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setError("");
    if (data.password !== data.confirm_password) { setError("Passwords do not match."); return; }
    running.current = true; setBusy(true);
    try { const result = await api<{ detail: string }>("auth/accounts/", data); setMessage(result.detail); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to create your account. Try again."); }
    finally { running.current = false; setBusy(false); }
  }}><fieldset disabled={busy}><label>Username<input name="username" autoComplete="username" required minLength={3} maxLength={150} pattern="[a-zA-Z0-9@.+_-]+" /></label><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>Password<input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></label><small>Use at least 10 characters. Keep your password private.</small><label>Confirm password<input name="confirm_password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></label><button>{busy ? "Creating account…" : "Create account"}</button></fieldset></form>}<p>Already registered? <Link href="/dashboard">Sign in</Link></p></section></main>;
}
