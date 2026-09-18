import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MtymLogo } from "@/features/shared/widgets";
import { useSession } from "@/features/shared/SessionContext";
import { NAV } from "./navigation";
import { registerDarkRegion } from "./BackgroundFX";

// SiteFooter — forest band that registers itself as the "dark region" of
// the global particle canvas. The same single simulation that paints
// saffron particles on the paper area redraws those particles in cream
// when their viewport coordinates fall inside this footer's rect — the
// footer acts as a color filter rather than hosting a second set.

const ABOUT_LINKS: { href: string; label: string }[] = [
  { href: "https://mathmaroc.org", label: "Math&Maroc" },
  { href: "https://mtym.mathmaroc.org", label: "À propos du tournoi" },
  { href: "https://github.com/Bouazz-a/mtym-2026", label: "Code source" },
];

export function SiteFooter() {
  const { role } = useSession();
  const year = new Date().getFullYear();
  const bandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerDarkRegion(bandRef.current);
    return () => registerDarkRegion(null);
  }, []);

  return (
    <footer className="relative mt-20" style={{ color: "var(--paper)" }}>
      <div style={{ height: 1, background: "var(--saffron)", opacity: 0.55 }} />

      {/* No background here: BackgroundFX paints a synced forest band at
          body level (behind the particle canvas) so particles drift on
          top of the dark band. The footer wrapper stays transparent so
          we don't double-paint and so the canvas shows through. */}
      <div
        ref={bandRef}
        className="site-footer-band relative overflow-hidden"
      >
        <motion.div
          className="relative max-w-[1400px] mx-auto px-6 lg:px-12 pt-14 pb-10"
          style={{ zIndex: 1 }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-y-8">
            <div className="md:col-span-4 md:pr-10 md:border-r md:border-[rgba(244,236,216,0.10)]">
              <div className="flex items-center gap-4 mb-5">
                <MtymLogo size={30} />
                <span
                  className="font-mont uppercase tracking-[0.22em] pl-4"
                  style={{
                    color: "rgba(244,236,216,0.60)",
                    fontWeight: 600,
                    fontSize: "0.82rem",
                    borderLeft: "1px solid rgba(255,255,255,0.14)",
                  }}
                >
                  Édition {year}
                </span>
              </div>
              <p
                className="font-open text-sm leading-relaxed max-w-sm"
                style={{ color: "rgba(244,236,216,0.65)" }}
              >
                Le Moroccan Tournament of Young Mathematicians réunit chaque
                année les jeunes passionnés de mathématiques autour de problèmes
                ouverts et de joutes scientifiques.
              </p>
            </div>

            <FooterColumn
              title="Plateforme"
              className="md:col-span-2 md:px-10 md:border-r md:border-[rgba(244,236,216,0.10)]"
            >
              {(role ? NAV[role] : []).map(l => (
                <li key={l.to}>
                  <Link to={l.to} className="footer-link">{l.label}</Link>
                </li>
              ))}
            </FooterColumn>

            <FooterColumn
              title="À propos"
              className="md:col-span-3 md:px-10 md:border-r md:border-[rgba(244,236,216,0.10)]"
            >
              {ABOUT_LINKS.map(l => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="footer-link">
                    {l.label}
                  </a>
                </li>
              ))}
            </FooterColumn>

            <div className="md:col-span-3 md:pl-10">
              <h3
                className="font-mont uppercase tracking-[0.18em] mb-4 mt-6 md:mt-0"
                style={{ color: "var(--saffron)", fontWeight: 800, fontSize: "0.92rem" }}
              >
                Contact
              </h3>

              <a
                href="mailto:contact.mtym@mathmaroc.org"
                className="font-mont inline-block mb-5"
                style={{
                  color: "var(--paper)",
                  fontWeight: 700,
                  fontSize: "0.92rem",
                  letterSpacing: "0.02em",
                  borderBottom: "1px solid rgba(246,168,6,0.45)",
                  paddingBottom: 2,
                }}
              >
                contact.mtym@mathmaroc.org
              </a>

              {/* Social row */}
              <div
                className="font-mont text-tiny uppercase tracking-[0.18em] mb-2"
                style={{ color: "rgba(244,236,216,0.50)", fontWeight: 700 }}
              >
                Suivez-nous
              </div>
              <div className="flex gap-2">
                <SocialIcon href="https://www.linkedin.com/company/mathemaroc/" label="LinkedIn" path={LINKEDIN_PATH} />
                <SocialIcon href="https://www.facebook.com/MathsMaroc2" label="Facebook" path={FACEBOOK_PATH} />
                <SocialIcon href="https://www.youtube.com/@mathmaroc1396" label="YouTube" path={YOUTUBE_PATH} />
                <SocialIcon href="https://instagram.com/mathmaroc" label="Instagram" path={INSTAGRAM_PATH} />
              </div>
            </div>
          </div>

          <div
            className="mt-12 pt-6 flex items-center justify-between gap-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div
              className="font-mont text-micro uppercase tracking-widest"
              style={{ color: "rgba(244,236,216,0.5)", fontWeight: 600 }}
            >
              <span style={{ color: "var(--saffron)" }}>◆</span>{" "}
              © {year} Math&amp;Maroc · Tous droits réservés
            </div>
          </div>
        </motion.div>
      </div>

      <style>{`
        .footer-link {
          display: inline-block;
          font-family: 'Montserrat', sans-serif;
          font-size: 0.78rem;
          letter-spacing: 0.04em;
          color: rgba(244,236,216,0.65);
          font-weight: 500;
          transition: color 160ms, transform 160ms;
          padding: 2px 0;
        }
        .footer-link:hover { color: var(--saffron); transform: translateX(2px); }
        .footer-social {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          color: rgba(244,236,216,0.65);
          border: 1px solid rgba(244,236,216,0.18);
          transition: color 160ms, border-color 160ms, background 160ms, transform 160ms;
        }
        .footer-social:hover {
          color: var(--forest);
          background: var(--saffron);
          border-color: var(--saffron);
          transform: translateY(-1px);
        }
        @media (prefers-reduced-motion: reduce) {
          .site-footer-band { background: var(--forest); }
        }
      `}</style>
    </footer>
  );
}

