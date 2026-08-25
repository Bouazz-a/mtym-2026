import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  BrutalCard,
  Badge,
  Btn,
  StatusPill,
  PageMotion,
} from "@/features/shared/primitives";
import { teamRoleFromIds } from "@/features/shared/widgets";
import { useSession } from "@/features/shared/SessionContext";
import {
  getDocumentsByTeam,
  uploadDocumentFile,
  downloadDocument,
} from "@/lib/repositories/documentRepository";
import { getPassagesByTeam } from "@/lib/repositories/poolRepository";
import { getTeamById } from "@/lib/repositories/teamRepository";
import { validateUploadedFile } from "@/utils/validation";
import { ServiceError } from "@/lib/services/errors";
import { isTeamCreator } from "@/lib/permissions";
import type { Document, DocumentType, Passage } from "@/types";

// DocumentsPage — participant view of expected deposits split in two
// sections:
//
//   1. Partie écrite : 1 RI + 4 RFs (P1..P4) — jury reads these.
//      Uploadable directly here by the team creator.
//
//   2. Partie orale : presentations (defender) + summary sheets
//      (opponent/reporter) — these are tied to specific passages and
//      uploaded from the passage detail page. Here we just show the
//      checklist of what's expected and whether it's been deposited.

// ─── Slot model ────────────────────────────────────────────────────────

interface WrittenSlot {
  docType: DocumentType;
  title: string;
  hint: string;
}

interface OralSlot {
  docType: DocumentType;
  title: string;
  hint: string;
  passageId: string;
  passageLabel: string;
}

export function DocumentsPage() {
  const { session } = useSession();
  const participantSession =
    session?.role === "participant" ? session : null;
  const teamId = participantSession?.team.id ?? null;

  const teamQuery = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => getTeamById(teamId!),
    enabled: !!teamId,
  });
  const team = teamQuery.data ?? participantSession?.team ?? null;
  const canUpload =
    participantSession && team
      ? isTeamCreator(participantSession.participant, team)
      : false;

  const docsQuery = useQuery({
    queryKey: ["documents", "team", teamId],
    queryFn: () => getDocumentsByTeam(teamId!),
    enabled: !!teamId,
  });
  const docs: Document[] = docsQuery.data ?? [];

  const passagesQuery = useQuery({
    queryKey: ["team-passages", teamId],
    queryFn: () => getPassagesByTeam(teamId!),
    enabled: !!teamId,
  });
  const oralSlots: OralSlot[] = team
    ? computeOralSlots(team.id, passagesQuery.data ?? [])
    : [];

  if (!session || session.role !== "participant") return null;
  if (teamQuery.isLoading) {
    return <div className="py-24 text-center text-foreground/55">Chargement…</div>;
  }
  if (!team) return null;

  // Fixed written slots: 1 RI + 4 RFs
  const writtenSlots: WrittenSlot[] = [
    {
      docType: "rapport_intermediaire",
      title: "Rapport intermédiaire",
      hint: "Préparation initiale",
    },
    {
      docType: "rapport_final_p1",
      title: "Rapport final · P1",
      hint: "Version finale problème 1",
    },
    {
      docType: "rapport_final_p2",
      title: "Rapport final · P2",
      hint: "Version finale problème 2",
    },
    {
      docType: "rapport_final_p3",
      title: "Rapport final · P3",
      hint: "Version finale problème 3",
    },
    {
      docType: "rapport_final_p4",
      title: "Rapport final · P4",
      hint: "Version finale problème 4",
    },
  ];

  const totalSlots = writtenSlots.length + oralSlots.length;
  const submitted = docs.length;

  return (
    <PageMotion className="space-y-8">
      <PageHeader
        eyebrow={`${team.quadrigramme} · Documents`}
        title="Mes dépôts"
        sub="Rapports écrits et documents oraux attendus pour votre équipe. Les rapports sont déposés ici ; les fiches et présentations se déposent depuis la page du passage concerné."
        right={
          <Badge tone={submitted === totalSlots ? "sage" : "saffron"}>
            {submitted} / {totalSlots} déposés
          </Badge>
        }
      />

      {!canUpload && (
        <BrutalCard className="p-4" highlight withCorners={false}>
          <div
            className="font-open text-sm"
            style={{ color: "var(--saffron-dark)", fontWeight: 700 }}
          >
            Lecture seule — vous n'êtes pas le créateur de l'équipe. Seul le
            créateur peut déposer.
          </div>
        </BrutalCard>
      )}

      {/* Section : Partie écrite */}
      <Section
        eyebrow="Partie écrite"
        title="Rapports"
        sub="Rapport intermédiaire et rapports finaux par problème. Évalués par le jury."
      >
        {writtenSlots.map((slot) => (
          <WrittenSlotCard
            key={slot.docType}
            slot={slot}
            document={docs.find((d) => d.docType === slot.docType)}
            teamId={team.id}
            canUpload={canUpload}
          />
        ))}
      </Section>

      {/* Section : Partie orale */}
      <Section
        eyebrow="Partie orale"
        title="Fiches & présentations"
        sub="Documents liés à vos passages. Le dépôt se fait depuis la page du passage concerné."
      >
        {oralSlots.length === 0 ? (
          <div
            className="font-open text-sm italic"
            style={{
              background: "var(--surface)",
              border: "1px dashed var(--border)",
              borderRadius: 4,
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--ink-faint)",
              gridColumn: "1 / -1",
            }}
          >
            Aucun passage attribué pour le moment.
          </div>
        ) : (
          oralSlots.map((slot) => (
            <OralSlotCard
              key={`${slot.passageId}-${slot.docType}`}
              slot={slot}
              document={docs.find((d) => d.docType === slot.docType)}
            />
          ))
        )}
      </Section>
    </PageMotion>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────

