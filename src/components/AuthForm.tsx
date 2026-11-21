import { useState } from "react";
import type { AuthMode } from "../hooks/useAuth";

interface AuthFormProps {
  /** Finishes the sentence "Sign in …", e.g. "to save this trip to the cloud." */
  reason: string;
  onAuthenticate: (mode: AuthMode, email: string, password: string) => Promise<void>;
  /** Called after a successful sign-in or sign-up. */
  onSuccess: () => void | Promise<void>;
  onCancel?: () => void;
}

export function AuthForm({ reason, onAuthenticate, onSuccess, onCancel }: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onAuthenticate(mode, email.trim(), password);
      setPassword("");
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-blue-50 rounded-xl p-4 space-y-2">
      <p className="text-sm text-gray-800">
        {mode === "signin" ? "Sign in" : "Create an account"} {reason}
      </p>
      <input
        type="email"
        required
        autoComplete="email"
        aria-label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-base"
      />
      <input
        type="password"
        required
        minLength={8}
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        aria-label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password (8+ characters)"
        className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-base"
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
      >
        {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
      <div className="flex justify-between text-xs text-gray-500">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode(mode === "signin" ? "signup" : "signin");
          }}
        >
          {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Not now
          </button>
        )}
      </div>
    </form>
  );
}
