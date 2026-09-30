import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Btn, BrutalCard, Field, Input, PageMotion } from "./primitives";
import { usePageTitle } from "./usePageTitle";
import { MtymLogo } from "./widgets";
import { useSession } from "./SessionContext";
import { requestPasswordReset } from "@/lib/repositories/accountRepository";
import { errorMessage } from "@/lib/services/errors";

// Shown for every route while nobody is logged in. Accounts are created by
// an admin, who hands out the generated password — there is no sign-up.
//
// « Mot de passe oublié ? » turns the card into a one-field form that asks
// for a link by email (valid an hour, to choose a new password on
// /mot-de-passe). The page opens on it with ?oubli=1 — where an expired
// link sends the juror.

type Mode = "login" | "forgot" | "sent";

export function LoginPage() {
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(() => (params.get("oubli") === "1" ? "forgot" : "login"));
  const [email, setEmail] = useState("");
  usePageTitle(mode === "login" ? "Connexion" : "Mot de passe oublié");

  // Back to the login form; ?oubli=1 goes, so a reload stays there
  const backToLogin = () => {
    setMode("login");
    if (params.has("oubli")) setParams({}, { replace: true });
  };

  return (
    <PageMotion className="min-h-[60vh] flex items-center justify-center py-10">
      <BrutalCard className="w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <MtymLogo size="2rem" />
          <span
            className="font-mont text-tiny uppercase tracking-widest pl-3"
            style={{ color: "var(--saffron-dark)", fontWeight: 800, borderLeft: "1px solid var(--border)" }}
          >
            Qualifications 2026
          </span>
        </div>
        {mode === "login" ? (
          <LoginForm email={email} setEmail={setEmail} onForgot={() => setMode("forgot")} />
        ) : (
          <ForgotForm email={email} setEmail={setEmail} sent={mode === "sent"} onSent={() => setMode("sent")} onBack={backToLogin} />
        )}
      </BrutalCard>
    </PageMotion>
  );
}

function Title({ children, sub }: { children: string; sub: string }) {
  return (
    <>
      <h1
        className="font-mont leading-none mb-2"
        style={{ fontSize: "1.9rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.02em" }}
      >
        {children}
      </h1>
      <p className="font-open text-sm mb-6" style={{ color: "var(--ink-soft)" }}>{sub}</p>
    </>
  );
}

// A quiet text button under a form (« Mot de passe oublié ? », « Retour… »)
function TextButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-open text-sm underline underline-offset-2 focus-ring"
      style={{ color: "var(--ink-soft)" }}
    >
      {children}
    </button>
  );
}

function LoginForm({ email, setEmail, onForgot }: { email: string; setEmail: (email: string) => void; onForgot: () => void }) {
  const { login } = useSession();
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
    <>
      <Title sub="Connectez-vous avec l'email et le mot de passe reçus des organisateurs.">Espace jury</Title>
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
      <div className="mt-4 text-center">
        <TextButton onClick={onForgot}>Mot de passe oublié ?</TextButton>
      </div>
    </>
  );
}

function ForgotForm({
  email,
  setEmail,
  sent,
  onSent,
  onBack,
}: {
  email: string;
  setEmail: (email: string) => void;
  sent: boolean;
  onSent: () => void;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      onSent();
    } catch (err) {
      setError(errorMessage(err, "La demande n'a pas pu partir."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Title sub="Recevez par email un lien pour choisir un nouveau mot de passe.">Mot de passe oublié</Title>
      {sent ? (
        // The same answer whether or not the address has an account
        <Alert tone="success" title="Demande envoyée">
          Si un compte existe pour <strong>{email.trim()}</strong>, un email vient de partir. Le lien qu'il contient est valable
          une heure. Pensez à regarder dans vos spams.
        </Alert>
      ) : (
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
          <Btn type="submit" disabled={busy} className="w-full justify-center">
            {busy ? "Envoi…" : "Recevoir un lien"}
          </Btn>
        </form>
      )}
      <div className="mt-4 text-center">
        <TextButton onClick={onBack}>Retour à la connexion</TextButton>
      </div>
    </>
  );
}
