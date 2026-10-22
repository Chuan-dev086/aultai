import { useEffect, useState } from "react";
import { CloseIcon } from "./Icons.jsx";

const DEMO = [
  { role: "Admin", email: "admin@gilingan.my", password: "admin123" },
  { role: "Editor", email: "editor@gilingan.my", password: "editor123" },
  { role: "Customer", email: "user@gilingan.my", password: "user123" },
];

export default function AuthModal({ auth, onClose, onSignedIn, reason }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const user = mode === "signin"
        ? await auth.signIn(form.email, form.password)
        : await auth.signUp(form.name, form.email, form.password);
      onSignedIn(user);
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={mode === "signin" ? "Sign in" : "Create account"}>
        <form className="auth-card" onSubmit={submit}>
          <button type="button" className="icon-btn auth-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
          <h2>{mode === "signin" ? "Sign in" : "Create an account"}</h2>
          {reason && <p className="note">{reason}</p>}

          {mode === "signup" && (
            <label className="field">Full name<input value={form.name} onChange={set("name")} autoComplete="name" /></label>
          )}
          <label className="field">Email<input type="email" value={form.email} onChange={set("email")} autoComplete="email" /></label>
          <label className="field">Password
            <input type="password" value={form.password} onChange={set("password")}
              autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          </label>

          {error && <p className="error">{error}</p>}
          <button className="btn btn-solid" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          <p className="note">
            {mode === "signin" ? "New here? " : "Already have an account? "}
            <button type="button" className="link" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>

          {mode === "signin" && (
            <div className="demo">
              <p className="note">Demo accounts (click to fill in):</p>
              <div className="demo-list">
                {DEMO.map((d) => (
                  <button type="button" key={d.role} onClick={() => setForm({ ...form, email: d.email, password: d.password })}>
                    <strong>{d.role}</strong><span>{d.email}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </>
  );
}
