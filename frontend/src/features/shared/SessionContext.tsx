import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@/lib/services/session";
import { apiFetch, getAuthToken, setAuthToken } from "@/lib/api/client";
import type { Participant, Team, JuryMember, Organizer, UserRole } from "@/types";

// SessionContext — resolves the active session from a real backend login
// (the dev-login stub for now: sign in as any seeded user by email, no
// password — see backend/src/routes/dev-auth.ts). Session acquisition is
// now async (a network round trip), so consumers must handle `status`
// before reading `role`/`session` — see RoleGuard and HomeByRole in App.tsx.

interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  teamId?: string;
  organizerRole?: "admin" | "logistics" | "scientific";
}

export type SessionStatus = "loading" | "authenticated" | "anonymous";

interface SessionContextValue {
  session: Session | null;
  role: UserRole | null;
  status: SessionStatus;
  /** Dev-login stub: sign in as the seeded account with this email. */
  loginAsEmail: (email: string) => Promise<void>;
  logout: () => void;
  /** Re-fetch the session (e.g. after a mutation that changes it). */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// Builds the full Session shape the rest of the app expects from the
// flat AuthenticatedUser /auth/me returns. Talks to the API directly
// rather than through the repositories, which aren't async yet.
async function buildSession(user: AuthenticatedUser): Promise<Session | null> {
  if (user.role === "participant") {
    if (!user.teamId) return null;
    const [participant, team] = await Promise.all([
      apiFetch<Participant>(`/participants/${user.id}`),
      apiFetch<Team>(`/teams/${user.teamId}`),
    ]);
    return { role: "participant", participant, team };
  }
  if (user.role === "jury") {
    const juryMember = await apiFetch<JuryMember>(`/jury/${user.id}`);
    return { role: "jury", juryMember };
  }
  const organizer = await apiFetch<Organizer>(`/organizers/${user.id}`);
  return { role: "organizer", organizer };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  const load = useCallback(async () => {
    if (!getAuthToken()) {
      setSession(null);
      setStatus("anonymous");
      return;
    }
    setStatus("loading");
    try {
      const user = await apiFetch<AuthenticatedUser>("/auth/me");
      const built = await buildSession(user);
      setSession(built);
      setStatus(built ? "authenticated" : "anonymous");
    } catch {
      // Expired/invalid token, or user no longer resolvable — drop it.
      setAuthToken(null);
      setSession(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loginAsEmail = useCallback(
    async (email: string) => {
      const { token } = await apiFetch<{ token: string }>("/auth/dev-login", {
        method: "POST",
        body: { email },
      });
      setAuthToken(token);
      await load();
    },
    [load],
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setSession(null);
    setStatus("anonymous");
  }, []);

  return (
    <SessionContext.Provider
      value={{ session, role: session?.role ?? null, status, loginAsEmail, logout, refresh: load }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