// ─── Social ───────────────────────────────────────────────────────────

// Simplicon-style 24×24 SVG paths so we don't pull a whole icon library
// into this leaf component.
const INSTAGRAM_PATH = "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm5.25-2.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z";
const LINKEDIN_PATH = "M4 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-2 6h4v12H2V10zm6 0h3.84v1.64h.05c.54-1 1.86-2.04 3.83-2.04 4.1 0 4.86 2.7 4.86 6.2V22h-4v-5.5c0-1.31-.02-3-1.84-3-1.84 0-2.12 1.43-2.12 2.91V22H8V10z";
const FACEBOOK_PATH = "M13.5 22v-8h2.75l.5-3.5H13.5V8.25c0-1 .27-1.75 1.75-1.75H17V3.4c-.32-.05-1.43-.15-2.7-.15-2.7 0-4.55 1.65-4.55 4.65v2.6H7v3.5h2.75V22h3.75z";
const YOUTUBE_PATH = "M23.5 7.2a3 3 0 0 0-2.1-2.12C19.6 4.6 12 4.6 12 4.6s-7.6 0-9.4.48A3 3 0 0 0 .5 7.2C0 9 0 12 0 12s0 3 .5 4.8a3 3 0 0 0 2.1 2.12C4.4 19.4 12 19.4 12 19.4s7.6 0 9.4-.48a3 3 0 0 0 2.1-2.12C24 15 24 12 24 12s0-3-.5-4.8zM9.6 15.4V8.6L15.8 12l-6.2 3.4z";

function SocialIcon({ href, label, path }: { href: string; label: string; path: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="footer-social"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d={path} />
      </svg>
    </a>
  );
}

function FooterColumn({
  title, children, className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3
        className="font-mont uppercase tracking-[0.18em] mb-4 mt-6 md:mt-0"
        style={{ color: "var(--saffron)", fontWeight: 800, fontSize: "0.92rem" }}
      >
        {title}
      </h3>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}
