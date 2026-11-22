import { useState, type FormEvent } from "react";
import {
  ArrowRight, Eye, EyeOff, Gem, LockKeyhole, ShieldCheck, Sparkles,
} from "lucide-react";

interface AuthGateProps {
  busy: boolean;
  error: string;
  onSignIn(email: string, password: string): Promise<void>;
  onPasswordReset(email: string): Promise<void>;
}

export default function AuthGate({ busy, error, onSignIn, onPasswordReset }: AuthGateProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      await onSignIn(email.trim(), password);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not sign in.");
    }
  }

  async function resetPassword() {
    setMessage("");
    if (!email.trim()) {
      setMessage("Enter your admin email first, then choose Forgot password.");
      return;
    }

    setResetBusy(true);
    try {
      await onPasswordReset(email.trim());
      setMessage("If this admin account exists, a password reset link is on its way.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not send the reset email.");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-showcase" aria-label="Sri Vasanthi Jewellery Pawn Broker">
        <div className="auth-orbit auth-orbit-one" />
        <div className="auth-orbit auth-orbit-two" />
        <div className="auth-showcase-content">
          <div className="auth-brand">
            <span className="auth-brand-mark"><Gem size={22} strokeWidth={1.7} /></span>
            <span><strong>Sri Vasanthi</strong><small>JEWELLERY PAWN BROKER</small></span>
          </div>

          <div className="auth-story">
            <span className="auth-kicker"><Sparkles size={13} /> THE ADMIN WORKSPACE</span>
            <p className="auth-tamil-title">நம்பிக்கையுடன்<br />நிர்வகிக்கவும்.</p>
            <h1>Your shop,<br />beautifully in balance.</h1>
            <p className="auth-story-copy">
              A calm, clear workspace for every pledge, payment and customer detail —
              thoughtfully designed for your day.
            </p>
          </div>

          <div className="auth-showcase-foot">
            <ShieldCheck size={16} />
            <span>Private access for authorised shop administrators</span>
          </div>
        </div>
        <div className="auth-decoration" aria-hidden="true">
          <span className="auth-decoration-ring" />
          <Gem size={94} strokeWidth={0.65} />
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-mobile-brand">
            <span className="auth-brand-mark"><Gem size={20} strokeWidth={1.7} /></span>
            <span><strong>Sri Vasanthi</strong><small>ADMIN PORTAL</small></span>
          </div>
          <div className="auth-panel-heading">
            <span className="auth-lock-mark"><LockKeyhole size={19} /></span>
            <span className="auth-eyebrow">SECURE ADMIN SIGN IN</span>
            <h2>Welcome back</h2>
            <p>Sign in to continue to your shop workspace.</p>
          </div>

          {(error || message) && (
            <div className={`auth-feedback ${error ? "is-error" : "is-message"}`} role={error ? "alert" : "status"}>
              {error || message}
            </div>
          )}

          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label className="auth-field">
              <span>Admin email</span>
              <input
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@yourshop.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <span className="auth-password-wrap">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  className="auth-password-toggle"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            <div className="auth-form-meta">
              <span><ShieldCheck size={14} /> Protected administrator account</span>
              <button type="button" onClick={() => void resetPassword()} disabled={busy || resetBusy}>
                {resetBusy ? "Sending…" : "Forgot password?"}
              </button>
            </div>

            <button className="auth-submit" type="submit" disabled={busy || resetBusy}>
              <span>{busy ? "Verifying access…" : "Sign in securely"}</span>
              {!busy && <ArrowRight size={17} />}
              {busy && <span className="auth-spinner" aria-hidden="true" />}
            </button>
          </form>

          <div className="auth-divider"><span>SECURE CONNECTION</span></div>
          <p className="auth-security-note">
            Your account is managed by Firebase Authentication. Shop records remain on this device.
          </p>
          <footer className="auth-panel-footer">
            <span>© Sri Vasanthi Jewellery Pawn Broker</span>
            <span><i /> Private workspace</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
