import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useSession } from "@/features/shared/SessionContext";
import {
  ROLE_PALETTE,
  teamRoleFromIds,
  CONSTRAINT_PALETTE,
  ConstraintLegend,
  buildViolationIndex,
  dominantViolation,
} from "@/features/shared/widgets";
import { Btn, PageMotion } from "@/features/shared/primitives";
import {
  getConstraintReport,
} from "@/lib/services/tournamentOptimizer";
import type { ConstraintViolation } from "@/lib/services/tournamentOptimizer";
import { getPools, getPassagesByTeam } from "@/lib/repositories/poolRepository";
import { getParticipantsByTeam } from "@/lib/repositories/participantRepository";
import { getTeamById, getTeams } from "@/lib/repositories/teamRepository";
import { getDocumentsByTeam } from "@/lib/repositories/documentRepository";
import {
  getAnnouncements,
  getDeadlines,
} from "@/lib/repositories/announcementRepository";
import { uploadDocument } from "@/lib/services/documentUploadService";
import { ServiceError } from "@/lib/services/errors";
import { isTeamCreator } from "@/lib/permissions";
import { getPoolDisplayLabel, getRoundLabel } from "@/utils/naming";
import {
  createDownloadUrl,
  fileToBase64,
  storeFileBlob,
} from "@/lib/storage/fileStorage";
import type {
  Announcement,
  Deadline,
  Document,
  DocumentType,
  Participant,
  Passage,
  Pool,
  Team,
} from "@/types";

// ParcoursPage — "Espace Tournoi" (participant home).
// Editorial Arena layout. All copy is derived from seed data (team,
// members, pools, passages, documents, announcements, deadlines) —
// no UI placeholder strings.

const RF_SLOTS: { docType: DocumentType; n: number }[] = [
  { docType: "rapport_final_p1", n: 1 },
  { docType: "rapport_final_p2", n: 2 },
  { docType: "rapport_final_p3", n: 3 },
  { docType: "rapport_final_p4", n: 4 },
];

