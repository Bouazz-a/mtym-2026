import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  PageHeader,
  BrutalCard,
  Badge,
  SectionHeading,
  PageMotion,
} from "@/features/shared/primitives";
import { useSession } from "@/features/shared/SessionContext";
import { getJuryAssignments } from "@/lib/repositories/juryRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getDocuments } from "@/lib/repositories/documentRepository";
import { getReportEvaluations } from "@/lib/repositories/evaluationRepository";
import type { Document, ReportEvaluation, ReportType, Team } from "@/types";

// JuryTeamsPage — list of teams the connected juror has to grade for
// written reports (intermédiaire and/or final). Clicking a card opens
// the grading detail at /equipes/:teamId.

const PROBLEMS = [1, 2, 3, 4] as const;

interface EnrichedTeam {
  team: Team;
  scopes: ReportType[]; // {"intermediaire"?, "final"?}
  riSubmitted: boolean;
  rfCount: number;
  myEvaluations: number; // how many evaluations this juror has saved for this team
  expected: number; // 1 RI + 4 RFs scoped to what *I* must grade
}

export function JuryTeamsPage() {
  const { session } = useSession();
  const juryMemberId = session?.role === "jury" ? session.juryMember.id : undefined;

  const assignmentsQ = useQuery({ queryKey: ["jury-assignments"], queryFn: getJuryAssignments });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: getTeams });
  const docsQ = useQuery({ queryKey: ["documents"], queryFn: getDocuments });
  // Server-side, a jury caller's report-evaluations are already restricted
  // to their own — no need to filter by juryMemberId again client-side.
  const myEvalsQ = useQuery({ queryKey: ["report-evaluations", "mine"], queryFn: () => getReportEvaluations() });

  const loading = assignmentsQ.isLoading || teamsQ.isLoading || docsQ.isLoading || myEvalsQ.isLoading;

  const items = useMemo<EnrichedTeam[]>(() => {
    if (!juryMemberId || !assignmentsQ.data || !teamsQ.data || !docsQ.data || !myEvalsQ.data) return [];

    const teamById = new Map(teamsQ.data.map(t => [t.id, t]));
    const mine = assignmentsQ.data.filter(a => a.juryMemberId === juryMemberId);
    const myEvals = myEvalsQ.data;

    const byId = new Map<string, EnrichedTeam>();
    for (const a of mine) {
      const team = teamById.get(a.teamId);
      if (team) attach(byId, team, a.reportType, myEvals, docsQ.data);
    }

    return [...byId.values()].sort((a, b) =>
      a.team.quadrigramme.localeCompare(b.team.quadrigramme),
    );
  }, [juryMemberId, assignmentsQ.data, teamsQ.data, docsQ.data, myEvalsQ.data]);

  if (!session || session.role !== "jury") return null;

  if (loading) {
    return <div className="py-24 text-center text-foreground/55">Chargement…</div>;
  }

  const totalExpected = items.reduce((acc, it) => acc + it.expected, 0);
  const totalDone = items.reduce(
    (acc, it) => acc + Math.min(it.myEvaluations, it.expected),
    0,
  );
  const pct = totalExpected ? Math.round((totalDone / totalExpected) * 100) : 0;

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Espace jury"
        title="Mes équipes"
        sub="Les équipes dont vous corrigez les rapports écrits. Cliquez une équipe pour télécharger ses dépôts et saisir vos remarques."
        right={
          <Badge tone="dark">
            {items.length} équipe{items.length > 1 ? "s" : ""}
          </Badge>
        }
      />

      {/* Stat cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="Équipes assignées"
          value={items.length}
          progressColor="var(--saffron)"
        />
        <StatCard
          label="Évaluations rédigées"
          value={totalDone}
          denom={totalExpected}
          progressColor="var(--sage)"
          highlight={totalDone > 0 && totalDone === totalExpected}
        />
        <StatCard
          label="Progression"
          value={pct}
          suffix="%"
          progressColor="var(--forest-soft)"
        />
      </section>

      <section>
        <SectionHeading
          title="Liste des équipes"
          right={
            <Badge
              tone={pct === 100 ? "sage" : pct > 0 ? "saffron" : "neutral"}
            >
              {pct}% complet
            </Badge>
          }
        />

        {items.length === 0 ? (
          <BrutalCard className="p-10">
            <p
              className="font-mont mb-1"
              style={{
                fontSize: "1.1rem",
                color: "var(--forest)",
                fontWeight: 900,
              }}
            >
              Aucune équipe assignée
            </p>
            <p
              className="font-open text-sm max-w-xl"
              style={{ color: "var(--ink-soft)" }}
            >
              Vous serez notifié dès qu'un organisateur vous affectera des
              équipes à corriger.
            </p>
          </BrutalCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {items.map((it) => (
              <TeamCard key={it.team.id} item={it} />
            ))}
          </div>
        )}
      </section>
    </PageMotion>
  );
}

// ─── Team card ────────────────────────────────────────────────────────

function TeamCard({ item }: { item: EnrichedTeam }) {
  const { team, scopes, riSubmitted, rfCount, myEvaluations, expected } = item;
  const isComplete = myEvaluations >= expected;
  const pct = expected
    ? Math.round((Math.min(myEvaluations, expected) / expected) * 100)
    : 0;

  return (
    <Link to={`/equipes/${team.id}`} className="block">
      <BrutalCard
        hoverable
        highlight={isComplete}
        className="overflow-hidden flex flex-col h-full"
      >
        {/* Header strip */}
        <div
          className="px-5 py-4 flex items-start justify-between gap-3"
          style={{
            borderBottom: "2px solid var(--forest)",
            background: "rgba(98,159,115,0.08)",
          }}
        >
          <div className="min-w-0">
            <div
              className="font-mont"
              style={{
                color: "var(--saffron)",
                fontWeight: 900,
                fontSize: "1.5rem",
                letterSpacing: "0.08em",
              }}
            >
              {team.quadrigramme}
            </div>
            <div
              className="font-open text-xs mt-0.5 truncate"
              style={{ color: "var(--ink-soft)" }}
            >
              {team.name}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {scopes.includes("intermediaire") && <Badge tone="sage">RI</Badge>}
            {scopes.includes("final") && <Badge tone="saffron">RF</Badge>}
          </div>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 space-y-4">
          <DepositLine
            label="Rapport intermédiaire"
            done={riSubmitted ? 1 : 0}
            total={1}
            visible={scopes.includes("intermediaire")}
          />
          <DepositLine
            label="Rapports finaux"
            done={rfCount}
            total={PROBLEMS.length}
            visible={scopes.includes("final")}
          />

          {/* Progress strip */}
          <div
            className="pt-3"
            style={{ borderTop: "1px dashed var(--border)" }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="font-mont text-tiny uppercase tracking-widest"
                style={{ color: "var(--ink-faint)", fontWeight: 800 }}
              >
                Mon évaluation
              </span>
              <span
                className="font-mont text-xs"
                style={{
                  color: isComplete
                    ? "var(--sage-dark)"
                    : "var(--saffron-dark)",
                  fontWeight: 900,
                }}
              >
                {myEvaluations}/{expected}
              </span>
            </div>
            <div
              className="w-full"
              style={{ height: 6, background: "var(--paper-2)" }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: isComplete ? "var(--sage)" : "var(--saffron)",
                  transition: "width 500ms",
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--paper-2)",
          }}
        >
          <span
            className="font-mont text-tiny uppercase tracking-widest"
            style={{ color: "var(--ink-soft)", fontWeight: 800 }}
          >
            {isComplete ? "Évaluation complète" : "À évaluer"}
          </span>
          <span
            className="font-mont text-tiny uppercase tracking-widest"
            style={{ color: "var(--saffron-dark)", fontWeight: 900 }}
          >
            Ouvrir
          </span>
        </div>
      </BrutalCard>
    </Link>
  );
}

