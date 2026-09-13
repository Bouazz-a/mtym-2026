import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  BrutalCard,
  Badge,
  DiamondMarker,
  Btn,
  StatusPill,
  PageMotion,
} from "@/features/shared/primitives";
import {
  ROLE_PALETTE,
  teamRoleFromIds,
  MoroccoWatermark,
} from "@/features/shared/widgets";
import { useSession } from "@/features/shared/SessionContext";
import {
  getPassageById,
  getPools,
  getPassagesByTeam,
} from "@/lib/repositories/poolRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import {
  getDocumentsByTeam,
  uploadDocumentFile,
  downloadDocument,
} from "@/lib/repositories/documentRepository";
import {
  canDownloadDefenderReportInPassage,
  canDownloadSummarySheetTemplateInPassage,
  isTeamCreator,
} from "@/lib/permissions";
import { validateUploadedFile } from "@/utils/validation";
import { ServiceError } from "@/lib/services/errors";
import type {
  Document,
  DocumentType,
  Participant,
  Passage,
  Pool,
  Team,
} from "@/types";

// PassageDetailPage — full passage view. Top: role hero + teams + logistics.
// Below: documents section. The team's own deposit (presentation or summary
// sheet) is uploadable directly here; the defender's final report is
// downloadable by opponent/reporter/extra once within the visibility window.

