import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, BrutalCard, SectionHeading, Badge, Btn, PageMotion, Stagger } from "@/features/shared/primitives";
import { DocPreviewModal, useDocPreview } from "@/features/shared/DocPreview";
import { ROLE_PALETTE, StatCounter } from "@/features/shared/widgets";
import { useSession } from "@/features/shared/SessionContext";
import {
  getJuryPassageAssignments,
  getJuryMembers,
} from "@/lib/repositories/juryRepository";
import { getPools, getPassages } from "@/lib/repositories/poolRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getDocuments, downloadDocument } from "@/lib/repositories/documentRepository";
import { getPoolDisplayLabel, getRoundLabel } from "@/utils/naming";
import type { Document, DocumentType, JuryMember, Passage, Pool, Team } from "@/types";

// JuryPassagesPage — full list of passages a jury member is assigned to.
//
// Layout:
//  · Stat cards (total assignments, per round, with co-juror count)
//  · Round filter (All / Tour 1 / Tour 2)
//  · Per-passage card with logistics, teams, documents and co-juror.

type RoundFilter = "all" | 1 | 2;

interface PassageContext {
  passage: Passage;
  pool: Pool | undefined;
  defender: Team | undefined;
  opponent: Team | undefined;
  reporter: Team | undefined;
  extra: Team | undefined;
  coJurors: JuryMember[];
}

