import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "@/features/shared/SessionContext";

// RoleGuard — route-level access control. Allowed roles are passed in;
// any other role is bounced to "/". This keeps participant routes truly
// inaccessible to organizer-mode and vice versa.

interface RoleGuardProps {
  allow: Array<"participant" | "jury" | "organizer">;
}

export function RoleGuard({ allow }: RoleGuardProps) {
  const { role } = useSession();
  if (!allow.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
