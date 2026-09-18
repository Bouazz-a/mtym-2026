import { useState } from "react";
import { Alert, Btn, BrutalCard, Field, Input, PageMotion } from "./primitives";
import { MtymLogo } from "./widgets";
import { useSession } from "./SessionContext";
import { errorMessage } from "@/lib/services/errors";

// Shown for every route while nobody is logged in. Accounts are created by
// an admin, who hands out the generated password — there is no sign-up.
export function LoginPage() {
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err, "Connexion impossible."));
      setBusy(false);
    }
  };

  return (
    <PageMotion className="min-h-[60vh] flex items-center justify-center py-10">
      <BrutalCard className="w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <MtymLogo size={28} />
          <span
            className="font-mont text-tiny uppercase tracking-widest pl-3"
            style={{ color: "var(--saffron-dark)", fontWeight: 800, borderLeft: "1px solid var(--border)" }}
          >
            Qualifications 2026
          </span>
        </div>
        <h1
          className="font-mont leading-none mb-2"
          style={{ fontSize: "1.9rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.02em" }}
        >
          Espace jury
        </h1>
        <p className="font-open text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          Connectez-vous avec l'email et le mot de passe reçus des organisateurs.
        </p>

        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Mot de passe">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Btn type="submit" disabled={busy} className="w-full justify-center">
            {busy ? "Connexion…" : "Se connecter"}
          </Btn>
        </form>
      </BrutalCard>
    </PageMotion>
  );
}
