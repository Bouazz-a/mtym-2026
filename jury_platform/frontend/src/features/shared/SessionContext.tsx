import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, getAuthToken, setAuthToken, UNAUTHORIZED_EVENT } from "@/lib/api/client";
import type { AuthUser, Role } from "@/types";

// SessionContext — the logged-in account, resolved from the stored token
// through GET /api/auth/me. Consumers must handle `status` before reading
// `user` (see RequireSession in App.tsx).

type SessionStatus = "loading" | "authenticated" | "anonymous";

interface SessionContextValue {
  user: AuthUser | null;
  role: Role | null;
  status: SessionStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>(() => (getAuthToken() ? "loading" : "anonymous"));

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setStatus("anonymous");
    queryClient.clear(); // never show one account's data to the next
  }, [queryClient]);

  useEffect(() => {
    if (!getAuthToken()) return;
    apiFetch<AuthUser>("/auth/me")
      .then((me) => {
        setUser(me);
        setStatus("authenticated");
      })
      .catch(logout);
  }, [logout]);

  // Token rejected mid-session (expired after 12h, account deleted…)
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: me } = await apiFetch<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setAuthToken(token);
    setUser(me);
    setStatus("authenticated");
  }, []);

  return (
    <SessionContext.Provider value={{ user, role: user?.role ?? null, status, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
