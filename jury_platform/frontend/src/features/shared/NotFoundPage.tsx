import { motion, useReducedMotion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { NotFoundHero } from "./NotFoundHero";
import { Btn, BrutalCard, PageMotion } from "./primitives";
import { useSession } from "./SessionContext";

// NotFoundPage — "proof gone missing": the dot 404 on graph paper, what
// happened in a sentence, a short proof by contradiction of the missing
// route, and one way back home.

export function NotFoundPage() {
  const { role } = useSession();
  const { pathname } = useLocation();
  return (
    <PageMotion className="space-y-10 pt-4 sm:pt-6">
      <NotFoundHero />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-8 items-start">
        <div>
          <span className="font-mont text-tiny uppercase tracking-[0.2em] block mb-2" style={{ color: "var(--saffron-dark)", fontWeight: 800 }}>
            Erreur 404
          </span>
          <h1 className="font-mont" style={{ color: "var(--forest)", fontWeight: 900, fontSize: "clamp(1.6rem, 3vw, 2.4rem)", lineHeight: 1.15, letterSpacing: "-0.01em" }}>
            L'existence de cette page n'a pas été démontrée.
          </h1>
          <p className="font-open text-base mt-3 max-w-xl" style={{ color: "var(--ink-soft)" }}>
            Nous avons parcouru le graphe, vérifié les hypothèses et abouti à une contradiction.
          </p>
          <Link to="/" className="inline-block mt-6">
            <Btn>{role === "admin" ? "Retour au tableau de bord" : "Retour à mon planning"}</Btn>
          </Link>
        </div>
        <ProofCard path={pathname} />
      </div>
    </PageMotion>
  );
}

// Given / to prove / conclusion, one line after the other; the claim is
// struck through as the conclusion lands.
function ProofCard({ path }: { path: string }) {
  const reduce = useReducedMotion();
  const shown = path.length > 48 ? `${path.slice(0, 47)}…` : path;
  const line = (i: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.6 + i * 0.55, duration: 0.35 } };

  return (
    <BrutalCard className="p-6">
      <section aria-label="Démonstration" className="space-y-3 font-open text-sm" style={{ color: "var(--ink)" }}>
        <div className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
          Démonstration
        </div>
        <motion.p {...line(0)}>
          <Term>Soit</Term> l'adresse{" "}
          <code className="font-mont text-xs px-1.5 py-0.5 break-all" style={{ background: "var(--paper-2)", color: "var(--forest)", fontWeight: 700 }}>
            {shown}
          </code>
          .
        </motion.p>
        <motion.p {...line(1)}>
          <Term>À démontrer</Term>{" "}
          <span className="relative inline-block">
            elle existe
            <motion.span
              aria-hidden
              className="absolute left-0 right-0"
              style={{ top: "55%", height: 2, background: "var(--clay)", transformOrigin: "left" }}
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: reduce ? 0 : 2.0, duration: 0.4 }}
            />
          </span>
          .
        </motion.p>
        <motion.p {...line(2)}>
          <Term>Conclusion</Term> <strong style={{ color: "var(--clay)" }}>absurde.</strong>{" "}
          <span aria-hidden className="inline-block align-middle" style={{ width: 9, height: 9, background: "var(--forest)" }} />
        </motion.p>
      </section>
    </BrutalCard>
  );
}

function Term({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mont text-micro uppercase tracking-widest mr-1.5" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
      {children} :
    </span>
  );
}