export function PassageDetailPage() {
  const { passageId } = useParams<{ passageId: string }>();
  const { session } = useSession();
  const navigate = useNavigate();
  const teamId = session?.role === "participant" ? session.team.id : null;

  const passageQuery = useQuery({
    queryKey: ["passage", passageId],
    queryFn: () => getPassageById(passageId!),
    enabled: !!passageId,
  });
  const passage: Passage | null = passageQuery.data ?? null;

  const poolsQuery = useQuery({ queryKey: ["pools"], queryFn: getPools, enabled: !!passage });
  const pool: Pool | null = passage
    ? (poolsQuery.data ?? []).find((po) => po.id === passage.poolId) ?? null
    : null;

  const teamsQuery = useQuery({ queryKey: ["teams"], queryFn: getTeams, enabled: !!teamId });
  const teamById = new Map<string, Team>((teamsQuery.data ?? []).map((t) => [t.id, t]));

  const ownTeamPassagesQuery = useQuery({
    queryKey: ["team-passages", teamId],
    queryFn: () => getPassagesByTeam(teamId!),
    enabled: !!teamId,
  });

  const ownTeamDocsQuery = useQuery({
    queryKey: ["documents", "team", teamId],
    queryFn: () => getDocumentsByTeam(teamId!),
    enabled: !!teamId,
  });

  const defenderDocsQuery = useQuery({
    queryKey: ["documents", "team", passage?.defenderTeamId],
    queryFn: () => getDocumentsByTeam(passage!.defenderTeamId),
    enabled: !!passage?.defenderTeamId,
  });

  // Unknown passage id: bounce back home (only once the fetch has actually
  // settled — don't navigate away while it's still loading).
  useEffect(() => {
    if (passageId && !passageQuery.isLoading && !passage) {
      navigate("/", { replace: true });
    }
  }, [passageId, passageQuery.isLoading, passage, navigate]);

  if (!session || session.role !== "participant") return null;
  if (passageQuery.isLoading) {
    return <div className="py-24 text-center text-foreground/55">Chargement…</div>;
  }
  if (!passage || !pool) return null;

  const ownTeam = teamById.get(session.team.id) ?? session.team;
  const ownRole = teamRoleFromIds(ownTeam, passage);

  if (!ownRole) {
    return (
      <div
        className="relative overflow-hidden text-center"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "80px 40px",
        }}
      >
        <MoroccoWatermark
          size={220}
          opacity={0.06}
          top={-40}
          right={-40}
          color="var(--forest)"
        />
        <div className="relative">
          <div
            className="font-mont mb-3"
            style={{
              fontSize: "1.5rem",
              color: "var(--forest)",
              fontWeight: 800,
            }}
          >
            Accès refusé
          </div>
          <div
            className="font-open text-sm max-w-md mx-auto mb-6"
            style={{ color: "var(--ink-soft)" }}
          >
            Vous ne participez pas à ce passage.
          </div>
          <Link to="/">
            <Btn variant="ghost">Retour à mon parcours</Btn>
          </Link>
        </div>
      </div>
    );
  }

  const defender = teamById.get(passage.defenderTeamId);
  const opponent = teamById.get(passage.opponentTeamId);
  const reporter = teamById.get(passage.reporterTeamId);
  const extra = passage.extraTeamId
    ? teamById.get(passage.extraTeamId)
    : undefined;
  const meta = ROLE_PALETTE[ownRole];
  const canUpload = isTeamCreator(session.participant, ownTeam);

  return (
    <PageMotion className="space-y-8">
      <div>
        <Link
          to="/"
          className="font-mont text-tiny uppercase tracking-widest inline-flex items-center gap-1.5 transition-colors"
          style={{ color: "var(--ink-faint)", fontWeight: 800 }}
        >
          Mon parcours
        </Link>
      </div>

      <PageHeader
        eyebrow={`${pool.label} · Passage ${passage.label}`}
        title={`Problème ${passage.problemNumber}`}
        sub="Détails du passage, équipes impliquées, horaires et documents accessibles selon votre rôle."
        right={<Badge tone="dark">P{passage.problemNumber}</Badge>}
      />

      {/* Role hero */}
      <div
        className="relative overflow-hidden noise-overlay noise-overlay--hero team-hero-banner"
        style={{
          backgroundColor: "var(--forest)",
          color: "var(--paper)",
          border: "2px solid var(--forest)",
          boxShadow: "3px 3px 0 0 var(--saffron)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 200,
            height: 200,
            background: `radial-gradient(circle at 100% 0%, ${meta.glow}, transparent 70%)`,
            pointerEvents: "none",
          }}
        />
        <div className="relative p-8 md:p-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <div
              className="font-mont text-tiny uppercase tracking-widest mb-2"
              style={{ color: "rgba(244,236,216,0.6)", fontWeight: 700 }}
            >
              Votre rôle
            </div>
            <div
              className="font-mont leading-none mb-3"
              style={{
                fontSize: "clamp(2.5rem, 5vw, 3.5rem)",
                color: "var(--saffron)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
              }}
            >
              {meta.label}
            </div>
            <div
              className="font-open text-sm max-w-md"
              style={{ color: "rgba(244,236,216,0.75)" }}
            >
              {ROLE_DESCRIPTION[ownRole]}
            </div>
          </div>
          <span
            className="font-mont uppercase tracking-widest px-4 py-2"
            style={{
              background: meta.bg,
              color: meta.fg,
              fontWeight: 800,
              borderRadius: 2,
              fontSize: "0.9rem",
              letterSpacing: "0.1em",
            }}
          >
            {meta.short}
          </span>
        </div>
      </div>

      {/* Teams + Logistics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BrutalCard className="lg:col-span-2 overflow-hidden">
          <div
            className="px-6 py-4 flex items-center gap-2"
            style={{ borderBottom: "2px solid var(--forest)" }}
          >
            <DiamondMarker />
            <h2
              className="font-mont uppercase tracking-tight"
              style={{
                fontSize: "1.05rem",
                color: "var(--forest)",
                fontWeight: 900,
              }}
            >
              Équipes
            </h2>
          </div>
          <div>
            <TeamRow
              label="Défense"
              team={defender}
              ownId={ownTeam.id}
              role="defender"
            />
            <TeamRow
              label="Opposition"
              team={opponent}
              ownId={ownTeam.id}
              role="opponent"
            />
            <TeamRow
              label="Rapport"
              team={reporter}
              ownId={ownTeam.id}
              role="reporter"
            />
            {extra && (
              <TeamRow
                label="Extra"
                team={extra}
                ownId={ownTeam.id}
                role="extra"
                last
              />
            )}
          </div>
        </BrutalCard>

        <BrutalCard className="overflow-hidden">
          <div
            className="px-6 py-4 flex items-center gap-2"
            style={{ borderBottom: "2px solid var(--forest)" }}
          >
            <DiamondMarker />
            <h2
              className="font-mont uppercase tracking-tight"
              style={{
                fontSize: "1.05rem",
                color: "var(--forest)",
                fontWeight: 900,
              }}
            >
              Logistique
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <KV
              label="Jour"
              value={passage.day ? formatDate(passage.day) : "À définir"}
            />
            <KV label="Horaire" value={passage.timeSlot ?? "À définir"} />
            <KV label="Amphi" value={passage.room ?? "À définir"} />
          </div>
        </BrutalCard>
      </div>

      {/* Documents */}
      <DocumentsSection
        passage={passage}
        ownTeam={ownTeam}
        defender={defender}
        defenderDocs={defenderDocsQuery.data ?? []}
        ownTeamDocs={ownTeamDocsQuery.data ?? []}
        ownTeamPassages={ownTeamPassagesQuery.data ?? []}
        ownRole={ownRole}
        participant={session.participant}
        canUpload={canUpload}
      />
    </PageMotion>
  );
}

