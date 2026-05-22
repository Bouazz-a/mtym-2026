import { useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useSession } from "@/features/shared/SessionContext";
import { MtymLogo } from "@/features/shared/widgets";
import { Popover } from "@/features/shared/primitives";
import { getAnnouncements } from "@/lib/repositories/announcementRepository";
import { getParticipants } from "@/lib/repositories/participantRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getJuryMembers } from "@/lib/repositories/juryRepository";
import { getOrganizers } from "@/lib/repositories/organizerRepository";
import type { UserRole } from "@/types";

// TopNav — fixed dark top bar. Brand on the left (just the MTYM logo +
// "Édition 2026"), nav links in the middle, account picker on the right.

interface NavItem { to: string; label: string }

const NAV: Record<UserRole, NavItem[]> = {
  participant: [
    { to: "/annonces", label: "Annonces" },
    { to: "/profil", label: "Infos personnelles" },
    { to: "/", label: "Espace tournoi" },
  ],
  jury: [
    { to: "/annonces", label: "Annonces" },
    { to: "/equipes", label: "Mes équipes" },
    { to: "/passages", label: "Passages" },
    { to: "/", label: "Tableau de bord" },
  ],
  organizer: [
    { to: "/annonces", label: "Annonces" },
    { to: "/tournoi", label: "Tournoi" },
    { to: "/equipes", label: "Équipes" },
    { to: "/jury", label: "Jury" },
    { to: "/documents", label: "Documents" },
    { to: "/administration", label: "Administration" },
    { to: "/", label: "Tableau de bord" },
  ],
};

