import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { SessionProvider, useSession } from "@/features/shared/SessionContext";
import { LoginPage } from "@/features/shared/LoginPage";
import { PageLoading } from "@/features/shared/primitives";
import { AppLayout } from "@/layout/AppLayout";
import { RoleGuard } from "@/layout/RoleGuard";

// Pages are loaded per route: jurors never download the admin screens.
const AdminDashboard = lazy(() =>
  import("@/features/admin/AdminDashboard").then((m) => ({ default: m.AdminDashboard })),
);
const TournamentPage = lazy(() =>
  import("@/features/admin/TournamentPage").then((m) => ({ default: m.TournamentPage })),
);
const JuryPage = lazy(() => import("@/features/admin/JuryPage").then((m) => ({ default: m.JuryPage })));
const AccountsPage = lazy(() =>
  import("@/features/admin/AccountsPage").then((m) => ({ default: m.AccountsPage })),
);
const CriteriaPage = lazy(() =>
  import("@/features/admin/CriteriaPage").then((m) => ({ default: m.CriteriaPage })),
);
const EvaluationsPage = lazy(() =>
  import("@/features/admin/EvaluationsPage").then((m) => ({ default: m.EvaluationsPage })),
);
const JuryDashboard = lazy(() =>
  import("@/features/jury/JuryDashboard").then((m) => ({ default: m.JuryDashboard })),
);
const PassagePage = lazy(() =>
  import("@/features/jury/PassagePage").then((m) => ({ default: m.PassagePage })),
);

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route element={<RequireSession />}>
                <Route index element={<HomeByRole />} />
                <Route element={<RoleGuard allow={["admin"]} />}>
                  <Route path="tournoi" element={<TournamentPage />} />
                  <Route path="jury" element={<JuryPage />} />
                  <Route path="criteres" element={<CriteriaPage />} />
                  <Route path="notes" element={<EvaluationsPage />} />
                  <Route path="comptes" element={<AccountsPage />} />
                </Route>
                <Route element={<RoleGuard allow={["jury"]} />}>
                  <Route path="passages/:passageId" element={<PassagePage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </SessionProvider>
  );
}

// Every page needs an account: anonymous visitors get the login form.
function RequireSession() {
  const { status } = useSession();
  if (status === "loading") return <PageLoading />;
  if (status === "anonymous") return <LoginPage />;
  return <Outlet />;
}

function HomeByRole() {
  const { role } = useSession();
  return role === "admin" ? <AdminDashboard /> : <JuryDashboard />;
}


function NotFound() {
  return (
    <div className="py-24 text-center">
      <div className="font-mont text-4xl mb-3" style={{ color: "var(--forest)", fontWeight: 900 }}>404</div>
      <div className="font-open text-sm" style={{ color: "var(--ink-soft)" }}>Cette page n'existe pas.</div>
    </div>
  );
}
