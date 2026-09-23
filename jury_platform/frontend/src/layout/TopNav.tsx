import { useEffect, useId, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "@/features/shared/SessionContext";
import { MtymLogo } from "@/features/shared/widgets";
import { Popover } from "@/features/shared/primitives";
import { ChangePasswordModal } from "@/features/shared/ChangePasswordModal";
import { ChevronDownIcon } from "@/features/shared/icons";
import { isCurrentPage, isNavMenu, NAV, navPages, ROLE_LABEL, type NavItem, type NavMenu } from "./navigation";

// TopNav — fixed dark top bar. Brand on the left, nav links and menus in
// the middle, account menu on the right (also carries the links on small
// screens).

export function TopNav() {
  const { user, logout } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openNavMenu, setOpenNavMenu] = useState<string | null>(null); // one dropdown at a time
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
      <div className="h-full shell flex items-center justify-between">
        <button onClick={() => navigate("/")} className="flex items-center gap-3 group" aria-label="Accueil">
          <MtymLogo size="1.75rem" />
          {/* Hidden between lg and xl, where the inline links need its room */}
          <div
            className="hidden sm:block lg:hidden xl:block font-mont text-micro uppercase tracking-[0.22em] pl-3"
            style={{
              color: "rgba(244,236,216,0.55)",
              fontWeight: 500,
              borderLeft: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            Jury · 2026
          </div>
        </button>

        {/* Inline from lg; below that the links live in the account menu */}
        <div className="hidden lg:flex items-center gap-6">
          {items.map((entry) =>
            isNavMenu(entry) ? (
              <NavMenuButton
                key={entry.label}
                menu={entry}
                open={openNavMenu === entry.label}
                onOpenChange={(open) => setOpenNavMenu((cur) => (open ? entry.label : cur === entry.label ? null : cur))}
              />
            ) : (
              <NavItemLink key={entry.to} item={entry} />
            ),
          )}
        </div>

        {user && (
          <div className="flex items-center gap-3">
            <button
              ref={chipRef}
              data-tour="account-menu"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-3 pl-3 pr-2 py-1.5 transition-colors"
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                background: menuOpen ? "rgba(255,255,255,0.06)" : "transparent",
              }}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
            >
              {/* The name leaves the inline links room between lg and xl;
                  it's still in the menu */}
              <div className="hidden md:block lg:hidden xl:block text-right">
                <div
                  className="font-mont text-tiny uppercase tracking-wider truncate"
                  style={{ color: "var(--paper)", fontWeight: 700, maxWidth: "10rem" }}
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
                  width: "2rem", height: "2rem",
                  background: "var(--saffron)", color: "var(--forest)",
                  fontSize: "0.78rem", fontWeight: 900,
                }}
              >
                {initials}
              </div>
              <ChevronDownIcon
                size="0.75rem"
                style={{ color: "rgba(244,236,216,0.55)", transition: "transform 180ms", transform: menuOpen ? "rotate(180deg)" : "none" }}
              />
            </button>

            <Popover open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={chipRef} width={17.5}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="font-mont text-sm truncate" style={{ color: "var(--forest)", fontWeight: 800 }}>
                  {user.firstName} {user.lastName}
                </div>
                <div className="font-open text-xs truncate" style={{ color: "var(--ink-soft)" }}>{user.email}</div>
              </div>
              <div className="lg:hidden py-1" style={{ borderBottom: "1px solid var(--border)" }}>
                {items.map((entry, i) => {
                  // One rule on each side of a menu's pages, never two in a row
                  const rule = i > 0 && (isNavMenu(entry) || isNavMenu(items[i - 1])) ? { borderTop: "1px solid var(--border)" } : undefined;
                  return isNavMenu(entry) ? (
                    <div key={entry.label} style={rule}>
                      <MenuSections menu={entry} onPick={(to) => { setMenuOpen(false); navigate(to); }} />
                    </div>
                  ) : (
                    <div key={entry.to} style={rule}>
                      <MenuButton active={isCurrentPage(entry.to, pathname)} onClick={() => { setMenuOpen(false); navigate(entry.to); }}>
                        {entry.label}
                      </MenuButton>
                    </div>
                  );
                })}
              </div>
              <div className="py-1">
                {user.role === "jury" && (
                  <MenuButton onClick={() => { setMenuOpen(false); navigate("/?guide=1"); }}>
                    Guide du juré
                  </MenuButton>
                )}
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

// A top-bar entry that opens its pages in a dropdown. Lit like a link when
// one of its pages is the current one.
//
// Mouse: hovering the button opens the menu, leaving the button and the
// panel closes it. A click toggles it, and a click on a menu opened by
// hovering keeps it open until the next click, Escape or a click outside.
//
// Keyboard (disclosure pattern): Enter/Space toggles, ↓ opens on the first
// page; inside, ↑/↓/Home/End move between pages, Escape closes and gives
// the focus back, and tabbing out closes.
const HOVER_OPEN_DELAY = 100; // ms: sweeping across the bar doesn't flash menus open
const HOVER_CLOSE_DELAY = 200; // ms: time to reach the panel below the button

function NavMenuButton({ menu, open, onOpenChange }: { menu: NavMenu; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { pathname } = useLocation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusFirstOnOpen = useRef(false);
  // Opened (or kept open) by a click or the keyboard: the mouse leaving no longer closes it
  const pinned = useRef(false);
  const hoverTimer = useRef<number | undefined>(undefined);
  const panelId = useId();
  const active = navPages([menu]).some((item) => isCurrentPage(item.to, pathname));

  // The panel mounts after `open` flips (Popover measures first)
  useEffect(() => {
    if (!open) pinned.current = false;
    if (!open || !focusFirstOnOpen.current) return;
    focusFirstOnOpen.current = false;
    requestAnimationFrame(() => panelRef.current?.querySelector("a")?.focus());
  }, [open]);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const close = (refocus: boolean) => {
    onOpenChange(false);
    if (refocus) buttonRef.current?.focus();
  };

  // Mouse only: a tap also fires pointerenter, right before its click
  const onPointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(hoverTimer.current);
    if (!open) hoverTimer.current = window.setTimeout(() => onOpenChange(true), HOVER_OPEN_DELAY);
  };
  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(hoverTimer.current);
    if (open && !pinned.current) hoverTimer.current = window.setTimeout(() => onOpenChange(false), HOVER_CLOSE_DELAY);
  };

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    const links = [...(panelRef.current?.querySelectorAll("a") ?? [])];
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    const target =
      e.key === "ArrowDown" ? links[(at + 1) % links.length]
      : e.key === "ArrowUp" ? links[(at - 1 + links.length) % links.length]
      : e.key === "Home" ? links[0]
      : e.key === "End" ? links[links.length - 1]
      : null;
    if (target) {
      e.preventDefault();
      target.focus();
    } else if (e.key === "Escape") {
      close(true);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onClick={() => {
          window.clearTimeout(hoverTimer.current);
          if (open && !pinned.current) pinned.current = true;
          else {
            pinned.current = !open;
            onOpenChange(!open);
          }
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown") return;
          e.preventDefault();
          pinned.current = true;
          if (open) panelRef.current?.querySelector("a")?.focus();
          else {
            focusFirstOnOpen.current = true;
            onOpenChange(true);
          }
        }}
        className="nav-menu-trigger flex items-center gap-1.5 font-mont text-tiny uppercase tracking-[0.14em] whitespace-nowrap transition-colors"
        style={{
          color: active ? "var(--saffron)" : open ? "var(--paper)" : "rgba(244,236,216,0.62)",
          fontWeight: active ? 800 : 600,
        }}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        {menu.label}
        <ChevronDownIcon size="0.75rem" style={{ transition: "transform 180ms", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      <Popover open={open} onClose={() => onOpenChange(false)} anchorRef={buttonRef} align="left" width={18}>
        <div
          ref={panelRef}
          id={panelId}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onKeyDown={onPanelKeyDown}
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (next && !e.currentTarget.contains(next) && next !== buttonRef.current) close(false);
          }}
        >
          {menu.sections.map((section, i) => (
            <div key={section.title ?? i} className="py-1.5" style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}>
              {section.title && (
                <div className="px-4 pt-1.5 pb-1 font-mont text-micro uppercase tracking-widest" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
                  {section.title}
                </div>
              )}
              <ul>
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.to === "/"} onClick={() => close(false)} className="nav-menu-item">
                      {({ isActive }) => (
                        <>
                          <span className="block font-mont text-sm" style={{ color: "var(--forest)", fontWeight: isActive ? 900 : 700 }}>
                            {item.label}
                          </span>
                          {item.description && (
                            <span className="block font-open text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                              {item.description}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Popover>
    </>
  );
}

// A menu's sections: a title (if any), then its pages, the current one lit
function MenuSections({ menu, onPick }: { menu: NavMenu; onPick: (to: string) => void }) {
  const { pathname } = useLocation();
  return menu.sections.map((section, i) => (
    <div key={section.title ?? i} className="py-1" style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}>
      {section.title && (
        <div className="px-4 pt-2 pb-1 font-mont text-micro uppercase tracking-widest" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
          {section.title}
        </div>
      )}
      {section.items.map((item) => (
        <MenuButton key={item.to} active={isCurrentPage(item.to, pathname)} onClick={() => onPick(item.to)}>
          {item.label}
        </MenuButton>
      ))}
    </div>
  ));
}

function MenuButton({
  children,
  onClick,
  danger = false,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="w-full px-4 py-2 text-left font-mont text-xs uppercase tracking-widest hover-row transition-colors"
      style={{
        color: danger ? "var(--clay)" : active ? "var(--forest)" : "var(--ink)",
        fontWeight: active ? 900 : 700,
        background: active ? "var(--paper-2)" : undefined,
      }}
    >
      {children}
    </button>
  );
}