function Section({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <div
        className="font-mont text-tiny uppercase tracking-widest mb-1"
        style={{ color: "var(--saffron-dark)", fontWeight: 700 }}
      >
        {eyebrow}
      </div>
      <h2
        className="font-mont mb-1"
        style={{
          fontSize: "1.5rem",
          color: "var(--forest)",
          fontWeight: 800,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
      <p
        className="font-open text-sm mb-5 max-w-2xl"
        style={{ color: "var(--ink-soft)" }}
      >
        {sub}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {children}
      </div>
    </section>
  );
}

// ─── Written slot card (with upload) ───────────────────────────────────

function WrittenSlotCard({
  slot,
  document,
  teamId,
  canUpload,
}: {
  slot: WrittenSlot;
  document: Document | undefined;
  teamId: string;
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
      await uploadDocumentFile(file, slot.docType, teamId);
      await queryClient.invalidateQueries({ queryKey: ["documents", "team", teamId] });
    } catch (e) {
      if (e instanceof ServiceError) setError(e.message);
      else throw e;
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDownload = async () => {
    if (!document) return;
    try {
      const { url, filename } = await downloadDocument(document.id, document.originalName);
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
    <BrutalCard hoverable className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div
            className="font-mont"
            style={{
              color: "var(--forest)",
              fontWeight: 800,
              fontSize: "0.95rem",
            }}
          >
            {slot.title}
          </div>
          <div
            className="font-open text-xs mt-1"
            style={{ color: "var(--ink-soft)" }}
          >
            {slot.hint}
          </div>
        </div>
        {document ? (
          <StatusPill kind="uploaded">Déposé</StatusPill>
        ) : (
          <StatusPill kind="pending">À déposer</StatusPill>
        )}
      </div>

      {document && (
        <div
          className="mt-2 pt-3"
          style={{ borderTop: "1px dashed var(--border)" }}
        >
          <div
            className="font-mont text-tiny uppercase tracking-widest mb-1"
            style={{ color: "var(--ink-faint)", fontWeight: 800 }}
          >
            Fichier
          </div>
          <div
            className="font-mont text-xs truncate"
            style={{ color: "var(--forest)", fontWeight: 700 }}
          >
            {document.renamedAs}
          </div>
          <div
            className="font-open text-tiny mt-1"
            style={{ color: "var(--ink-faint)" }}
          >
            {formatBytes(document.size)} ·{" "}
            {new Date(document.uploadedAt).toLocaleString("fr-FR")}
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

      <div className="mt-auto pt-4 flex gap-2">
        {canUpload && (
          <Btn
            onClick={handlePick}
            disabled={busy}
            variant={document ? "ghost" : "primary"}
            size="sm"
            className="flex-1"
          >
            {busy ? "Envoi…" : document ? "Remplacer" : "Déposer"}
          </Btn>
        )}
        {document && (
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
            color: "var(--clay)",
          }}
        >
          {error}
        </div>
      )}
    </BrutalCard>
  );
}

// ─── Oral slot card (read-only, links to passage page) ─────────────────

function OralSlotCard({
  slot,
  document,
}: {
  slot: OralSlot;
  document: Document | undefined;
}) {
  return (
    <BrutalCard hoverable className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div
            className="font-mont"
            style={{
              color: "var(--forest)",
              fontWeight: 800,
              fontSize: "0.95rem",
            }}
          >
            {slot.title}
          </div>
          <div
            className="font-open text-xs mt-1"
            style={{ color: "var(--ink-soft)" }}
          >
            {slot.hint}
          </div>
        </div>
        {document ? (
          <StatusPill kind="uploaded">Déposé</StatusPill>
        ) : (
          <StatusPill kind="pending">À déposer</StatusPill>
        )}
      </div>

      {document && (
        <div
          className="mt-2 pt-3"
          style={{ borderTop: "1px dashed var(--border)" }}
        >
          <div
            className="font-mont text-xs truncate"
            style={{ color: "var(--forest)", fontWeight: 700 }}
          >
            {document.renamedAs}
          </div>
          <div
            className="font-open text-tiny mt-1"
            style={{ color: "var(--ink-faint)" }}
          >
            {new Date(document.uploadedAt).toLocaleString("fr-FR")}
          </div>
        </div>
      )}

      <div className="mt-auto pt-4">
        <Link to={`/passage/${slot.passageId}`}>
          <Btn variant="ghost" size="sm" className="w-full">
            Aller au passage {slot.passageLabel}
          </Btn>
        </Link>
      </div>
    </BrutalCard>
  );
}

// ─── Compute the list of oral slots from passages ──────────────────────

function computeOralSlots(teamId: string, passages: Passage[]): OralSlot[] {
  const slots: OralSlot[] = [];
  let presN = 0,
    oppN = 0,
    repN = 0;

  const sorted = [...passages].sort((a, b) => a.label.localeCompare(b.label));
  for (const passage of sorted) {
    const role = teamRoleFromIds({ id: teamId }, passage);
    if (role === "defender") {
      presN++;
      slots.push({
        docType: `presentation_${presN as 1 | 2}` as DocumentType,
        title: `Présentation · ${passage.label}`,
        hint: `Problème ${passage.problemNumber}`,
        passageId: passage.id,
        passageLabel: passage.label,
      });
    } else if (role === "opponent") {
      oppN++;
      slots.push({
        docType: `fiche_synthese_opposant_${oppN as 1 | 2}` as DocumentType,
        title: `Fiche opposant · ${passage.label}`,
        hint: `Problème ${passage.problemNumber}`,
        passageId: passage.id,
        passageLabel: passage.label,
      });
    } else if (role === "reporter") {
      repN++;
      slots.push({
        docType: `fiche_synthese_rapporteur_${repN as 1 | 2}` as DocumentType,
        title: `Fiche rapporteur · ${passage.label}`,
        hint: `Problème ${passage.problemNumber}`,
        passageId: passage.id,
        passageLabel: passage.label,
      });
    }
  }
  return slots;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