export function TopNav() {
  const { session, role, setActiveUser } = useSession();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const userChipRef = useRef<HTMLButtonElement>(null);

  const items = NAV[role] ?? [];
  const audienceFilter = role === "organizer"
    ? () => true
    : (a: { audience: string }) => a.audience === "all" || a.audience === role + "s";
  const annCount = getAnnouncements().filter(audienceFilter).length;

  const userName = !session
    ? "—"
    : session.role === "participant"
      ? `${session.participant.firstName} ${session.participant.lastName}`
      : session.role === "jury"
        ? `${session.juryMember.firstName} ${session.juryMember.lastName}`
        : `${session.organizer.firstName} ${session.organizer.lastName}`;

  const userInitials = userName
    .split(/\s+/)
    .map(s => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const userSub = !session
    ? ""
    : session.role === "participant"
      ? session.team.quadrigramme
      : session.role === "jury"
        ? (session.juryMember.city ?? "Jury")
        : session.organizer.role.toUpperCase();

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
        {/* Brand — just the logo + edition mark, no M letter */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-3 group"
          aria-label="MTYM accueil"
        >
          <MtymLogo size={22} color="var(--paper)" colorMap="var(--saffron)" />
          <div
            className="hidden sm:block font-mont text-micro uppercase tracking-[0.22em] pl-3"
            style={{
              color: "rgba(244,236,216,0.55)",
              fontWeight: 500,
              borderLeft: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            Édition 2026
          </div>
        </button>

        {/* Nav links */}
        <div className="hidden lg:flex items-center gap-7">
          {items.map(item => (
            <NavLink
              key={item.to + item.label}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `font-mont text-tiny uppercase tracking-[0.14em] transition-colors flex items-center gap-2 ${
                  isActive ? "" : "hover:opacity-100"
                }`
              }
              style={({ isActive }) => ({
                color: isActive ? "var(--saffron)" : "rgba(244,236,216,0.62)",
                fontWeight: isActive ? 800 : 600,
              })}
            >
              {item.label}
              {item.to === "/annonces" && annCount > 0 && (
                <span
                  className="font-mont text-micro px-1.5 py-0.5"
                  style={{
                    background: "rgba(246,168,6,0.18)",
                    color: "var(--saffron)",
                    border: "1px solid rgba(246,168,6,0.4)",
                    fontWeight: 800,
                  }}
                >
                  {annCount}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        {/* Right cluster: account chip */}
        <div className="flex items-center gap-3">
          {/* Account chip (opens picker) */}
          <button
            ref={userChipRef}
            onClick={() => setPickerOpen(o => !o)}
            className="flex items-center gap-3 pl-3 pr-2 py-1.5 transition-colors"
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              background: pickerOpen ? "rgba(255,255,255,0.06)" : "transparent",
            }}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
          >
            <div className="hidden md:block text-right">
              <div
                className="font-mont text-tiny uppercase tracking-wider truncate"
                style={{ color: "var(--paper)", fontWeight: 700, maxWidth: 160 }}
              >
                {userName}
              </div>
              {userSub && (
                <div
                  className="font-mont text-micro uppercase tracking-widest"
                  style={{ color: "rgba(244,236,216,0.50)", fontWeight: 600 }}
                >
                  {userSub}
                </div>
              )}
            </div>
            <div
              className="flex items-center justify-center font-mont"
              style={{
                width: 32, height: 32,
                background: "var(--saffron)", color: "var(--forest)",
                fontSize: "0.78rem", fontWeight: 900,
              }}
            >
              {userInitials}
            </div>
            <ChevronIcon open={pickerOpen} />
          </button>

          <Popover open={pickerOpen} onClose={() => setPickerOpen(false)} anchorRef={userChipRef} width={360}>
            <AccountPicker
              currentRole={role}
              currentId={
                session?.role === "participant" ? session.participant.id
                : session?.role === "jury" ? session.juryMember.id
                : session?.role === "organizer" ? session.organizer.id
                : null
              }
              onPick={(sel) => {
                setActiveUser(sel);
                setPickerOpen(false);
              }}
            />
          </Popover>
        </div>
      </div>
    </nav>
  );
}

// ─── Account picker (popover contents) ────────────────────────────────

function AccountPicker({
  currentRole, currentId, onPick,
}: {
  currentRole: UserRole;
  currentId: string | null;
  onPick: (sel: { role: UserRole; id: string }) => void;
}) {
  const data = useMemo(() => {
    const teams = new Map(getTeams().map(t => [t.id, t]));
    const participants = getParticipants()
      .map(p => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        sub: teams.get(p.teamId)
          ? `${teams.get(p.teamId)!.quadrigramme} · ${teams.get(p.teamId)!.name}`
          : "—",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const jury = getJuryMembers()
      .map(j => ({ id: j.id, name: `${j.firstName} ${j.lastName}`, sub: j.city ?? "Jury" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const organizers = getOrganizers()
      .map(o => ({ id: o.id, name: `${o.firstName} ${o.lastName}`, sub: o.role.toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { participants, jury, organizers };
  }, []);

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (s: string) => !q || s.toLowerCase().includes(q);

  const filteredParticipants = data.participants.filter(p => matches(p.name) || matches(p.sub));
  const filteredJury = data.jury.filter(j => matches(j.name) || matches(j.sub));
  const filteredOrganizers = data.organizers.filter(o => matches(o.name));

  return (
    <div className="flex flex-col" style={{ maxHeight: 480 }}>
      <div className="p-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher un compte de démo…"
          className="w-full px-3 py-1.5 text-sm font-open focus-ring"
          style={{
            background: "var(--paper)",
            border: "1px solid var(--border)",
            color: "var(--ink)",
          }}
          autoFocus
        />
      </div>
      <div className="flex-1 overflow-auto">
        <Group
          label={`Participants · ${filteredParticipants.length}`}
          rows={filteredParticipants}
          role="participant"
          currentRole={currentRole}
          currentId={currentId}
          onPick={onPick}
        />
        <Group
          label={`Jury · ${filteredJury.length}`}
          rows={filteredJury}
          role="jury"
          currentRole={currentRole}
          currentId={currentId}
          onPick={onPick}
        />
        <Group
          label={`Organisateurs · ${filteredOrganizers.length}`}
          rows={filteredOrganizers}
          role="organizer"
          currentRole={currentRole}
          currentId={currentId}
          onPick={onPick}
        />
      </div>
    </div>
  );
}

function Group({
  label, rows, role, currentRole, currentId, onPick,
}: {
  label: string;
  rows: { id: string; name: string; sub: string }[];
  role: UserRole;
  currentRole: UserRole;
  currentId: string | null;
  onPick: (sel: { role: UserRole; id: string }) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="py-2">
      <div className="px-4 pb-1.5 font-mont text-micro uppercase tracking-[0.18em]"
           style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
        {label}
      </div>
      <ul>
        {rows.map(r => {
          const active = role === currentRole && r.id === currentId;
          return (
            <li key={`${role}-${r.id}`}>
              <button
                onClick={() => onPick({ role, id: r.id })}
                className="w-full px-4 py-2 text-left flex items-center justify-between gap-3 transition-colors"
                style={{
                  background: active ? "rgba(246,168,6,0.10)" : "transparent",
                  borderLeft: active ? "2px solid var(--saffron)" : "2px solid transparent",
                }}
              >
                <div className="min-w-0">
                  <div className="font-mont text-sm truncate"
                       style={{ color: active ? "var(--forest)" : "var(--ink)", fontWeight: active ? 800 : 600 }}>
                    {r.name}
                  </div>
                  <div className="font-mont text-micro uppercase tracking-widest truncate"
                       style={{ color: "var(--ink-faint)", fontWeight: 600 }}>
                    {r.sub}
                  </div>
                </div>
                {active && (
                  <span className="font-mont text-micro uppercase tracking-widest shrink-0 px-1.5 py-0.5"
                        style={{ background: "var(--saffron)", color: "var(--forest)", fontWeight: 900 }}>
                    Actif
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
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