const ROLE_DESCRIPTION = {
  defender:
    "Vous présentez la solution du problème devant le jury et les autres équipes.",
  opponent:
    "Vous challengez la solution du défenseur. Préparez une fiche de synthèse critique.",
  reporter:
    "Vous synthétisez l'échange entre défenseur et opposant pour le jury.",
  extra: "Vous assistez au passage sans rôle actif.",
};

function TeamRow({
  label,
  team,
  ownId,
  role,
  last,
}: {
  label: string;
  team: Team | undefined;
  ownId: string;
  role: keyof typeof ROLE_PALETTE;
  last?: boolean;
}) {
  const isOwn = team?.id === ownId;
  const meta = ROLE_PALETTE[role];
  return (
    <div
      className="flex items-center justify-between px-6 py-4"
      style={{
        borderBottom: last ? "none" : "1px solid var(--border)",
        background: isOwn ? "rgba(246,168,6,0.05)" : "transparent",
      }}
    >
      <div className="flex items-center gap-5">
        <span
          className="font-mont text-tiny uppercase tracking-widest"
          style={{ color: "var(--ink-faint)", fontWeight: 700, width: 96 }}
        >
          {label}
        </span>
        <div>
          <div
            className="font-mont"
            style={{
              color: "var(--forest)",
              fontWeight: 800,
              fontSize: "1.05rem",
            }}
          >
            {team?.quadrigramme ?? "—"}
            {isOwn && (
              <span
                className="ml-2 font-mont text-tiny uppercase tracking-widest"
                style={{ color: "var(--saffron-dark)", fontWeight: 700 }}
              >
                · vous
              </span>
            )}
          </div>
          {team && (
            <div
              className="font-open text-xs mt-0.5"
              style={{ color: "var(--ink-faint)" }}
            >
              {team.name}
            </div>
          )}
        </div>
      </div>
      <span
        className="font-mont text-tiny uppercase tracking-widest px-2 py-1"
        style={{
          background: meta.bg,
          color: meta.fg,
          fontWeight: 800,
          borderRadius: 2,
          letterSpacing: "0.1em",
        }}
      >
        {meta.short}
      </span>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="font-mont text-tiny uppercase tracking-widest mb-1"
        style={{ color: "var(--ink-faint)", fontWeight: 700 }}
      >
        {label}
      </div>
      <div
        className="font-mont"
        style={{ color: "var(--forest)", fontWeight: 700, fontSize: "0.95rem" }}
      >
        {value}
      </div>
    </div>
  );
}

