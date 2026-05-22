import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@/lib/services/session";
import { getParticipantById, getParticipants } from "@/lib/repositories/participantRepository";
import { getTeamById, getTeams } from "@/lib/repositories/teamRepository";
import { getJuryMemberById, getJuryMembers } from "@/lib/repositories/juryRepository";
import { getOrganizerById, getOrganizers } from "@/lib/repositories/organizerRepository";

// SessionContext — exposes the active session and the ability to switch
// between accounts. Two distinct switchers are surfaced:
//
//   · setRole(role)   — picks the first available account for that role.
//                       Used by the legacy quick-toggle.
//   · setActiveUser({ role, id })
//                     — picks a *specific* account. Used by the new
//                       account picker that lists every demo account
//                       from the seed.
//
// refresh() forces a re-read after a mutation that affects the cached
// session entity (e.g. tournament generation updating team.poolIdRoundX).

const STORAGE_KEY_ROLE = "mtym.demo.role";
const STORAGE_KEY_ID   = "mtym.demo.userId";

type Role = "participant" | "jury" | "organizer";

export interface ActiveUserSelection {
  role: Role;
  id: string;
}

interface SessionContextValue {
  session: Session | null;
  role: Role;
  /** Active user id (participant / jury / organizer). Null when no user has been picked explicitly. */
  activeUserId: string | null;
  setRole: (role: Role) => void;
  setActiveUser: (sel: ActiveUserSelection) => void;
  refresh: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(() => {
    const stored = localStorage.getItem(STORAGE_KEY_ROLE) as Role | null;
    return stored ?? "participant";
  });
  const [activeUserId, setActiveUserIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_ID);
  });

  const [session, setSession] = useState<Session | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setSession(buildSession(role, activeUserId));
  }, [role, activeUserId, version]);

  const setRole = (newRole: Role) => {
    localStorage.setItem(STORAGE_KEY_ROLE, newRole);
    // When the role changes via the quick toggle, drop the per-user
    // pin — we'll fall back to the first account of the new role.
    localStorage.removeItem(STORAGE_KEY_ID);
    setActiveUserIdState(null);
    setRoleState(newRole);
  };

  const setActiveUser = ({ role: newRole, id }: ActiveUserSelection) => {
    localStorage.setItem(STORAGE_KEY_ROLE, newRole);
    localStorage.setItem(STORAGE_KEY_ID, id);
    setRoleState(newRole);
    setActiveUserIdState(id);
  };

  const refresh = useCallback(() => setVersion(v => v + 1), []);

  return (
    <SessionContext.Provider value={{ session, role, activeUserId, setRole, setActiveUser, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

function buildSession(role: Role, activeUserId: string | null): Session | null {
  if (role === "participant") {
    // 1. If a specific participant is pinned, use them.
    const pinned = activeUserId ? getParticipantById(activeUserId) : undefined;
    const participants = getParticipants();
    if (participants.length === 0) return null;
    let p = pinned;
    if (!p) {
      const teams = getTeams();
      const creatorIds = new Set(teams.map(t => t.creatorId));
      p = participants.find(pp => creatorIds.has(pp.id)) ?? participants[0];
    }
    const team = getTeamById(p.teamId);
    if (!team) return null;
    return { role: "participant", participant: p, team };
  }
  if (role === "jury") {
    const pinned = activeUserId ? getJuryMemberById(activeUserId) : undefined;
    const jury = getJuryMembers();
    if (jury.length === 0) return null;
    return { role: "jury", juryMember: pinned ?? jury[0] };
  }
  const pinned = activeUserId ? getOrganizerById(activeUserId) : undefined;
  const orgs = getOrganizers();
  if (orgs.length === 0) return null;
  const admin = pinned ?? orgs.find(o => o.role === "admin") ?? orgs[0];
  return { role: "organizer", organizer: admin };
}
