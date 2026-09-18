import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "@/features/shared/SessionContext";
import type { Role } from "@/types";

// RoleGuard — route-level access control: any other role is bounced to "/".
// The backend enforces the same rules; this only keeps the UI coherent.
// Rendered inside RequireSession, so the session is already resolved.

export function RoleGuard({ allow }: { allow: Role[] }) {
  const { role } = useSession();
  if (!role || !allow.includes(role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