function formatDate(ddmmyyyy: string): string {
  const match = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return ddmmyyyy;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// ─── Documents section ─────────────────────────────────────────────────

function DocumentsSection({
  passage,
  ownTeam,
  defender,
  defenderDocs,
  ownTeamDocs,
  ownTeamPassages,
  ownRole,
  participant,
  canUpload,
}: {
  passage: Passage;
  ownTeam: Team;
  defender: Team | undefined;
  defenderDocs: Document[];
  ownTeamDocs: Document[];
  ownTeamPassages: Passage[];
  ownRole: keyof typeof ROLE_PALETTE;
  participant: Participant;
  canUpload: boolean;
}) {
  const expectedRfType = `rapport_final_p${passage.problemNumber}` as const;
  const defenderRf = defenderDocs.find((d) => d.docType === expectedRfType);
  const canDownloadRf = defenderRf
    ? canDownloadDefenderReportInPassage(
        participant,
        ownTeam,
        passage,
        defenderRf,
      )
    : false;
  const canDownloadTemplate = canDownloadSummarySheetTemplateInPassage(
    participant,
    ownTeam,
    passage,
  );
  const isDefenderOwn = ownRole === "defender";

  // Determine which doc type the team needs to upload, if any.
  const myDeposit = computeMyDeposit(ownRole, ownTeam.id, passage, ownTeamPassages);

  return (
    <section>
      <div
        className="flex items-end justify-between mb-4 pb-4"
        style={{ borderBottom: "2px solid var(--forest)" }}
      >
        <div>
          <div
            className="font-mont text-tiny uppercase tracking-widest"
            style={{ color: "var(--saffron-dark)", fontWeight: 800 }}
          >
            Section
          </div>
          <h2
            className="font-mont mt-1"
            style={{
              fontSize: "1.5rem",
              color: "var(--forest)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
            }}
          >
            Documents
          </h2>
          <p
            className="font-open text-sm mt-2 max-w-2xl"
            style={{ color: "var(--ink-soft)" }}
          >
            Accès aux dépôts liés à ce passage. La visibilité dépend de votre
            rôle et des deadlines.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Defender's RF — readable for non-defenders within visibility window */}
        <DefenderReportCard
          passage={passage}
          defender={defender}
          defenderRf={defenderRf}
          isDefenderOwn={isDefenderOwn}
          canDownloadRf={canDownloadRf}
        />

        {/* Template fiche synthèse — for opponent + reporter */}
        {(ownRole === "opponent" || ownRole === "reporter") && (
          <TemplateCard
            ownRole={ownRole}
            available={canDownloadTemplate}
            pdfUrl="/fiche-synthese-template.pdf"
            texUrl="/fiche-synthese-template.tex"
          />
        )}

        {/* My own deposit (upload card) */}
        {myDeposit && (
          <MyDepositCard
            ownTeam={ownTeam}
            docType={myDeposit.docType}
            title={myDeposit.title}
            existing={ownTeamDocs.find((d) => d.docType === myDeposit.docType)}
            canUpload={canUpload}
          />
        )}
      </div>

    </section>
  );
}

// ─── Defender's RF card ────────────────────────────────────────────────

function DefenderReportCard({
  passage,
  defender,
  defenderRf,
  isDefenderOwn,
  canDownloadRf,
}: {
  passage: Passage;
  defender: Team | undefined;
  defenderRf: Document | undefined;
  isDefenderOwn: boolean;
  canDownloadRf: boolean;
}) {
  const handleDownload = async () => {
    if (!defenderRf) return;
    try {
      const { url, filename } = await downloadDocument(defenderRf.id, defenderRf.originalName);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Fichier introuvable.");
    }
  };

  return (
    <BrutalCard hoverable className="p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div
            className="font-mont"
            style={{
              color: "var(--forest)",
              fontWeight: 700,
              fontSize: "0.95rem",
            }}
          >
            Rapport final · P{passage.problemNumber}
          </div>
          <div
            className="font-open text-xs mt-1"
            style={{ color: "var(--ink-soft)" }}
          >
            {isDefenderOwn
              ? `Déposé par votre équipe (depuis Mes dépôts)`
              : `Déposé par ${defender?.quadrigramme ?? "—"}`}
          </div>
        </div>
        {!defender ? (
          <StatusPill kind="info">—</StatusPill>
        ) : !defenderRf ? (
          <StatusPill kind="pending">En attente</StatusPill>
        ) : isDefenderOwn || canDownloadRf ? (
          <StatusPill kind="uploaded">Disponible</StatusPill>
        ) : (
          <StatusPill kind="locked">Verrouillé</StatusPill>
        )}
      </div>

      {defenderRf && (isDefenderOwn || canDownloadRf) ? (
        <div className="mt-4">
          <Btn
            onClick={handleDownload}
            variant="primary"
            size="sm"
            className="w-full"
          >
            Télécharger
          </Btn>
          <div
            className="font-mont text-tiny mt-2 truncate"
            style={{ color: "var(--ink-faint)", fontWeight: 600 }}
          >
            {defenderRf.renamedAs}
          </div>
        </div>
      ) : !defender ? (
        <div
          className="font-open text-xs mt-4"
          style={{ color: "var(--ink-faint)" }}
        >
          Équipe défenseuse inconnue.
        </div>
      ) : !defenderRf ? (
        <div
          className="font-open text-xs mt-4"
          style={{ color: "var(--ink-faint)" }}
        >
          L'équipe défenseuse n'a pas encore déposé son rapport.
        </div>
      ) : (
        <div
          className="font-open text-xs mt-4"
          style={{ color: "var(--ink-faint)" }}
        >
          Accessible 14 jours avant le passage.
        </div>
      )}
    </BrutalCard>
  );
}

// ─── Template card ─────────────────────────────────────────────────────

function TemplateCard({
  ownRole,
  available,
  pdfUrl,
  texUrl,
}: {
  ownRole: "opponent" | "reporter";
  available: boolean;
  pdfUrl: string;
  texUrl: string;
}) {
  return (
    <BrutalCard hoverable className="p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div
            className="font-mont"
            style={{
              color: "var(--forest)",
              fontWeight: 700,
              fontSize: "0.95rem",
            }}
          >
            Modèle fiche de synthèse
          </div>
          <div
            className="font-open text-xs mt-1"
            style={{ color: "var(--ink-soft)" }}
          >
            Pour {ownRole === "opponent" ? "l'opposant" : "le rapporteur"} ·
            PDF à remplir ou source LaTeX
          </div>
        </div>
        <StatusPill kind="info">Modèle</StatusPill>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {available ? (
          <>
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              <Btn variant="ghost" size="sm" className="w-full">
                Aperçu / télécharger le PDF
              </Btn>
            </a>
            <a href={texUrl} download>
              <Btn variant="ghost" size="sm" className="w-full">
                Télécharger la source LaTeX
              </Btn>
            </a>
          </>
        ) : (
          <div
            className="font-open text-xs"
            style={{ color: "var(--ink-faint)" }}
          >
            Indisponible.
          </div>
        )}
      </div>
    </BrutalCard>
  );
}

// ─── My deposit card (upload) ──────────────────────────────────────────

interface MyDeposit {
  docType: DocumentType;
  title: string;
}

function computeMyDeposit(
  role: keyof typeof ROLE_PALETTE,
  teamId: string,
  passage: Passage,
  teamPassages: Passage[],
): MyDeposit | null {
  if (role !== "defender" && role !== "opponent" && role !== "reporter")
    return null;

  // We need to determine which presentation_N / fiche_synthese_*_N to use,
  // based on the chronological order of passages where the team has this
  // role. The first such passage gets N=1, the second N=2.
  const allPassages = [...teamPassages].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  const sameRolePassages = allPassages.filter((p) => {
    if (role === "defender") return p.defenderTeamId === teamId;
    if (role === "opponent") return p.opponentTeamId === teamId;
    return p.reporterTeamId === teamId;
  });
  const idx = sameRolePassages.findIndex((p) => p.id === passage.id);
  if (idx < 0) return null;
  const n = (idx + 1) as 1 | 2;

  if (role === "defender") {
    return {
      docType: `presentation_${n}` as DocumentType,
      title: "Présentation",
    };
  }
  if (role === "opponent") {
    return {
      docType: `fiche_synthese_opposant_${n}` as DocumentType,
      title: "Fiche opposant",
    };
  }
  return {
    docType: `fiche_synthese_rapporteur_${n}` as DocumentType,
    title: "Fiche rapporteur",
  };
}

function MyDepositCard({
  ownTeam,
  docType,
  title,
  existing,
  canUpload,
}: {
  ownTeam: Team;
  docType: DocumentType;
  title: string;
  existing: Document | undefined;
  canUpload: boolean;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateUploadedFile({ size: file.size, mimeType: file.type });
    if (!validation.ok) {
      setError(validation.error);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setBusy(true);
    try {
      await uploadDocumentFile(file, docType, ownTeam.id);
      await queryClient.invalidateQueries({ queryKey: ["documents", "team", ownTeam.id] });
    } catch (e) {
      if (e instanceof ServiceError) setError(e.message);
      else throw e;
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDownload = async () => {
    if (!existing) return;
    try {
      const { url, filename } = await downloadDocument(existing.id, existing.originalName);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Fichier introuvable.");
    }
  };

  return (
    <BrutalCard hoverable className="p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div
            className="font-mont"
            style={{
              color: "var(--forest)",
              fontWeight: 700,
              fontSize: "0.95rem",
            }}
          >
            {title}
          </div>
          <div
            className="font-open text-xs mt-1"
            style={{ color: "var(--ink-soft)" }}
          >
            À déposer par votre équipe ({ownTeam.quadrigramme})
          </div>
        </div>
        {existing ? (
          <StatusPill kind="uploaded">Déposé</StatusPill>
        ) : (
          <StatusPill kind="pending">À déposer</StatusPill>
        )}
      </div>

      {existing && (
        <div
          className="mt-2 pt-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div
            className="font-mont text-xs truncate"
            style={{ color: "var(--forest)", fontWeight: 600 }}
          >
            {existing.renamedAs}
          </div>
          <div
            className="font-open text-tiny mt-1"
            style={{ color: "var(--ink-faint)" }}
          >
            {new Date(existing.uploadedAt).toLocaleString("fr-FR")}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFile}
      />

      <div className="mt-4 flex gap-2">
        {canUpload && (
          <Btn
            onClick={handlePick}
            disabled={busy}
            variant={existing ? "ghost" : "primary"}
            size="sm"
            className="flex-1"
          >
            {busy ? "Envoi…" : existing ? "Remplacer" : "Déposer"}
          </Btn>
        )}
        {existing && (
          <Btn onClick={handleDownload} variant="ghost" size="sm">
            ↓
          </Btn>
        )}
      </div>

      {error && (
        <div
          className="mt-3 font-open text-xs px-3 py-2"
          style={{
            background: "rgba(178,59,27,0.08)",
            border: "1px solid rgba(178,59,27,0.3)",
            borderRadius: 2,
            color: "var(--clay)",
          }}
        >
          {error}
        </div>
      )}
    </BrutalCard>
  );
}
