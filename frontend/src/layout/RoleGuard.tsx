import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "@/features/shared/SessionContext";

// RoleGuard — route-level access control. Allowed roles are passed in;
// any other role is bounced to "/". This keeps participant routes truly
// inaccessible to organizer-mode and vice versa. Session resolution is a
// network round trip now, so loading/anonymous states are handled before
// the role check runs.

interface RoleGuardProps {
  allow: Array<"participant" | "jury" | "organizer">;
}

export function RoleGuard({ allow }: RoleGuardProps) {
  const { role, status } = useSession();

  if (status === "loading") {
    return <div className="py-24 text-center text-foreground/55">Chargement…</div>;
  }
  if (status === "anonymous" || !role || !allow.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
