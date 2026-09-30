import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Alert, Btn, BrutalCard, Field, Input, PageMotion } from "./primitives";
import { usePageTitle } from "./usePageTitle";
import { MtymLogo } from "./widgets";
import { useSession } from "./SessionContext";
import { resetPasswordWithLink } from "@/lib/repositories/accountRepository";
import { errorMessage, ValidationError } from "@/lib/services/errors";

// /mot-de-passe#<token> — where the « Mot de passe oublié » email leads,
// open to anyone (no session needed). The token rides in the fragment,
// which browsers never send to a server; it is read once, then taken out
// of the address bar. Choosing a password signs the account in.

const MIN_LENGTH = 8; // the server's rule (PUT /auth/password too)

export function ResetPasswordPage() {
  usePageTitle("Nouveau mot de passe");
  const { signIn } = useSession();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const fromLink = hash.replace(/^#/, "");
  const [token, setToken] = useState(fromLink);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [tried, setTried] = useState(false); // field errors show once the form was sent
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deadLink, setDeadLink] = useState(false); // used, expired or unknown: only a new one helps

  // A link opened while this page was already there only changes the
  // fragment: take its token, and start afresh
  if (fromLink && fromLink !== token) {
    setToken(fromLink);
    setTried(false);
    setError(null);
    setDeadLink(false);
  }

  // The token leaves the address bar (history, screenshots, a shared screen)
  useEffect(() => {
    if (hash) navigate(pathname, { replace: true });
  }, [hash, pathname, navigate]);

  const tooShort = password.length < MIN_LENGTH;
  const mismatch = confirm !== password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (tooShort || mismatch) return;
    setBusy(true);
    setError(null);
    try {
      const session = await resetPasswordWithLink(token, password);
      signIn(session.token, session.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Le mot de passe n'a pas pu être changé."));
      // A 400 without field details is the link itself (the fields were
      // checked here first); a network or server failure can be retried
      setDeadLink(err instanceof ValidationError && !err.details);
      setBusy(false);
    }
  };

  const askAgain = <Btn variant="ghost" onClick={() => navigate("/?oubli=1")}>Demander un nouveau lien</Btn>;

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
        <h1
          className="font-mont leading-none mb-2"
          style={{ fontSize: "1.9rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.02em" }}
        >
          Nouveau mot de passe
        </h1>

        {!token ? (
          <div className="space-y-4 mt-6">
            <Alert title="Lien incomplet">
              Ouvrez le lien tel qu'il figure dans l'email « Choisir un nouveau mot de passe », ou demandez-en un nouveau.
            </Alert>
            {askAgain}
          </div>
        ) : deadLink ? (
          <div className="space-y-4 mt-6">
            <Alert title="Lien expiré">
              Ce lien a déjà servi, ou il a plus d'une heure. Demandez-en un nouveau.
            </Alert>
            {askAgain}
          </div>
        ) : (
          <>
            <p className="font-open text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
              Choisissez le mot de passe de votre compte : au moins {MIN_LENGTH} caractères. Vous serez ensuite connecté.
            </p>
            <form onSubmit={submit} className="space-y-4" noValidate>
              {error && <Alert>{error}</Alert>}
              <Field label="Nouveau mot de passe" error={tried && tooShort ? `Au moins ${MIN_LENGTH} caractères` : undefined}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={tried && tooShort}
                  autoFocus
                />
              </Field>
              <Field label="Confirmer" error={tried && !tooShort && mismatch ? "Les deux mots de passe diffèrent" : undefined}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={tried && !tooShort && mismatch}
                />
              </Field>
              <Btn type="submit" disabled={busy} className="w-full justify-center">
                {busy ? "Enregistrement…" : "Enregistrer et me connecter"}
              </Btn>
            </form>
          </>
        )}
      </BrutalCard>
    </PageMotion>
  );
}
