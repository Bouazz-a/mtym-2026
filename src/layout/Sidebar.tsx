import { NavLink } from "react-router-dom";
import { useSession } from "@/features/shared/SessionContext";
import { MtymLogo, MoroccoWatermark } from "@/features/shared/widgets";

// Sidebar — deep forest rail. Logo + role-adaptive nav with editorial
// micro-typography. The active link gets a saffron text + bar; inactive
// links subtly brighten on hover. A Morocco-silhouette watermark at the
// bottom gives the rail its soul.

interface NavItem {
  to: string;
  label: string;
  hint?: string;
}

const NAV: Record<string, NavItem[]> = {
  participant: [
    { to: "/", label: "Mon parcours", hint: "Pools & passages" },
    { to: "/documents", label: "Documents", hint: "Rapports & fiches" },
    { to: "/annonces", label: "Annonces", hint: "Communications" },
    { to: "/profil", label: "Profil", hint: "Mes infos" },
  ],
  jury: [
    { to: "/", label: "Tableau de bord" },
    { to: "/equipes", label: "Mes équipes", hint: "Assignations" },
    { to: "/passages", label: "Passages", hint: "Évaluations" },
  ],
  organizer: [
    { to: "/", label: "Tableau de bord" },
    { to: "/tournoi", label: "Tournoi", hint: "Poules & passages" },
    { to: "/equipes", label: "Équipes", hint: "Liste & gestion" },
    { to: "/documents", label: "Documents", hint: "Dépôts d'équipes" },
    { to: "/annonces", label: "Annonces", hint: "Communications" },
  ],
};

export function Sidebar() {
  const { role } = useSession();
  const items = NAV[role] ?? [];

  return (
    <aside
      className="w-64 shrink-0 flex flex-col relative overflow-hidden"
      style={{
        background: "var(--forest)",
        color: "var(--paper)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Subtle watermark for atmosphere */}
      <MoroccoWatermark size={420} opacity={0.04} bottom={-100} left={-80} color="var(--saffron)" />

      {/* Logo block */}
      <div className="relative px-7 py-7" style={{ borderBottom: "1px solid rgba(244,236,216,0.12)" }}>
        <MtymLogo size={26} />
        <div
          className="font-mont text-tiny uppercase tracking-widest mt-3"
          style={{ color: "rgba(244,236,216,0.5)", fontWeight: 600 }}
        >
          Édition 2026
        </div>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 px-3 py-6 space-y-0.5">
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `group relative block px-3 py-2.5 transition-colors duration-200 ${
                isActive ? "" : "hover:bg-white/[0.04]"
              }`
            }
            style={({ isActive }) =>
              isActive ? { background: "rgba(246,168,6,0.10)" } : undefined
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 transition-all duration-200"
                  style={{
                    width: isActive ? 3 : 0,
                    height: 26,
                    background: "var(--saffron)",
                  }}
                  aria-hidden
                />
                <div className="ml-2">
                  <div
                    className="font-mont text-sm transition-colors"
                    style={{
                      color: isActive ? "var(--saffron)" : "var(--paper)",
                      fontWeight: isActive ? 700 : 500,
                    }}
                  >
                    {item.label}
                  </div>
                  {item.hint && (
                    <div
                      className="font-mont text-micro uppercase tracking-widest mt-0.5"
                      style={{
                        color: isActive ? "rgba(246,168,6,0.6)" : "rgba(244,236,216,0.45)",
                        fontWeight: 600,
                      }}
                    >
                      {item.hint}
                    </div>
                  )}
                </div>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer badge */}
      <div className="relative px-7 py-5" style={{ borderTop: "1px solid rgba(244,236,216,0.12)" }}>
        <div
          className="flex items-center gap-2 font-mont text-tiny uppercase tracking-widest"
          style={{ color: "rgba(244,236,216,0.55)", fontWeight: 600 }}
        >
          <span style={{ color: "var(--saffron)" }}>◆</span>
          Math&amp;Maroc
        </div>
      </div>
    </aside>
  );
}
