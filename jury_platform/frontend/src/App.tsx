import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { SessionProvider, useSession } from "@/features/shared/SessionContext";
import { LoginPage } from "@/features/shared/LoginPage";
import { PageLoading } from "@/features/shared/primitives";
import { AppLayout } from "@/layout/AppLayout";
import { JurorGuard, RoleGuard } from "@/layout/RoleGuard";

// Pages are loaded per route: jurors never download the admin screens.
const pages = {
  AdminDashboard: () => import("@/features/admin/AdminDashboard"),
  TournamentPage: () => import("@/features/admin/TournamentPage"),
  JuryPage: () => import("@/features/admin/JuryPage"),
  AccountsPage: () => import("@/features/admin/AccountsPage"),
  ResultsPage: () => import("@/features/admin/ResultsPage"),
  JournalPage: () => import("@/features/admin/JournalPage"),
  CriteriaPage: () => import("@/features/admin/CriteriaPage"),
  EvaluationsPage: () => import("@/features/admin/EvaluationsPage"),
  JuryDashboard: () => import("@/features/jury/JuryDashboard"),
  NotFoundPage: () => import("@/features/shared/NotFoundPage"),
  PracticePage: () => import("@/features/jury/PracticePage"),
  PassagePage: () => import("@/features/jury/PassagePage"),
  ConvocationsPage: () => import("@/features/admin/ConvocationsPage"),
  ReportAssignmentPage: () => import("@/features/admin/ReportAssignmentPage"),
  MyReportsPage: () => import("@/features/jury/MyReportsPage"),
  AssignedReportPage: () => import("@/features/jury/AssignedReportPage"),
  ResetPasswordPage: () => import("@/features/shared/ResetPasswordPage"),
};
const AdminDashboard = lazy(() => pages.AdminDashboard().then((m) => ({ default: m.AdminDashboard })));
const TournamentPage = lazy(() => pages.TournamentPage().then((m) => ({ default: m.TournamentPage })));
const JuryPage = lazy(() => pages.JuryPage().then((m) => ({ default: m.JuryPage })));
const AccountsPage = lazy(() => pages.AccountsPage().then((m) => ({ default: m.AccountsPage })));
const ResultsPage = lazy(() => pages.ResultsPage().then((m) => ({ default: m.ResultsPage })));
const JournalPage = lazy(() => pages.JournalPage().then((m) => ({ default: m.JournalPage })));
const CriteriaPage = lazy(() => pages.CriteriaPage().then((m) => ({ default: m.CriteriaPage })));
const EvaluationsPage = lazy(() => pages.EvaluationsPage().then((m) => ({ default: m.EvaluationsPage })));
const JuryDashboard = lazy(() => pages.JuryDashboard().then((m) => ({ default: m.JuryDashboard })));
const NotFoundPage = lazy(() => pages.NotFoundPage().then((m) => ({ default: m.NotFoundPage })));
const PracticePage = lazy(() => pages.PracticePage().then((m) => ({ default: m.PracticePage })));
const PassagePage = lazy(() => pages.PassagePage().then((m) => ({ default: m.PassagePage })));
const ConvocationsPage = lazy(() => pages.ConvocationsPage().then((m) => ({ default: m.ConvocationsPage })));
const ReportAssignmentPage = lazy(() => pages.ReportAssignmentPage().then((m) => ({ default: m.ReportAssignmentPage })));
const MyReportsPage = lazy(() => pages.MyReportsPage().then((m) => ({ default: m.MyReportsPage })));
const AssignedReportPage = lazy(() => pages.AssignedReportPage().then((m) => ({ default: m.AssignedReportPage })));
const ResetPasswordPage = lazy(() => pages.ResetPasswordPage().then((m) => ({ default: m.ResetPasswordPage })));

// Once signed in, the other pages' code is fetched in the background (when
// the browser is idle): moving to a page then never waits for a download.
// A juror only ever gets the juror pages.
const ADMIN_PAGES = [pages.AdminDashboard, pages.TournamentPage, pages.JuryPage, pages.AccountsPage, pages.ResultsPage, pages.JournalPage, pages.CriteriaPage, pages.EvaluationsPage, pages.ConvocationsPage, pages.ReportAssignmentPage];
const JUROR_PAGES = [pages.NotFoundPage, pages.JuryDashboard, pages.PracticePage, pages.PassagePage, pages.MyReportsPage, pages.AssignedReportPage];

function usePreloadPages(role: "admin" | "jury" | undefined) {
  useEffect(() => {
    if (!role) return;
    const load = () => [...(role === "admin" ? ADMIN_PAGES : []), ...JUROR_PAGES].forEach((page) => page().catch(() => {}));
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(load, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(load, 1500);
    return () => window.clearTimeout(id);
  }, [role]);
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route element={<AppLayout />}>
              {/* The « Mot de passe oublié » link: no session needed */}
              <Route path="mot-de-passe" element={<ResetPasswordPage />} />
              <Route element={<RequireSession />}>
                <Route index element={<HomeByRole />} />
                <Route element={<RoleGuard allow={["admin"]} />}>
                  <Route path="tournoi" element={<TournamentPage />} />
                  <Route path="jury" element={<JuryPage />} />
                  <Route path="rapports" element={<ReportAssignmentPage />} />
                  <Route path="convocations" element={<ConvocationsPage />} />
                  <Route path="criteres" element={<CriteriaPage />} />
                  <Route path="notes" element={<EvaluationsPage />} />
                  <Route path="resultats" element={<ResultsPage />} />
                  <Route path="comptes" element={<AccountsPage />} />
                  <Route path="journal" element={<JournalPage />} />
                </Route>
                {/* Jury accounts, and admins who also judge (their planning
                    is /mon-planning: their home is the admin dashboard) */}
                <Route element={<JurorGuard />}>
                  <Route path="mon-planning" element={<JuryDashboard />} />
                  <Route path="passages/:passageId" element={<PassagePage />} />
                  <Route path="entrainement" element={<PracticePage />} />
                  <Route path="mes-rapports" element={<MyReportsPage />} />
                  <Route path="mes-rapports/:reportId" element={<AssignedReportPage />} />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
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
  const { status, role } = useSession();
  usePreloadPages(status === "authenticated" ? role ?? undefined : undefined);
  if (status === "loading") return <PageLoading />;
  if (status === "anonymous") return <LoginPage />;
  return <Outlet />;
}

function HomeByRole() {
  const { role } = useSession();
  return role === "admin" ? <AdminDashboard /> : <JuryDashboard />;
}