export function ParcoursPage() {
  const { session } = useSession();
  // Derive everything null-safely WITHOUT an early return: all hooks below
  // must run on every render (Rules of Hooks). The "render nothing" guard
  // lives after the last hook.
  const participantSession =
    session && session.role === "participant" ? session : null;
  const team = participantSession
    ? getTeamById(participantSession.team.id) ?? participantSession.team
    : null;

  const [highlight, setHighlight] = useState(false);

  // Everything below is derived synchronously from storage on each render;
  // bumping `version` after a mutation (e.g. an upload) forces a fresh read.
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const members: Participant[] = team ? getParticipantsByTeam(team.id) : [];
  const pools = team ? getPools() : [];
  const pool1: Pool | null = team
    ? pools.find((p) => p.id === team.poolIdRound1) ?? null
    : null;
  const pool2: Pool | null = team?.poolIdRound2
    ? pools.find((p) => p.id === team.poolIdRound2) ?? null
    : null;
  const passages: Passage[] = team ? getPassagesByTeam(team.id) : [];
  const teamById = new Map<string, Team>(
    team ? getTeams().map((t) => [t.id, t]) : [],
  );
  const docs: Document[] = team ? getDocumentsByTeam(team.id) : [];
  const announcements: Announcement[] = team
    ? getAnnouncements()
        .filter((a) => a.audience === "all" || a.audience === "participants")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 3)
    : [];
  const deadlines: Deadline[] = team
    ? getDeadlines()
        .filter(
          (d) => d.targetRole === "all" || d.targetRole === "participants",
        )
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 3)
    : [];
  const rep = team ? getConstraintReport() : null;
  const myViolations: ConstraintViolation[] =
    team && rep ? rep.violations.filter((v) => v.teamId === team.id) : [];

  const vindex = buildViolationIndex(myViolations);

  // Every hook has run — safe to bail out now. TS narrows team/session to
  // non-null for all code (and JSX) below.
  if (!participantSession || !team) return null;

  const canUpload = isTeamCreator(participantSession.participant, team);
  const ri = docs.find((d) => d.docType === "rapport_intermediaire");
  const rfDeposited = RF_SLOTS.filter((s) =>
    docs.some((d) => d.docType === s.docType),
  ).length;

  return (
    <PageMotion className="-mx-6 lg:-mx-12 -my-10">
      {/* ─── Hero "Arena" (full bleed under fixed top nav) ───────── */}
      <header
        className="relative overflow-hidden text-white noise-overlay noise-overlay--hero team-hero-banner"
        style={{
          backgroundColor: "var(--forest)",
          borderBottom: "16px solid var(--forest-soft)",
          paddingTop: "4rem",
          paddingBottom: "3rem",
        }}
      >
        <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />
        <div
          className="absolute pointer-events-none"
          style={{
            right: "-10%",
            top: "-20%",
            width: "60%",
            height: "140%",
            border: "40px solid rgba(255,255,255,0.04)",
            borderRadius: "9999px",
          }}
        />
        <div
          className="absolute pointer-events-none rotate-45"
          style={{
            left: "2.5rem",
            bottom: "5rem",
            width: 128,
            height: 128,
            border: "4px solid rgba(246,168,6,0.20)",
          }}
        />
        <div
          className="absolute top-0 right-0 clip-triangle-tr"
          style={{
            width: 128,
            height: 128,
            background: "var(--saffron)",
            opacity: 0.9,
          }}
        />
        <div
          className="absolute bottom-0 left-0 clip-triangle-bl"
          style={{
            width: 96,
            height: 96,
            background: "var(--sage)",
            opacity: 0.5,
          }}
        />

        <div className="relative z-10 max-w-[1400px] mx-auto px-8 lg:px-14">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-12">
            <div className="relative">
              <div
                className="absolute -left-6 -top-6"
                style={{
                  width: 16,
                  height: 16,
                  borderTop: "2px solid var(--saffron)",
                  borderLeft: "2px solid var(--saffron)",
                }}
              />
              <div
                className="inline-block px-3 py-1 mb-6"
                style={{
                  background: "var(--forest-soft)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                <span
                  className="font-mont tracking-[0.2em] text-tiny uppercase"
                  style={{ color: "var(--saffron)", fontWeight: 700 }}
                >
                  Équipe · {team.quadrigramme}
                </span>
              </div>
              <h1
                className="font-mont uppercase"
                style={{
                  fontSize: "clamp(2.75rem, 7vw, 5.5rem)",
                  lineHeight: 0.85,
                  letterSpacing: "-0.04em",
                  fontWeight: 900,
                  color: "var(--paper)",
                  textShadow: "0 4px 4px rgba(0,0,0,0.4)",
                }}
              >
                {team.name}
              </h1>
            </div>

            <div className="flex gap-8 lg:gap-16 pb-2">
              <BigStat
                label={`Quadrigramme · Tour ${pool1 ? "1" : "—"}`}
                value={team.quadrigramme}
              />
              <BigStat
                label="Membres"
                value={String(members.length).padStart(2, "0")}
                withDiamond
              />
            </div>
          </div>

          {/* Quick info bar */}
          <div
            className="mt-12 px-6 flex items-center gap-6 overflow-x-auto whitespace-nowrap font-mont text-tiny uppercase tracking-widest"
            style={{
              height: 64,
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.20)",
              fontWeight: 700,
            }}
          >
            <span style={{ color: "var(--saffron)" }}>Affectations</span>
            <span style={{ color: "rgba(244,236,216,0.9)" }}>
              ◆ Tour 1 : {pool1 ? getPoolDisplayLabel(pool1) : "—"}
            </span>
            <span style={{ color: "rgba(244,236,216,0.3)" }}>//</span>
            <span style={{ color: "rgba(244,236,216,0.9)" }}>
              ◆ Tour 2 : {pool2 ? getPoolDisplayLabel(pool2) : "—"}
            </span>
            <span style={{ color: "rgba(244,236,216,0.3)" }}>//</span>
            <span style={{ color: "var(--sage)" }}>
              ✓ {passages.length} passage{passages.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </header>

      {/* ─── Main content ──────────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 pt-16 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-16 items-start">
          {/* LEFT (8/12) */}
          <div className="lg:col-span-8 flex flex-col gap-12">
            {/* Phase 01 — RI */}
            <section>
              <PhaseHeader
                phase="Phase 01"
                title="Rapport Intermédiaire"
                badge={
                  ri
                    ? { label: "Déposé", solid: true }
                    : { label: "En attente", solid: false }
                }
              />
              <BoxedCard>
                <WrittenFile
                  docType="rapport_intermediaire"
                  document={ri}
                  canUpload={canUpload}
                  onChange={refresh}
                  team={team}
                />
              </BoxedCard>
            </section>

            {/* Phase 02 — RF P1..P4 */}
            <section>
              <PhaseHeader
                phase="Phase 02"
                title="Rapport Final"
                badge={{
                  label: `${rfDeposited} / ${RF_SLOTS.length}`,
                  solid: false,
                }}
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-start">
                {RF_SLOTS.map((slot, idx) => {
                  const doc = docs.find((d) => d.docType === slot.docType);
                  const stagger = idx % 2 === 1 ? "md:mt-8" : "md:mt-0";
                  return (
                    <ProblemTile
                      key={slot.docType}
                      number={slot.n}
                      docType={slot.docType}
                      team={team}
                      document={doc}
                      canUpload={canUpload}
                      onChange={refresh}
                      className={stagger}
                    />
                  );
                })}
              </div>
            </section>

            {/* Phase 03 — Passages */}
            {(pool1 || pool2) && (
              <section>
                <PhaseHeader phase="Phase 03" title="Passages" />
                {myViolations.length > 0 && (
                  <div
                    className="flex items-start justify-between gap-4 flex-wrap mb-6 p-4"
                    style={{
                      background: "rgba(178,59,27,0.06)",
                      border: "1px solid #B91C1C",
                    }}
                  >
                    <div>
                      <div
                        className="font-mont text-tiny uppercase tracking-widest mb-1"
                        style={{ color: "#B91C1C", fontWeight: 800 }}
                      >
                        {myViolations.length} conflit
                        {myViolations.length > 1 ? "s" : ""} de contrainte
                      </div>
                      <p
                        className="font-open text-xs"
                        style={{ color: "var(--ink-soft)", maxWidth: "32rem" }}
                      >
                        Votre équipe rejoue un problème déjà vu au tour 1 dans un
                        rôle pénalisé. Le conflit est surligné côté tour 1
                        (origine) et tour 2 (occurrence).
                      </p>
                      {highlight && (
                        <div className="mt-3 page-fade">
                          <ConstraintLegend
                            codes={Array.from(
                              new Set(myViolations.map((v) => v.code)),
                            )}
                          />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setHighlight((h) => !h)}
                      className="font-mont text-tiny uppercase tracking-widest px-3 py-2 shrink-0"
                      style={{
                        background: highlight ? "#B91C1C" : "var(--surface)",
                        color: highlight ? "#FEE2E2" : "#B91C1C",
                        border: "1px solid #B91C1C",
                        fontWeight: 800,
                      }}
                    >
                      {highlight ? "Masquer" : "Surligner"}
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {pool1 && (
                    <PoolPanel
                      label={`${getRoundLabel(1)} · ${getPoolDisplayLabel(pool1)}`}
                      pool={pool1}
                      passages={passages.filter((p) => p.poolId === pool1.id)}
                      team={team}
                      teamById={teamById}
                      vindex={vindex}
                      highlight={highlight}
                    />
                  )}
                  {pool2 && (
                    <PoolPanel
                      label={`${getRoundLabel(2)} · ${getPoolDisplayLabel(pool2)}`}
                      pool={pool2}
                      passages={passages.filter((p) => p.poolId === pool2.id)}
                      team={team}
                      teamById={teamById}
                      vindex={vindex}
                      highlight={highlight}
                    />
                  )}
                </div>
              </section>
            )}
          </div>

          {/* RIGHT (4/12) */}
          <aside className="lg:col-span-4 flex flex-col gap-8">
            <RadarPanel deadlines={deadlines} />
            <AvisPanel announcements={announcements} />
            <RosterPanel
              team={team}
              members={members}
              youId={participantSession.participant.id}
            />
          </aside>
        </div>
      </div>
    </PageMotion>
  );
}

// ─── Hero stat ─────────────────────────────────────────────────────────

function BigStat({
  label,
  value,
  withDiamond,
}: {
  label: string;
  value: string;
  withDiamond?: boolean;
}) {
  return (
    <div className="text-center lg:text-right">
      <div
        className="font-mont leading-none tracking-tighter relative inline-block"
        style={{
          color: "var(--saffron)",
          fontWeight: 900,
          fontSize: "clamp(3rem, 6vw, 5.5rem)",
        }}
      >
        {value}
        {withDiamond && (
          <div
            className="absolute rotate-45"
            style={{
              top: -8,
              right: -16,
              width: 16,
              height: 16,
              border: "2px solid var(--saffron)",
            }}
          />
        )}
      </div>
      <div
        className="font-mont text-tiny uppercase tracking-widest mt-3 pt-2"
        style={{
          color: "rgba(244,236,216,0.6)",
          fontWeight: 700,
          borderTop: "1px solid rgba(255,255,255,0.20)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ─── Phase header ──────────────────────────────────────────────────────

function PhaseHeader({
  phase,
  title,
  badge,
}: {
  phase: string;
  title: string;
  badge?: { label: string; solid: boolean };
}) {
  return (
    <div
      className="flex items-end justify-between mb-8 pb-4"
      style={{ borderBottom: "4px solid var(--forest)" }}
    >
      <div>
        <span
          className="font-mont text-tiny tracking-widest uppercase block mb-1"
          style={{ color: "var(--sage)", fontWeight: 800 }}
        >
          {phase}
        </span>
        <h2
          className="font-mont uppercase tracking-tight"
          style={{
            fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
            fontWeight: 900,
            color: "var(--forest)",
          }}
        >
          {title}
        </h2>
      </div>
      {badge && (
        <div
          className="font-mont text-tiny uppercase tracking-widest px-3 py-1 shadow-brutal-sm"
          style={{
            background: badge.solid ? "var(--forest)" : "var(--surface)",
            color: badge.solid ? "var(--saffron)" : "var(--forest)",
            border: "1px solid var(--forest)",
            fontWeight: 700,
          }}
        >
          {badge.label}
        </div>
      )}
    </div>
  );
}

// ─── Boxed card with corner markers ────────────────────────────────────

function BoxedCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="bg-white border p-8 relative shadow-brutal-sm"
      style={{ borderColor: "var(--forest)" }}
    >
      {(["tl", "tr", "bl", "br"] as const).map((c) => (
        <span
          key={c}
          className="absolute"
          style={{
            width: 8,
            height: 8,
            background: "var(--forest)",
            top: c.startsWith("t") ? -4 : "auto",
            bottom: c.startsWith("b") ? -4 : "auto",
            left: c.endsWith("l") ? -4 : "auto",
            right: c.endsWith("r") ? -4 : "auto",
          }}
        />
      ))}
      {children}
    </div>
  );
}

// ─── Upload helpers ────────────────────────────────────────────────────

function useUploader(team: Team, docType: DocumentType, onChange: () => void) {
  const { session } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    setBusy(true);
    try {
      const result = uploadDocument(session, {
        docType,
        file: { size: file.size, mimeType: file.type, originalName: file.name },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The document metadata is already persisted by uploadDocument — it,
      // not the blob, is what drives the RI/RF "déposé" colour. Refresh now
      // so the tile flips immediately, independently of blob storage which
      // can fail (e.g. localStorage quota on a large PDF) without meaning
      // the deposit failed.
      onChange();
      try {
        const base64 = await fileToBase64(file);
        storeFileBlob(result.document.storagePath, base64);
      } catch {
        setError(
          "Document enregistré, mais l'aperçu n'a pas pu être stocké (fichier trop volumineux ?).",
        );
      }
    } catch (err) {
      setError(
        err instanceof ServiceError
          ? err.message
          : "Échec de l'upload. Réessayez avec un fichier PDF plus léger.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  void team;
  return { inputRef, busy, error, pick, handle };
}

function downloadDoc(doc: Document, onError: (msg: string) => void) {
  const url = createDownloadUrl(doc.storagePath, doc.mimeType);
  if (!url) {
    onError("Fichier introuvable.");
    return;
  }
  const a = window.document.createElement("a");
  a.href = url;
  a.download = doc.originalName;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Written file (RI wide variant) ────────────────────────────────────

function WrittenFile({
  docType,
  team,
  document: doc,
  canUpload,
  onChange,
}: {
  docType: DocumentType;
  team: Team;
  document: Document | undefined;
  canUpload: boolean;
  onChange: () => void;
}) {
  const { inputRef, busy, error, pick, handle } = useUploader(
    team,
    docType,
    onChange,
  );

  return (
    <div className="flex flex-col md:flex-row gap-8 items-stretch">
      <div className="flex-1">
        <div
          className="ri-drop bg-graph-paper p-6 text-center h-full flex flex-col items-center justify-center transition-all cursor-pointer group"
          onClick={canUpload ? pick : undefined}
          style={{
            border: doc
              ? "2px dashed var(--sage)"
              : "2px dashed var(--ink-faint)",
            backgroundColor: doc
              ? "rgba(98,159,115,0.10)"
              : "rgba(255,255,255,0.6)",
          }}
        >
          <div
            className="font-mont leading-none mb-3 transition-transform duration-200 group-hover:scale-110"
            style={{
              color: doc ? "var(--sage-dark)" : "var(--ink-faint)",
              fontSize: "2.5rem",
            }}
          >
            {doc ? "✓" : "↑"}
          </div>
          <p
            className="font-mont mb-1"
            style={{
              fontWeight: 700,
              fontSize: "1rem",
              color: "var(--forest)",
            }}
          >
            {doc?.renamedAs ?? `${team.quadrigramme}_RI_MTYM2025.pdf`}
          </p>
          {doc && (
            <p
              className="font-mont text-tiny uppercase tracking-widest mb-4"
              style={{ color: "var(--ink-soft)", fontWeight: 600 }}
            >
              {new Date(doc.uploadedAt).toLocaleString("fr-FR")}
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handle}
          />
          <div className="flex justify-center gap-2 mt-2">
            {canUpload && (
              <Btn
                onClick={pick}
                disabled={busy}
                variant={doc ? "ghost" : "forest"}
                size="sm"
              >
                {busy ? "Envoi…" : doc ? "Remplacer" : "Déposer"}
              </Btn>
            )}
            {doc && (
              <Btn
                onClick={() => downloadDoc(doc, () => {})}
                variant="ghost"
                size="sm"
              >
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
        </div>
      </div>

      {/* Meta column (data only — uploader, size, etc.) */}
      <div
        className="flex-1 flex flex-col justify-center pl-6 md:border-l-2 relative"
        style={{ borderColor: "var(--saffron)" }}
      >
        <div
          className="absolute hidden md:block diamond-marker"
          style={{
            left: -5,
            top: "50%",
            marginTop: -3,
            background: "var(--saffron)",
          }}
        />
        <h3
          className="font-mont uppercase tracking-widest mb-4"
          style={{
            fontSize: "0.85rem",
            fontWeight: 900,
            color: "var(--forest)",
          }}
        >
          Détails
        </h3>
        <dl className="font-open text-sm space-y-2.5">
          <Row k="Équipe" v={`${team.name} · ${team.quadrigramme}`} />
          <Row k="Statut" v={doc ? "Déposé" : "À déposer"} />
          {doc && <Row k="Fichier" v={doc.renamedAs} />}
          {doc && <Row k="Taille" v={formatBytes(doc.size)} />}
          {doc && <Row k="Verrouillé" v={doc.isLocked ? "Oui" : "Non"} />}
          {!canUpload && (
            <Row k="Permission" v="Lecture seule (non-créateur)" />
          )}
        </dl>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3"
      style={{ borderBottom: "1px dashed var(--border)", paddingBottom: 6 }}
    >
      <dt
        className="font-mont text-tiny uppercase tracking-widest"
        style={{ color: "var(--ink-faint)", fontWeight: 700 }}
      >
        {k}
      </dt>
      <dd
        className="font-mont text-xs truncate text-right"
        style={{ color: "var(--forest)", fontWeight: 600 }}
      >
        {v}
      </dd>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Per-problem tile (RF P1..P4) ──────────────────────────────────────

function ProblemTile({
  number,
  docType,
  team,
  document: doc,
  canUpload,
  onChange,
  className = "",
}: {
  number: number;
  docType: DocumentType;
  team: Team;
  document: Document | undefined;
  canUpload: boolean;
  onChange: () => void;
  className?: string;
}) {
  const { inputRef, busy, error, pick, handle } = useUploader(
    team,
    docType,
    onChange,
  );
  const filled = Boolean(doc);

  // AnimatePresence wraps the empty↔filled swap so framer-motion sees the
  // mount/unmount lifecycle explicitly. `initial={false}` suppresses the
  // first-paint animation when the tile is already filled at page load,
  // so the enter animation only plays when an upload actually flips the
  // state (or a Remplacer assigns a new doc.id).
  return (
    <AnimatePresence mode="wait" initial={false}>
      {filled ? (
        <FilledTile
          key={`filled-${doc!.id}`}
          number={number}
          doc={doc!}
          canUpload={canUpload}
          inputRef={inputRef}
          handle={handle}
          pick={pick}
          busy={busy}
          error={error}
          className={className}
        />
      ) : (
        <EmptyTile
          key="empty"
          number={number}
          quad={team.quadrigramme}
          canUpload={canUpload}
          inputRef={inputRef}
          handle={handle}
          pick={pick}
          busy={busy}
          error={error}
          className={className}
        />
      )}
    </AnimatePresence>
  );
}

// ─── Filled tile (animated entry) ──────────────────────────────────────

function FilledTile({
  number, doc, canUpload, inputRef, handle, pick, busy, error, className,
}: {
  number: number;
  doc: Document;
  canUpload: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  handle: (e: React.ChangeEvent<HTMLInputElement>) => void;
  pick: () => void;
  busy: boolean;
  error: string | null;
  className: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className={`relative p-6 shadow-brutal-sm overflow-hidden noise-overlay noise-overlay--card ${className}`}
      style={{
        backgroundColor: "var(--forest)",
        backgroundImage:
          "radial-gradient(ellipse 100% 60% at 50% 0%, rgba(246,168,6,0.07) 0%, transparent 70%)",
        color: "var(--paper)",
        border: "1px solid var(--forest)",
      }}
    >
        {/* Saffron sweep that runs across the card the moment it appears. */}
        <motion.div
          aria-hidden
          className="absolute inset-y-0 pointer-events-none"
          initial={{ x: "-110%", opacity: 0.55 }}
          animate={{ x: "120%", opacity: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
          style={{
            width: "55%",
            background:
              "linear-gradient(110deg, transparent 0%, rgba(246,168,6,0.18) 50%, transparent 100%)",
            mixBlendMode: "screen",
          }}
        />

        {/* Stamp-in saffron check tile. */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.18, type: "spring", stiffness: 380, damping: 18 }}
          className="absolute top-0 right-0 flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            background: "var(--saffron)",
            color: "var(--forest)",
            fontWeight: 800,
            transformOrigin: "top right",
          }}
        >
          ✓
        </motion.div>
        <div className="flex items-center gap-2 mb-4">
          <span
            className="flex items-center justify-center font-mont"
            style={{
              width: 24,
              height: 24,
              border: "1px solid var(--saffron)",
              color: "var(--saffron)",
              fontWeight: 900,
              transform: "rotate(45deg)",
            }}
          >
            <span style={{ transform: "rotate(-45deg)" }}>{number}</span>
          </span>
          <span
            className="font-mont text-tiny uppercase tracking-widest"
            style={{ color: "rgba(244,236,216,0.7)", fontWeight: 700 }}
          >
            P{number}
          </span>
        </div>
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="font-mont truncate mb-6"
          style={{ fontWeight: 700 }}
        >
          {doc!.renamedAs}
        </motion.p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handle}
        />
        <div className="flex items-center gap-3">
          {canUpload && (
            <button
              onClick={pick}
              disabled={busy}
              className="font-mont text-tiny uppercase tracking-widest flex items-center gap-1 disabled:opacity-40"
              style={{ color: "var(--saffron)", fontWeight: 700 }}
            >
              ✎ {busy ? "Envoi…" : "Remplacer"}
            </button>
          )}
          {doc && (
            <button
              onClick={() => downloadDoc(doc, () => {})}
              className="font-mont text-tiny uppercase tracking-widest"
              style={{ color: "rgba(244,236,216,0.7)", fontWeight: 700 }}
            >
              ↓
            </button>
          )}
        </div>
        {error && (
          <div
            className="mt-3 font-open text-xs px-2 py-1"
            style={{ background: "rgba(178,59,27,0.2)", color: "#FCA5A5" }}
          >
            {error}
          </div>
        )}
    </motion.div>
  );
}

// ─── Empty tile ────────────────────────────────────────────────────────

function EmptyTile({
  number, quad, canUpload, inputRef, handle, pick, busy, error, className,
}: {
  number: number;
  quad: string;
  canUpload: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  handle: (e: React.ChangeEvent<HTMLInputElement>) => void;
  pick: () => void;
  busy: boolean;
  error: string | null;
  className: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      className={`rf-tile-empty relative p-6 bg-graph-paper transition-all duration-200 min-h-[160px] flex flex-col items-center justify-center text-center group ${className}`}
      onClick={canUpload ? pick : undefined}
      style={{
        backgroundColor: "var(--surface)",
        cursor: canUpload ? "pointer" : "not-allowed",
      }}
    >
      <div
        className="rf-tile-number absolute top-4 left-4 flex items-center justify-center font-mont transition-colors duration-200"
        style={{
          width: 24,
          height: 24,
          border: "1px solid rgba(36,75,58,0.2)",
          color: "rgba(36,75,58,0.4)",
          fontWeight: 900,
          transform: "rotate(45deg)",
        }}
      >
        <span style={{ transform: "rotate(-45deg)" }}>{number}</span>
      </div>
      <div
        className="font-mont mb-2 mt-4 transition-transform duration-200 group-hover:scale-110 group-hover:text-[color:var(--saffron)]"
        style={{ fontSize: "1.5rem", color: "var(--ink-faint)" }}
      >
        ↑
      </div>
      <p
        className="font-mont text-tiny uppercase tracking-widest"
        style={{ color: "var(--ink-soft)", fontWeight: 700 }}
      >
        {busy ? "Envoi…" : `P${number}`}
      </p>
      <p
        className="font-mont text-micro uppercase tracking-widest mt-1"
        style={{ color: "var(--ink-faint)", fontWeight: 600 }}
      >
        {quad}_RF_P{number}.pdf
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handle}
      />
      {error && (
        <div
          className="mt-3 font-open text-xs px-2 py-1"
          style={{ background: "rgba(178,59,27,0.08)", color: "var(--clay)" }}
        >
          {error}
        </div>
      )}
    </motion.div>
  );
}

// ─── Pool panel (compact passage list) ─────────────────────────────────

function PoolPanel({
  label,
  pool,
  passages,
  team,
  teamById,
  vindex,
  highlight,
}: {
  label: string;
  pool: Pool;
  passages: Passage[];
  team: Team;
  teamById: Map<string, Team>;
  vindex: Map<string, ConstraintViolation[]>;
  highlight: boolean;
}) {
  const sorted = [...passages].sort((a, b) => a.label.localeCompare(b.label));
  return (
    <div
      className="bg-white border p-6 relative shadow-brutal-sm"
      style={{ borderColor: "var(--forest)" }}
    >
      <div
        className="flex items-end justify-between mb-4 pb-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div>
          <div
            className="font-mont text-tiny uppercase tracking-widest mb-1"
            style={{ color: "var(--saffron-dark)", fontWeight: 700 }}
          >
            {label}
          </div>
          <div
            className="font-mont"
            style={{
              fontSize: "1.5rem",
              fontWeight: 900,
              color: "var(--forest)",
              letterSpacing: "-0.02em",
            }}
          >
            {pool.label}
          </div>
        </div>
        <span
          className="font-mont text-tiny uppercase tracking-widest px-2 py-0.5"
          style={{
            background: "var(--forest)",
            color: "var(--saffron)",
            fontWeight: 700,
          }}
        >
          {passages.length}
        </span>
      </div>

      <div className="space-y-2">
        {sorted.map((p) => {
          const role = teamRoleFromIds(team, p);
          const meta = role ? ROLE_PALETTE[role] : null;
          const violation =
            role && role !== "extra"
              ? dominantViolation(vindex.get(`${p.label}::${role}`))
              : null;
          const flagged = Boolean(highlight && violation);
          const cmeta = flagged ? CONSTRAINT_PALETTE[violation!.code] : null;
          const others = [
            p.defenderTeamId,
            p.opponentTeamId,
            p.reporterTeamId,
            p.extraTeamId,
          ]
            .filter((id) => id && id !== team.id)
            .map((id) => teamById.get(id!)?.quadrigramme)
            .filter(Boolean);
          return (
            <Link
              key={`${p.id}-${flagged ? "f" : "n"}`}
              to={`/passage/${p.id}`}
              className={`flex items-center justify-between gap-3 px-3 py-2 hover-row transition-colors${
                flagged ? " conflict-row relative" : ""
              }`}
              style={
                flagged && cmeta
                  ? {
                      border: `1px solid ${cmeta.bg}`,
                      background: "rgba(178,59,27,0.07)",
                      color: cmeta.bg,
                    }
                  : { border: "1px solid var(--border)" }
              }
              title={
                flagged && cmeta
                  ? `${violation!.code} · P${violation!.problemNumber} · ${cmeta.desc} (poids ${cmeta.weight})`
                  : undefined
              }
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="font-mont text-xs"
                  style={{ color: "var(--ink-faint)", fontWeight: 700 }}
                >
                  {p.label}
                </span>
                <span
                  className="font-mont"
                  style={{ color: "var(--saffron-dark)", fontWeight: 800 }}
                >
                  P{p.problemNumber}
                </span>
                <span
                  className="font-mont text-xs truncate"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {others.join(" · ")}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {flagged && cmeta && (
                  <span
                    className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
                    style={{
                      background: cmeta.bg,
                      color: cmeta.fg,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                    }}
                  >
                    {violation!.code}
                  </span>
                )}
                {meta && (
                  <span
                    className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
                    style={{
                      background: meta.bg,
                      color: meta.fg,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                    }}
                  >
                    {meta.short}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Right rail panels ─────────────────────────────────────────────────

function RadarPanel({ deadlines }: { deadlines: Deadline[] }) {
  return (
    <div
      className="p-6 relative shadow-brutal-sm overflow-hidden noise-overlay noise-overlay--card radar-card dark-card"
      style={{
        backgroundColor: "var(--forest)",
        color: "var(--paper)",
        border: "1px solid var(--forest)",
      }}
    >
      <div
        className="absolute top-0 right-0 clip-triangle-tr"
        style={{ width: 48, height: 48, background: "rgba(246,168,6,0.4)" }}
      />
      <h3
        className="font-mont uppercase tracking-tight mb-5 flex items-center gap-2"
        style={{ fontSize: "1.1rem", fontWeight: 900, color: "var(--saffron)" }}
      >
        <span
          className="diamond-marker"
          style={{ background: "var(--saffron)" }}
        />
        Radar
      </h3>
      {deadlines.length === 0 ? (
        <p
          className="font-open text-sm italic"
          style={{ color: "rgba(244,236,216,0.55)" }}
        >
          —
        </p>
      ) : (
        <ul className="space-y-4">
          {deadlines.map((d) => (
            <li key={d.id} className="flex items-center gap-3">
              <DateChip date={d.date} />
              <div className="min-w-0">
                <div className="font-mont truncate" style={{ fontWeight: 700 }}>
                  {d.label}
                </div>
                <div
                  className="font-mont text-micro uppercase tracking-widest"
                  style={{ color: "rgba(244,236,216,0.55)", fontWeight: 600 }}
                >
                  {d.targetRole}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Accepts either "YYYY-MM-DD" (seed format) or "DD-MM-YYYY"
function DateChip({ date }: { date: string }) {
  const parts = date.split("-");
  let day: string, monthIdx: number;
  if (parts[0]?.length === 4) {
    day = parts[2] ?? "—";
    monthIdx = Number(parts[1]) - 1;
  } else {
    day = parts[0] ?? "—";
    monthIdx = Number(parts[1]) - 1;
  }
  const months = [
    "JAN",
    "FEV",
    "MAR",
    "AVR",
    "MAI",
    "JUI",
    "JUL",
    "AOU",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const month = months[monthIdx] ?? "";
  return (
    <div
      className="flex flex-col items-center justify-center shrink-0 rotate-45"
      style={{ width: 48, height: 48, border: "1px solid var(--saffron)" }}
    >
      <div className="-rotate-45 text-center leading-none">
        <div
          className="font-mont text-micro uppercase tracking-widest"
          style={{ color: "var(--saffron)", fontWeight: 700 }}
        >
          {month}
        </div>
        <div
          className="font-mont"
          style={{
            color: "var(--saffron)",
            fontWeight: 900,
            fontSize: "1.1rem",
            marginTop: 2,
          }}
        >
          {day}
        </div>
      </div>
    </div>
  );
}

function AvisPanel({ announcements }: { announcements: Announcement[] }) {
  return (
    <div
      className="bg-white p-6 relative shadow-brutal-sm"
      style={{ border: "1px solid var(--forest)" }}
    >
      <h3
        className="font-mont uppercase tracking-tight mb-4 flex items-center gap-2 pb-3"
        style={{
          fontSize: "1.1rem",
          fontWeight: 900,
          color: "var(--forest)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          className="diamond-marker"
          style={{ background: "var(--saffron)" }}
        />
        Avis &amp; Informations
      </h3>
      {announcements.length === 0 ? (
        <p
          className="font-open text-sm italic"
          style={{ color: "var(--ink-faint)" }}
        >
          —
        </p>
      ) : (
        <ul className="space-y-4">
          {announcements.map((a) => (
            <li
              key={a.id}
              className="pb-3"
              style={{ borderBottom: "1px dashed var(--border)" }}
            >
              <div
                className="font-mont text-micro uppercase tracking-widest"
                style={{ color: "var(--saffron-dark)", fontWeight: 700 }}
              >
                {formatAnnouncementDate(a.createdAt)}
              </div>
              <p
                className="font-open text-sm mt-1 leading-snug"
                style={{ color: "var(--ink)" }}
              >
                {a.title}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/annonces"
        className="block mt-2 font-mont text-tiny uppercase tracking-widest"
        style={{ color: "var(--saffron-dark)", fontWeight: 700 }}
      >
        Toutes les annonces
      </Link>
    </div>
  );
}

function formatAnnouncementDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  const hhmm = d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (isToday) return `Aujourd'hui · ${hhmm}`;
  if (isYest) return `Hier · ${hhmm}`;
  return d.toLocaleDateString("fr-FR") + " · " + hhmm;
}


function RosterPanel({
  team,
  members,
  youId,
}: {
  team: Team;
  members: Participant[];
  youId: string;
}) {
  return (
    <div
      className="bg-white border p-6 relative shadow-brutal-sm"
      style={{ borderColor: "var(--forest)" }}
    >
      <div
        className="flex items-center justify-between mb-4 pb-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h3
          className="font-mont uppercase tracking-tight"
          style={{
            fontSize: "1.1rem",
            fontWeight: 900,
            color: "var(--forest)",
          }}
        >
          Coéquipiers
        </h3>
        <span
          className="font-mont text-tiny uppercase tracking-widest"
          style={{ color: "var(--ink-faint)", fontWeight: 700 }}
        >
          {members.length}
        </span>
      </div>
      <ul className="space-y-3">
        {members.map((m) => {
          const isCreator = m.id === team.creatorId;
          const isYou = m.id === youId;
          return (
            <li key={m.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div
                  className="font-mont truncate"
                  style={{
                    fontWeight: 700,
                    color: "var(--forest)",
                    fontSize: "0.95rem",
                  }}
                >
                  {m.firstName} {m.lastName}
                  {isYou && (
                    <span
                      className="font-mont text-micro uppercase tracking-widest ml-2"
                      style={{ color: "var(--ink-faint)", fontWeight: 600 }}
                    >
                      (vous)
                    </span>
                  )}
                </div>
                <div
                  className="font-open text-xs truncate"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {m.email}
                </div>
              </div>
              {isCreator && (
                <span
                  className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5 shrink-0"
                  style={{
                    background: "var(--saffron)",
                    color: "var(--forest)",
                    fontWeight: 800,
                  }}
                >
                  ★
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
