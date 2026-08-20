import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SessionProvider, useSession } from "@/features/shared/SessionContext";
import { AppLayout } from "@/layout/AppLayout";
import { RoleGuard } from "@/layout/RoleGuard";

import { ParcoursPage } from "@/features/participant/ParcoursPage";
import { DocumentsPage as ParticipantDocumentsPage } from "@/features/participant/DocumentsPage";
import { PassageDetailPage } from "@/features/participant/PassageDetailPage";
import { ProfilPage } from "@/features/participant/ProfilPage";
import { AnnouncementsPage } from "@/features/participant/AnnouncementsPage";

import { JuryDashboard } from "@/features/jury/JuryDashboard";
import { JuryPassagesPage } from "@/features/jury/JuryPassagesPage";
import { JuryPassageDetailPage } from "@/features/jury/JuryPassageDetailPage";
import { JuryTeamsPage } from "@/features/jury/JuryTeamsPage";
import { JuryTeamDetailPage } from "@/features/jury/JuryTeamDetailPage";

import { OrganizerDashboard } from "@/features/organizer/OrganizerDashboard";
import { TournamentPage } from "@/features/organizer/TournamentPage";
import { TeamsPage } from "@/features/organizer/TeamsPage";
import { JuryManagementPage } from "@/features/organizer/JuryManagementPage";
import { AdministrationPage } from "@/features/organizer/AdministrationPage";
import { EvaluationsPage } from "@/features/organizer/EvaluationsPage";
import { OrgDocumentsPage } from "@/features/organizer/OrgDocumentsPage";
import { OrgAnnouncementsPage } from "@/features/organizer/OrgAnnouncementsPage";

// App — wires the platform providers and the routing tree. Routes are
// segregated by role using RoleGuard wrappers; the home "/" route is
// dispatched to the appropriate dashboard via HomeByRole.

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </SessionProvider>
  );
}

function HomeByRole() {
  const { role } = useSession();
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
