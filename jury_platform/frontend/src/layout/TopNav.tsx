import { useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useSession } from "@/features/shared/SessionContext";
import { MtymLogo } from "@/features/shared/widgets";
import { Popover } from "@/features/shared/primitives";
import { ChangePasswordModal } from "@/features/shared/ChangePasswordModal";
import { NAV, ROLE_LABEL, type NavItem } from "./navigation";

// TopNav — fixed dark top bar. Brand on the left, nav links in the middle,
// account menu on the right (also carries the links on small screens).

export function TopNav() {
  const { user, logout } = useSession();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);

  const items = user ? NAV[user.role] : [];
  const initials = user ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() : "";

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-16"
      style={{
        background: "var(--forest)",
        color: "var(--paper)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="h-full max-w-[1600px] mx-auto px-6 lg:px-12 flex items-center justify-between">
        <button onClick={() => navigate("/")} className="flex items-center gap-3 group" aria-label="Accueil">
          <MtymLogo size={22} />
          {/* Hidden between xl and 1400px, where the inline links need its room */}
          <div
            className="hidden sm:block xl:hidden min-[1400px]:block font-mont text-micro uppercase tracking-[0.22em] pl-3"
            style={{
              color: "rgba(244,236,216,0.55)",
              fontWeight: 500,
              borderLeft: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            Jury · 2026
          </div>
        </button>

        {/* Inline from xl: below, the zoomed page is too narrow and the links
            live in the account menu */}
        <div className="hidden xl:flex items-center gap-6">
          {items.map((item) => (
            <NavItemLink key={item.to} item={item} />
          ))}
        </div>

        {user && (
          <div className="flex items-center gap-3">
            <button
              ref={chipRef}
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-3 pl-3 pr-2 py-1.5 transition-colors"
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                background: menuOpen ? "rgba(255,255,255,0.06)" : "transparent",
              }}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
            >
              <div className="hidden md:block text-right">
                <div
                  className="font-mont text-tiny uppercase tracking-wider truncate"
                  style={{ color: "var(--paper)", fontWeight: 700, maxWidth: 160 }}
                >
                  {user.firstName} {user.lastName}
                </div>
                <div
                  className="font-mont text-micro uppercase tracking-widest"
                  style={{ color: "rgba(244,236,216,0.50)", fontWeight: 600 }}
                >
                  {ROLE_LABEL[user.role]}
                </div>
              </div>
              <div
                className="flex items-center justify-center font-mont"
                style={{
                  width: 32, height: 32,
                  background: "var(--saffron)", color: "var(--forest)",
                  fontSize: "0.78rem", fontWeight: 900,
                }}
              >
                {initials}
              </div>
              <ChevronIcon open={menuOpen} />
            </button>

            <Popover open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={chipRef} width={280}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="font-mont text-sm truncate" style={{ color: "var(--forest)", fontWeight: 800 }}>
                  {user.firstName} {user.lastName}
                </div>
                <div className="font-open text-xs truncate" style={{ color: "var(--ink-soft)" }}>{user.email}</div>
              </div>
              <ul className="xl:hidden py-1" style={{ borderBottom: "1px solid var(--border)" }}>
                {items.map((item) => (
                  <li key={item.to}>
                    <MenuButton onClick={() => { setMenuOpen(false); navigate(item.to); }}>{item.label}</MenuButton>
                  </li>
                ))}
              </ul>
              <div className="py-1">
                <MenuButton onClick={() => { setMenuOpen(false); setPasswordOpen(true); }}>
                  Changer le mot de passe
                </MenuButton>
                <MenuButton danger onClick={() => { setMenuOpen(false); logout(); navigate("/"); }}>
                  Se déconnecter
                </MenuButton>
              </div>
            </Popover>
            {passwordOpen && <ChangePasswordModal onClose={() => setPasswordOpen(false)} />}
          </div>
        )}
      </div>
    </nav>
  );
}

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className="font-mont text-tiny uppercase tracking-[0.14em] whitespace-nowrap transition-colors"
      style={({ isActive }) => ({
        color: isActive ? "var(--saffron)" : "rgba(244,236,216,0.62)",
        fontWeight: isActive ? 800 : 600,
      })}
    >
      {item.label}
    </NavLink>
  );
}

function MenuButton({ children, onClick, danger = false }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2 text-left font-mont text-xs uppercase tracking-widest hover-row transition-colors"
      style={{ color: danger ? "var(--clay)" : "var(--ink)", fontWeight: 700 }}
    >
      {children}
    </button>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{
        color: "rgba(244,236,216,0.55)",
        transition: "transform 180ms",
        transform: open ? "rotate(180deg)" : "none",
      }}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