function DepositLine({
  label,
  done,
  total,
  visible,
}: {
  label: string;
  done: number;
  total: number;
  visible: boolean;
}) {
  if (!visible) return null;
  const isComplete = done >= total;
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className="font-mont text-tiny uppercase tracking-widest"
        style={{ color: "var(--ink-soft)", fontWeight: 700 }}
      >
        {label}
      </span>
      <Badge tone={isComplete ? "sage" : done > 0 ? "saffron" : "neutral"}>
        {done}/{total} déposé{total > 1 ? "s" : ""}
      </Badge>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  denom,
  suffix,
  progressColor,
  highlight = false,
}: {
  label: string;
  value: number;
  denom?: number;
  suffix?: string;
  progressColor?: string;
  highlight?: boolean;
}) {
  const pct = denom
    ? Math.round((value / denom) * 100)
    : suffix === "%"
      ? value
      : null;
  return (
    <BrutalCard hoverable highlight={highlight} className="p-6 noise-overlay noise-overlay--soft">
      <div
        className="absolute top-0 right-0 clip-triangle-tr pointer-events-none"
        style={{
          width: 48,
          height: 48,
          background: highlight
            ? "rgba(246,168,6,0.12)"
            : "rgba(18,32,25,0.04)",
        }}
      />
      <p
        className="font-mont text-tiny uppercase tracking-widest mb-2"
        style={{
          color: highlight ? "var(--saffron-dark)" : "var(--ink-faint)",
          fontWeight: 800,
        }}
      >
        {label}
      </p>
      <div className="flex items-end gap-2 mb-3">
        <span
          className="font-mont leading-none"
          style={{
            fontSize: "3rem",
            color: "var(--forest)",
            fontWeight: 900,
            letterSpacing: "-0.02em",
          }}
        >
          {value}
        </span>
        {suffix && (
          <span
            className="text-xl font-mont leading-none"
            style={{ color: "var(--ink-faint)", fontWeight: 800 }}
          >
            {suffix}
          </span>
        )}
        {denom !== undefined && (
          <span
            className="text-sm font-mont"
            style={{ color: "var(--ink-faint)", fontWeight: 700 }}
          >
            / {denom}
          </span>
        )}
      </div>
      {pct !== null && (
        <div
          className="w-full"
          style={{ height: 6, background: "var(--paper-2)" }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: progressColor ?? "var(--saffron)",
              transition: "width 600ms cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        </div>
      )}
    </BrutalCard>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────

function attach(
  byId: Map<string, EnrichedTeam>,
  team: Team,
  scope: ReportType,
  myEvals: ReportEvaluation[],
  documents: Document[],
) {
  let entry = byId.get(team.id);
  if (!entry) {
    const docs = documents.filter(d => d.teamId === team.id);
    entry = {
      team,
      scopes: [],
      riSubmitted: docs.some(
        (d: Document) => d.docType === "rapport_intermediaire",
      ),
      rfCount: docs.filter((d: Document) =>
        d.docType.startsWith("rapport_final_p"),
      ).length,
      myEvaluations: 0,
      expected: 0,
    };
    byId.set(team.id, entry);
  }
  if (!entry.scopes.includes(scope)) entry.scopes.push(scope);

  // Expected count for *this* juror on *this* team: 1 per scope × per problem
  // counts. We follow the structural convention: RI = 1 doc spanning all
  // problems (so 1 evaluation slot); RF = 4 separate problem reports.
  entry.expected = entry.scopes.reduce(
    (n, s) => n + (s === "intermediaire" ? 1 : PROBLEMS.length),
    0,
  );

  // Count of saved evaluations for this scope (myEvals is already
  // restricted to this juror by the backend).
  entry.myEvaluations = myEvals.filter(
    (e) =>
      e.teamId === team.id &&
      entry!.scopes.includes(e.reportType),
  ).length;
}
