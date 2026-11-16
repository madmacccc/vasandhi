import { useState, type FormEvent } from "react";

interface AuthGateProps {
  busy: boolean;
  error: string;
  onSignIn(email: string, password: string): Promise<void>;
  onSignUp(email: string, password: string): Promise<boolean>;
}

export default function AuthGate({ busy, error, onSignIn, onSignUp }: AuthGateProps) {
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    setMessage("");
    try {
      if (creatingAccount) {
        const signedIn = await onSignUp(email, password);
        if (!signedIn) setMessage("Check your email to confirm the account, then sign in.");
      } else {
        await onSignIn(email, password);
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Authentication failed.");
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <div className="admin-brand-mark">GL</div>
        <h1>Golden Ledger</h1>
        <p>Sign in to sync your shop ledger with Supabase.</p>
        {(error || message) && <div className="error-banner" role="alert">{error || message}</div>}
        <label className="admin-field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="admin-field">
          <span>Password</span>
          <input name="password" type="password" autoComplete={creatingAccount ? "new-password" : "current-password"} minLength={8} required />
        </label>
        <button className="admin-button admin-button-gold" type="submit" disabled={busy}>
          {busy ? "Please wait…" : creatingAccount ? "Create account" : "Sign in"}
        </button>
        <button
          className="auth-toggle"
          type="button"
          disabled={busy}
          onClick={() => { setCreatingAccount((current) => !current); setMessage(""); }}
        >
          {creatingAccount ? "Already have an account? Sign in" : "First time here? Create the shop account"}
        </button>
      </form>
    </main>
  );
}
