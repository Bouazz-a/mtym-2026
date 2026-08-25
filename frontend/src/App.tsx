import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SessionProvider, useSession } from "@/features/shared/SessionContext";
import { AppLayout } from "@/layout/AppLayout";
import { RoleGuard } from "@/layout/RoleGuard";

// Route-level code splitting: each page is fetched (and its module graph
// evaluated) only when its route is actually visited. This matters right
// now beyond bundle size — during the ongoing backend integration, some
// feature areas are mid-conversion and would throw at module-load time if
// eagerly imported here, which used to take the *entire* app down on any
// page. Lazy-loading contains that blast radius to the broken route.
const ParcoursPage = lazy(() =>
  import("@/features/participant/ParcoursPage").then((m) => ({ default: m.ParcoursPage })),
);
const ParticipantDocumentsPage = lazy(() =>
  import("@/features/participant/DocumentsPage").then((m) => ({ default: m.DocumentsPage })),
);
const PassageDetailPage = lazy(() =>
  import("@/features/participant/PassageDetailPage").then((m) => ({ default: m.PassageDetailPage })),
);
const ProfilPage = lazy(() =>
  import("@/features/participant/ProfilPage").then((m) => ({ default: m.ProfilPage })),
);
const AnnouncementsPage = lazy(() =>
  import("@/features/participant/AnnouncementsPage").then((m) => ({ default: m.AnnouncementsPage })),
);

const JuryDashboard = lazy(() =>
  import("@/features/jury/JuryDashboard").then((m) => ({ default: m.JuryDashboard })),
);
const JuryPassagesPage = lazy(() =>
  import("@/features/jury/JuryPassagesPage").then((m) => ({ default: m.JuryPassagesPage })),
);
const JuryPassageDetailPage = lazy(() =>
  import("@/features/jury/JuryPassageDetailPage").then((m) => ({ default: m.JuryPassageDetailPage })),
);
const JuryTeamsPage = lazy(() =>
  import("@/features/jury/JuryTeamsPage").then((m) => ({ default: m.JuryTeamsPage })),
);
const JuryTeamDetailPage = lazy(() =>
  import("@/features/jury/JuryTeamDetailPage").then((m) => ({ default: m.JuryTeamDetailPage })),
);

const OrganizerDashboard = lazy(() =>
  import("@/features/organizer/OrganizerDashboard").then((m) => ({ default: m.OrganizerDashboard })),
);
const TournamentPage = lazy(() =>
  import("@/features/organizer/TournamentPage").then((m) => ({ default: m.TournamentPage })),
);
const TeamsPage = lazy(() =>
  import("@/features/organizer/TeamsPage").then((m) => ({ default: m.TeamsPage })),
);
const JuryManagementPage = lazy(() =>
  import("@/features/organizer/JuryManagementPage").then((m) => ({ default: m.JuryManagementPage })),
);
const AdministrationPage = lazy(() =>
  import("@/features/organizer/AdministrationPage").then((m) => ({ default: m.AdministrationPage })),
);
const EvaluationsPage = lazy(() =>
  import("@/features/organizer/EvaluationsPage").then((m) => ({ default: m.EvaluationsPage })),
);
const OrgDocumentsPage = lazy(() =>
  import("@/features/organizer/OrgDocumentsPage").then((m) => ({ default: m.OrgDocumentsPage })),
);
const OrgAnnouncementsPage = lazy(() =>
  import("@/features/organizer/OrgAnnouncementsPage").then((m) => ({ default: m.OrgAnnouncementsPage })),
);

// App — wires the platform providers and the routing tree. Routes are
// segregated by role using RoleGuard wrappers; the home "/" route is
// dispatched to the appropriate dashboard via HomeByRole.

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="py-24 text-center text-foreground/55">Chargement…</div>}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<HomeByRole />} />

              <Route element={<RoleGuard allow={["participant"]} />}>
                <Route path="passage/:passageId" element={<PassageDetailPage />} />
                <Route path="profil" element={<ProfilPage />} />
              </Route>

              <Route element={<RoleGuard allow={["participant", "organizer"]} />}>
                <Route path="documents" element={<DocumentsRouter />} />
              </Route>

              <Route element={<RoleGuard allow={["participant", "jury", "organizer"]} />}>
                <Route path="annonces" element={<AnnouncementsRouter />} />
              </Route>

              <Route element={<RoleGuard allow={["jury", "organizer"]} />}>
                <Route path="equipes" element={<EquipesRouter />} />
              </Route>

              <Route element={<RoleGuard allow={["jury"]} />}>
                <Route path="equipes/:teamId" element={<JuryTeamDetailPage />} />
                <Route path="passages" element={<JuryPassagesPage />} />
                <Route path="passages/:passageId" element={<JuryPassageDetailPage />} />
              </Route>

              <Route element={<RoleGuard allow={["organizer"]} />}>
                <Route path="tournoi" element={<TournamentPage />} />
                <Route path="jury" element={<JuryManagementPage />} />
                <Route path="administration" element={<AdministrationPage />} />
                <Route path="notes" element={<EvaluationsPage />} />
              </Route>

              <Route path="*" element={<TodoPage label="404" />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </SessionProvider>
  );
}

function HomeByRole() {
  const { role, status } = useSession();

  if (status === "loading") {
    return <div className="py-24 text-center text-foreground/55">Chargement…</div>;
  }
  if (status === "anonymous" || !role) {
    return (
      <div className="py-24 text-center">
        <div className="font-heading font-bold text-2xl mb-3">Connexion requise</div>
        <div className="text-foreground/55">
          Choisissez un compte via le sélecteur en haut à droite pour continuer.
        </div>
      </div>
    );
  }

  if (role === "participant") return <ParcoursPage />;
  if (role === "jury") return <JuryDashboard />;
  return <OrganizerDashboard />;
}

function DocumentsRouter() {
  const { role } = useSession();
  if (role === "organizer") return <OrgDocumentsPage />;
  return <ParticipantDocumentsPage />;
}

function AnnouncementsRouter() {
  const { role } = useSession();
  if (role === "organizer") return <OrgAnnouncementsPage />;
  return <AnnouncementsPage />;
}

function EquipesRouter() {
  const { role } = useSession();
  if (role === "jury") return <JuryTeamsPage />;
  return <TeamsPage />;
}

function TodoPage({ label }: { label: string }) {
  return (
    <div className="py-24 text-center">
      <div className="font-heading font-bold text-4xl mb-3">{label}</div>
      <div className="text-foreground/55">À venir dans la prochaine itération.</div>
    </div>
  );
}