export function JuryPassagesPage() {
  const { session } = useSession();
  const [filter, setFilter] = useState<RoundFilter>("all");
  const preview = useDocPreview();
  const juryMemberId = session?.role === "jury" ? session.juryMember.id : undefined;

  const passageAssignmentsQ = useQuery({ queryKey: ["jury-passage-assignments"], queryFn: getJuryPassageAssignments });
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: getPools });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: getTeams });
  const passagesQ = useQuery({ queryKey: ["passages"], queryFn: getPassages });
  const jurorsQ = useQuery({ queryKey: ["jury-members"], queryFn: getJuryMembers });
  const docsQ = useQuery({ queryKey: ["documents"], queryFn: getDocuments });

  const loading =
    passageAssignmentsQ.isLoading || poolsQ.isLoading || teamsQ.isLoading ||
    passagesQ.isLoading || jurorsQ.isLoading || docsQ.isLoading;

  const docsByTeam = useMemo(() => {
    const map = new Map<string, Document[]>();
    for (const d of docsQ.data ?? []) {
      const list = map.get(d.teamId);
      if (list) list.push(d); else map.set(d.teamId, [d]);
    }
    return map;
  }, [docsQ.data]);

  const items = useMemo<PassageContext[]>(() => {
    if (!juryMemberId || !passageAssignmentsQ.data || !poolsQ.data || !teamsQ.data || !passagesQ.data || !jurorsQ.data) {
      return [];
    }
    const pools = new Map(poolsQ.data.map(p => [p.id, p]));
    const teams = new Map(teamsQ.data.map(t => [t.id, t]));
    const jurors = new Map(jurorsQ.data.map(j => [j.id, j]));
    const allAssignments = passageAssignmentsQ.data;

    const myPassageIds = new Set(
      allAssignments.filter(a => a.juryMemberId === juryMemberId).map(a => a.passageId),
    );
    const mine = passagesQ.data.filter(p => myPassageIds.has(p.id));

    const enriched: PassageContext[] = mine.map(passage => ({
      passage,
      pool: pools.get(passage.poolId),
      defender: teams.get(passage.defenderTeamId),
      opponent: teams.get(passage.opponentTeamId),
      reporter: teams.get(passage.reporterTeamId),
      extra: passage.extraTeamId ? teams.get(passage.extraTeamId) : undefined,
      coJurors: allAssignments
        .filter(a => a.passageId === passage.id && a.juryMemberId !== juryMemberId)
        .map(a => jurors.get(a.juryMemberId))
        .filter(Boolean) as JuryMember[],
    }));

    enriched.sort((a, b) => a.passage.label.localeCompare(b.passage.label));
    return enriched;
  }, [juryMemberId, passageAssignmentsQ.data, poolsQ.data, teamsQ.data, passagesQ.data, jurorsQ.data]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter(it => it.pool?.round === filter);
  }, [items, filter]);

  const r1Count = items.filter(it => it.pool?.round === 1).length;
  const r2Count = items.filter(it => it.pool?.round === 2).length;

  if (!session || session.role !== "jury") return null;

  if (loading) {
    return <div className="py-24 text-center text-foreground/55">Chargement…</div>;
  }

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Espace jury"
        title="Passages à évaluer"
        sub="Tous les passages auxquels vous êtes affecté. Téléchargez les documents et préparez votre évaluation."
        right={<Badge tone="dark">{items.length} passage{items.length > 1 ? "s" : ""}</Badge>}
      />

      {/* Stat cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total" value={items.length} progressColor="var(--saffron)" />
        <StatCard label="Tour 1" value={r1Count} denom={items.length} progressColor="var(--sage)" />
        <StatCard label="Tour 2" value={r2Count} denom={items.length} progressColor="var(--forest-soft)" />
        <StatCard
          label="Co-jurés"
          value={uniqueCoJurors(items)}
          progressColor="var(--saffron-dark)"
        />
      </section>

      {/* Filter */}
      <section>
        <SectionHeading
          title="Mes passages"
          right={
            <div className="inline-flex p-0.5"
                 style={{ background: "var(--surface)", border: "2px solid var(--forest)", boxShadow: "2px 2px 0 0 var(--forest)" }}>
              {([
                { v: "all" as const, label: "Tous" },
                { v: 1 as const, label: "Tour 1" },
                { v: 2 as const, label: "Tour 2" },
              ]).map(opt => {
                const active = filter === opt.v;
                return (
                  <button
                    key={String(opt.v)}
                    onClick={() => setFilter(opt.v)}
                    className="px-3 py-1 font-mont text-micro uppercase tracking-widest transition-colors"
                    style={{
                      background: active ? "var(--forest)" : "transparent",
                      color: active ? "var(--saffron)" : "var(--ink-soft)",
                      fontWeight: active ? 900 : 700,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          }
        />

        {filtered.length === 0 ? (
          <BrutalCard className="p-10">
            <p className="font-mont mb-1"
               style={{ fontSize: "1.1rem", color: "var(--forest)", fontWeight: 900 }}>
              Aucun passage assigné
            </p>
            <p className="font-open text-sm max-w-xl" style={{ color: "var(--ink-soft)" }}>
              {filter === "all"
                ? "Vous n'êtes assigné à aucun passage pour le moment."
                : "Aucun passage pour ce tour."}
            </p>
          </BrutalCard>
        ) : (
          <Stagger
            key={String(filter)}
            className="grid grid-cols-1 xl:grid-cols-2 gap-6"
          >
            {filtered.map(ctx => (
              <PassageCard key={ctx.passage.id} ctx={ctx} docsByTeam={docsByTeam} onPreview={preview.open} />
            ))}
          </Stagger>
        )}
      </section>

      <DocPreviewModal state={preview.state} onClose={preview.close} />
    </PageMotion>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────

function StatCard({
  label, value, denom, progressColor,
}: {
  label: string;
  value: number;
  denom?: number;
  progressColor?: string;
}) {
  const pct = denom ? Math.round((value / denom) * 100) : null;
  return (
    <BrutalCard hoverable className="p-6 noise-overlay noise-overlay--soft">
      <div className="absolute top-0 right-0 clip-triangle-tr pointer-events-none"
           style={{ width: 48, height: 48, background: "rgba(18,32,25,0.04)" }} />
      <p className="font-mont text-tiny uppercase tracking-widest mb-2"
         style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
        {label}
      </p>
      <div className="flex items-end gap-3 mb-3">
        <StatCounter
          value={value}
          className="font-mont leading-none"
          style={{ fontSize: "3rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.02em" }}
        />
        {denom !== undefined && (
          <span className="text-sm font-mont" style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
            / {denom}
          </span>
        )}
      </div>
      {pct !== null && (
        <div className="w-full" style={{ height: 6, background: "var(--paper-2)" }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: progressColor ?? "var(--saffron)",
            transition: "width 600ms cubic-bezier(0.22,1,0.36,1)",
          }} />
        </div>
      )}
    </BrutalCard>
  );
}

// ─── Per-passage card ─────────────────────────────────────────────────

function PassageCard({
  ctx, docsByTeam, onPreview,
}: {
  ctx: PassageContext;
  docsByTeam: Map<string, Document[]>;
  onPreview: (doc: Document) => void;
}) {
  const { passage, pool, defender, opponent, reporter, extra, coJurors } = ctx;
  const accent = pool?.round === 2 ? "var(--saffron)" : "var(--forest)";

  return (
    <BrutalCard className="overflow-hidden">
      {/* Header strip */}
      <div className="px-5 py-4 flex items-center justify-between gap-3"
           style={{
             borderBottom: "2px solid var(--forest)",
             background: pool?.round === 2 ? "rgba(246,168,6,0.08)" : "rgba(98,159,115,0.10)",
           }}>
        <div className="flex items-center gap-3 min-w-0">
          <span style={{ width: 6, height: 28, background: accent }} />
          <div className="min-w-0">
            <div className="font-mont text-tiny uppercase tracking-widest"
                 style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
              {pool ? `${getPoolDisplayLabel(pool)} · ${getRoundLabel(pool.round)}` : "Poule inconnue"}
            </div>
            <div className="flex items-baseline gap-3 mt-0.5">
              <h3 className="font-mont uppercase"
                  style={{ fontSize: "1.25rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.01em" }}>
                {passage.label}
              </h3>
              <span className="font-mont"
                    style={{ color: "var(--saffron-dark)", fontWeight: 900, fontSize: "1.05rem" }}>
                Problème {passage.problemNumber}
              </span>
            </div>
          </div>
        </div>
        <ScheduleChip day={passage.day} time={passage.timeSlot} room={passage.room} />
      </div>

      {/* Teams */}
      <div className="p-5 space-y-2">
        <div className="font-mont text-tiny uppercase tracking-widest mb-2"
             style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
          Équipes
        </div>
        <TeamRow team={defender} role="defender" />
        <TeamRow team={opponent} role="opponent" />
        <TeamRow team={reporter} role="reporter" />
        {extra && <TeamRow team={extra} role="extra" />}
      </div>

      {/* Documents */}
      <div className="p-5 pt-0">
        <div className="font-mont text-tiny uppercase tracking-widest mb-2"
             style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
          Documents
        </div>
        <DocumentList
          passage={passage} defender={defender} opponent={opponent} reporter={reporter}
          docsByTeam={docsByTeam} onPreview={onPreview}
        />
      </div>

      {/* Co-jurors */}
      <div className="px-5 py-3 flex items-center justify-between"
           style={{ borderTop: "1px dashed var(--border)" }}>
        <div className="font-mont text-tiny uppercase tracking-widest"
             style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
          {coJurors.length === 0 ? "Aucun co-juré" : "Co-jurés"}
        </div>
        <div className="flex gap-1.5">
          {coJurors.map(j => (
            <span key={j.id}
                  title={`${j.firstName} ${j.lastName}${j.city ? ` · ${j.city}` : ""}`}
                  className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
                  style={{ background: "var(--forest)", color: "var(--saffron)", fontWeight: 800 }}>
              {initials(j.firstName, j.lastName)}
            </span>
          ))}
        </div>
      </div>

      {/* Evaluate CTA */}
      <Link to={`/passages/${passage.id}`}
            className="px-5 py-3 flex items-center justify-between transition-colors hover-row"
            style={{ borderTop: "1px solid var(--border)", background: "var(--paper-2)" }}>
        <span className="font-mont text-tiny uppercase tracking-widest"
              style={{ color: "var(--ink-soft)", fontWeight: 800 }}>
          Grille d'évaluation
        </span>
        <span className="font-mont text-tiny uppercase tracking-widest"
              style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
          Évaluer le passage
        </span>
      </Link>
    </BrutalCard>
  );
}

function ScheduleChip({ day, time, room }: { day?: string; time?: string; room?: string }) {
  if (!day && !time && !room) {
    return <Badge tone="neutral">À planifier</Badge>;
  }
  const dayLabel = day ? formatDate(day) : "—";
  return (
    <div className="text-right shrink-0">
      <div className="font-mont"
           style={{ color: "var(--forest)", fontWeight: 900, fontSize: "0.95rem" }}>
        {dayLabel}
      </div>
      <div className="font-mont text-micro uppercase tracking-widest"
           style={{ color: "var(--ink-soft)", fontWeight: 700 }}>
        {[time, room].filter(Boolean).join(" · ") || "—"}
      </div>
    </div>
  );
}

function formatDate(ddmmyyyy: string): string {
  const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return ddmmyyyy;
  const [, dd, mm, yyyy] = m;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function TeamRow({ team, role }: { team: Team | undefined; role: keyof typeof ROLE_PALETTE }) {
  const meta = ROLE_PALETTE[role];
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover-row"
         style={{ border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5 shrink-0"
              style={{ background: meta.bg, color: meta.fg, fontWeight: 800, letterSpacing: "0.1em" }}>
          {meta.short}
        </span>
        <span className="font-mont"
              style={{ color: "var(--forest)", fontWeight: 900, fontSize: "0.95rem", letterSpacing: "0.05em" }}>
          {team?.quadrigramme ?? "—"}
        </span>
        <span className="font-open text-xs truncate" style={{ color: "var(--ink-soft)" }}>
          {team?.name ?? ""}
        </span>
      </div>
    </div>
  );
}

// ─── Documents list (downloadable) ────────────────────────────────────

function DocumentList({
  passage, defender, opponent, reporter, docsByTeam, onPreview,
}: {
  passage: Passage;
  defender: Team | undefined;
  opponent: Team | undefined;
  reporter: Team | undefined;
  docsByTeam: Map<string, Document[]>;
  onPreview: (doc: Document) => void;
}) {
  // Compute the four documents the juror can read for this passage.
  const items: Array<{ label: string; team: Team | undefined; expected: DocumentType | null }> = [
    {
      label: `Rapport final · P${passage.problemNumber}`,
      team: defender,
      expected: `rapport_final_p${passage.problemNumber}` as DocumentType,
    },
    {
      label: "Présentation",
      team: defender,
      expected: pickPresentationType(defender, docsByTeam),
    },
    {
      label: "Fiche opposant",
      team: opponent,
      expected: pickSummaryType("opposant", opponent, docsByTeam),
    },
    {
      label: "Fiche rapporteur",
      team: reporter,
      expected: pickSummaryType("rapporteur", reporter, docsByTeam),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {items.map((it, idx) => (
        <DocRow key={idx} label={it.label} team={it.team} expected={it.expected} docsByTeam={docsByTeam} onPreview={onPreview} />
      ))}
    </div>
  );
}

function DocRow({
  label, team, expected, docsByTeam, onPreview,
}: {
  label: string;
  team: Team | undefined;
  expected: DocumentType | null;
  docsByTeam: Map<string, Document[]>;
  onPreview: (doc: Document) => void;
}) {
  const doc = team && expected
    ? (docsByTeam.get(team.id) ?? []).find(d => d.docType === expected)
    : undefined;

  const handleDownload = async () => {
    if (!doc) return;
    try {
      const { url, filename } = await downloadDocument(doc.id, doc.originalName);
      const a = window.document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Téléchargement impossible.");
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 transition-colors hover-row"
         style={{ border: "1px solid var(--border)" }}>
      <div className="min-w-0 flex-1">
        <div className="font-mont text-xs"
             style={{ color: "var(--forest)", fontWeight: 800 }}>
          {label}
        </div>
        <div className="font-open text-micro truncate"
             style={{ color: "var(--ink-soft)" }}>
          {team ? team.quadrigramme : "—"}
          {doc && ` · ${doc.renamedAs}`}
        </div>
      </div>
      {doc ? (
        <div className="flex items-center gap-1 shrink-0">
          <Btn variant="ghost" size="sm" onClick={() => onPreview(doc)}>Voir</Btn>
          <Btn variant="ghost" size="sm" onClick={handleDownload}>↓</Btn>
        </div>
      ) : (
        <span className="font-mont text-micro uppercase tracking-widest"
              style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
          —
        </span>
      )}
    </div>
  );
}

// Compute the canonical docType for the defender's presentation in this
// passage. Returns null if the defender hasn't appeared in any prior
// passage as defender (shouldn't happen — every passage has a unique
// defender team).
function pickPresentationType(team: Team | undefined, docsByTeam: Map<string, Document[]>): DocumentType | null {
  if (!team) return null;
  // We don't have the team's full passage history here; the participant-
  // side flow uses index 1 or 2 (first/second time the team defends). For
  // the jury read-side we accept either: pick whichever exists in storage.
  const docs = docsByTeam.get(team.id) ?? [];
  for (const n of [1, 2] as const) {
    const t = `presentation_${n}` as DocumentType;
    if (docs.some(d => d.docType === t)) return t;
  }
  return "presentation_1" as DocumentType;
}

function pickSummaryType(
  role: "opposant" | "rapporteur",
  team: Team | undefined,
  docsByTeam: Map<string, Document[]>,
): DocumentType | null {
  if (!team) return null;
  const docs = docsByTeam.get(team.id) ?? [];
  for (const n of [1, 2] as const) {
    const t = `fiche_synthese_${role}_${n}` as DocumentType;
    if (docs.some(d => d.docType === t)) return t;
  }
  return `fiche_synthese_${role}_1` as DocumentType;
}

// ─── helpers ──────────────────────────────────────────────────────────

function initials(a: string, b: string): string {
  return `${(a[0] ?? "").toUpperCase()}${(b[0] ?? "").toUpperCase()}`;
}

function uniqueCoJurors(items: PassageContext[]): number {
  const set = new Set<string>();
  for (const it of items) {
    for (const j of it.coJurors) set.add(j.id);
  }
  return set.size;
}
