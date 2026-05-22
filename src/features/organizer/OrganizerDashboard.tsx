import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getPools, getPassages } from "@/lib/repositories/poolRepository";
import { getDocuments } from "@/lib/repositories/documentRepository";
import {
  getJuryMembers,
  getJuryAssignments,
} from "@/lib/repositories/juryRepository";
import { getParticipants } from "@/lib/repositories/participantRepository";
import type {
  Document,
  JuryMember,
  Participant,
  Passage,
  Pool,
  Team,
} from "@/types";
import { PageMotion, Stagger } from "@/features/shared/primitives";
import { StatCounter } from "@/features/shared/widgets";

// OrganizerDashboard — editorial control room.
// Stat cards · Submission tracker · Jury workload · Pool distribution.

const PROBLEMS = [1, 2, 3, 4] as const;

interface State {
  teams: Team[];
  pools: Pool[];
  passages: Passage[];
  docs: Document[];
  participants: Participant[];
  jury: JuryMember[];
  juryAssignedTeams: Map<string, Set<string>>; // jurorId -> teamIds
}

export function OrganizerDashboard() {
  const [s, setS] = useState<State | null>(null);

  useEffect(() => {
    const teams = getTeams();
    const assignments = getJuryAssignments();
    const map = new Map<string, Set<string>>();
    for (const a of assignments) {
      if (!map.has(a.juryMemberId)) map.set(a.juryMemberId, new Set());
      map.get(a.juryMemberId)!.add(a.teamId);
    }
    setS({
      teams,
      pools: getPools(),
      passages: getPassages(),
      docs: getDocuments(),
      participants: getParticipants(),
      jury: getJuryMembers(),
      juryAssignedTeams: map,
    });
  }, []);

  if (!s) return null;

  const riDeposited = s.teams.filter((t) =>
    s.docs.some(
      (d) => d.teamId === t.id && d.docType === "rapport_intermediaire",
    ),
  ).length;
  const rfDeposited = s.docs.filter((d) =>
    d.docType.startsWith("rapport_final_p"),
  ).length;
  const rfExpected = s.teams.length * PROBLEMS.length;
  const juryAssignedCount = Array.from(s.juryAssignedTeams.values()).reduce(
    (sum, set) => sum + set.size,
    0,
  );
  const juryAssignedExpected = s.teams.length * 2; // intermediaire + final per team

  const riPct = s.teams.length
    ? Math.round((riDeposited / s.teams.length) * 100)
    : 0;
  const rfPct = rfExpected ? Math.round((rfDeposited / rfExpected) * 100) : 0;
  const juryPct = juryAssignedExpected
    ? Math.round((juryAssignedCount / juryAssignedExpected) * 100)
    : 0;

  return (
    <PageMotion className="space-y-10">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span
            className="font-mont text-tiny uppercase tracking-widest"
            style={{ color: "var(--saffron-dark)", fontWeight: 700 }}
          >
            Tableau de bord
          </span>
          <h1
            className="font-mont mt-1"
            style={{
              fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
              color: "var(--forest)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
            }}
          >
            Vue d'ensemble
          </h1>
          <p
            className="font-open text-sm mt-2"
            style={{ color: "var(--ink-soft)" }}
          >
            Pilotage en temps réel du Tournoi MTYM 2026.
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/tournoi">
            <button
              className="font-mont text-xs uppercase tracking-widest px-4 py-2 btn-fx"
              style={{
                background: "var(--saffron)",
                color: "var(--forest)",
                border: "1px solid var(--forest)",
                fontWeight: 800,
                boxShadow: "2px 2px 0 0 var(--forest)",
              }}
            >
              Gérer le tournoi
            </button>
          </Link>
        </div>
      </header>

      {/* Stat cards */}
      <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Équipes inscrites"
          value={s.teams.length}
          accent={null}
        />
        <StatCard
          label="Rapports inter. (RI)"
          value={riDeposited}
          denom={s.teams.length}
          pct={riPct}
          progressColor="var(--sage)"
        />
        <StatCard
          label="Rapports finaux (RF)"
          value={rfDeposited}
          denom={rfExpected}
          pct={rfPct}
          progressColor="var(--saffron)"
          highlight
        />
        <StatCard
          label="Affectations jury"
          value={juryAssignedCount}
          denom={juryAssignedExpected}
          pct={juryPct}
          progressColor="var(--forest-soft)"
        />
      </Stagger>

      {/* Submission tracker */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2
            className="font-mont uppercase tracking-tight flex items-center gap-2"
            style={{
              fontSize: "1.1rem",
              color: "var(--forest)",
              fontWeight: 900,
            }}
          >
            <span
              className="diamond-marker"
              style={{ background: "var(--saffron)" }}
            />
            Tracker des soumissions
          </h2>
          <span
            className="font-mont text-tiny uppercase tracking-widest"
            style={{ color: "var(--ink-faint)", fontWeight: 700 }}
          >
            {s.teams.length} équipes
          </span>
        </div>
        <SubmissionTracker teams={s.teams} pools={s.pools} docs={s.docs} />
      </section>

      {/* Split: jury workload + pool distribution */}
      <Stagger className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-10">
        <JuryWorkload
          jury={s.jury}
          assignedTeams={s.juryAssignedTeams}
          totalTeams={s.teams.length}
        />
        <PoolDistribution
          pools={s.pools}
          teams={s.teams}
          passages={s.passages}
        />
      </Stagger>
    </PageMotion>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  denom,
  pct,
  progressColor,
  highlight = false,
}: {
  label: string;
  value: number;
  denom?: number;
  pct?: number;
  progressColor?: string;
  accent?: unknown;
  highlight?: boolean;
}) {
  return (
    <div
      className="relative h-full bg-white p-6 transition-all hover:-translate-y-1 noise-overlay noise-overlay--soft"
      style={{
        border: "1px solid var(--forest)",
        boxShadow: highlight
          ? "3px 3px 0 0 var(--saffron)"
          : "2px 2px 0 0 var(--forest)",
        borderLeft: highlight
          ? "4px solid var(--saffron)"
          : "1px solid var(--forest)",
      }}
    >
      {/* corner markers */}
      {(["tl", "tr", "bl", "br"] as const).map((c) => (
        <span
          key={c}
          className="absolute"
          style={{
            width: 6,
            height: 6,
            background: "var(--forest)",
            top: c.startsWith("t") ? -3 : "auto",
            bottom: c.startsWith("b") ? -3 : "auto",
            left: c.endsWith("l") ? -3 : "auto",
            right: c.endsWith("r") ? -3 : "auto",
          }}
        />
      ))}
      {/* triangle accent */}
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
          fontWeight: 700,
        }}
      >
        {label}
      </p>
      <div className="flex items-end gap-3 mb-3">
        <StatCounter
          value={value}
          className="font-mont leading-none"
          style={{
            fontSize: "3rem",
            color: "var(--forest)",
            fontWeight: 900,
            letterSpacing: "-0.02em",
          }}
        />
        {denom !== undefined && (
          <span
            className="text-sm font-mont"
            style={{ color: "var(--ink-faint)", fontWeight: 700 }}
          >
            / {denom}
          </span>
        )}
      </div>
      {pct !== undefined && (
        <>
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
          <p
            className="text-right mt-1 font-mont text-micro uppercase tracking-widest"
            style={{
              color: progressColor ?? "var(--saffron)",
              fontWeight: 800,
            }}
          >
            {pct}% complété
          </p>
        </>
      )}
    </div>
  );
}

// ─── Submission tracker table ─────────────────────────────────────────

function SubmissionTracker({
  teams,
  pools,
  docs,
}: {
  teams: Team[];
  pools: Pool[];
  docs: Document[];
}) {
  const poolById = new Map(pools.map((p) => [p.id, p]));

  const sorted = [...teams].sort((a, b) =>
    a.quadrigramme.localeCompare(b.quadrigramme),
  );

  return (
    <div
      className="bg-white relative overflow-hidden"
      style={{
        border: "1px solid var(--forest)",
        boxShadow: "3px 3px 0 0 var(--forest)",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr
              style={{
                background: "var(--forest-soft)",
                color: "var(--paper)",
              }}
            >
              <Th>Équipe</Th>
              <Th align="center" width="1/6">
                RI
              </Th>
              <Th align="center">RF (Prob 1–4)</Th>
              <Th align="center" width="1/6">
                Statut
              </Th>
            </tr>
          </thead>
          <tbody
            className="text-sm font-mont divide-y"
            style={{ borderColor: "var(--border)" }}
          >
            {sorted.map((team) => {
              const hasRi = docs.some(
                (d) =>
                  d.teamId === team.id && d.docType === "rapport_intermediaire",
              );
              const rfStatus = PROBLEMS.map((n) => ({
                n,
                done: docs.some(
                  (d) =>
                    d.teamId === team.id && d.docType === `rapport_final_p${n}`,
                ),
              }));
              const allRf = rfStatus.every((s) => s.done);
              const noneRf = rfStatus.every((s) => !s.done);
              const pool = poolById.get(team.poolIdRound1);

              const rowTint =
                hasRi && allRf
                  ? "rgba(98,159,115,0.05)"
                  : !hasRi && noneRf
                    ? "rgba(178,59,27,0.04)"
                    : undefined;

              return (
                <tr
                  key={team.id}
                  className="transition-colors hover-row"
                  style={{ background: rowTint }}
                >
                  <Td>
                    <div className="flex items-center justify-between gap-3">
                      <span
                        style={{
                          fontWeight: 900,
                          fontSize: "1.05rem",
                          letterSpacing: "0.05em",
                          color: "var(--forest)",
                        }}
                      >
                        {team.quadrigramme}
                      </span>
                      <span
                        className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
                        style={{
                          background: "var(--paper-2)",
                          color: "var(--ink-soft)",
                          fontWeight: 700,
                          border: "1px solid var(--border)",
                        }}
                      >
                        {pool?.label ?? "—"}
                      </span>
                    </div>
                  </Td>
                  <Td align="center">
                    <StatusDot ok={hasRi} />
                  </Td>
                  <Td align="center">
                    <div className="inline-flex gap-1">
                      {rfStatus.map(({ n, done }) => (
                        <span
                          key={n}
                          className="inline-flex items-center justify-center font-mont text-micro"
                          style={{
                            width: 24,
                            height: 24,
                            background: done ? "var(--forest)" : "transparent",
                            color: done ? "var(--saffron)" : "var(--ink-faint)",
                            border: done
                              ? "1px solid var(--forest)"
                              : "1px dashed var(--border)",
                            fontWeight: 900,
                          }}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td align="center">
                    <StatusBadge hasRi={hasRi} allRf={allRf} noneRf={noneRf} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  align,
  width,
}: {
  children: React.ReactNode;
  align?: "center";
  width?: string;
}) {
  const w = width === "1/6" ? "16.6%" : undefined;
  return (
    <th
      className="p-3 font-mont text-micro uppercase tracking-widest"
      style={{
        textAlign: align ?? "left",
        borderRight: "1px solid rgba(255,255,255,0.1)",
        fontWeight: 800,
        width: w,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "center";
}) {
  return (
    <td
      className="p-3"
      style={{
        textAlign: align ?? "left",
        borderRight: "1px solid var(--border)",
      }}
    >
      {children}
    </td>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: 28,
        height: 28,
        background: ok ? "rgba(98,159,115,0.18)" : "rgba(178,59,27,0.10)",
        color: ok ? "var(--sage-dark)" : "var(--clay)",
        border: ok ? "1px solid var(--sage)" : "1px solid rgba(178,59,27,0.3)",
        fontWeight: 900,
      }}
    >
      {ok ? "✓" : "×"}
    </span>
  );
}

function StatusBadge({
  hasRi,
  allRf,
  noneRf,
}: {
  hasRi: boolean;
  allRf: boolean;
  noneRf: boolean;
}) {
  let label = "En cours";
  let bg = "rgba(246,168,6,0.18)";
  let fg = "var(--saffron-dark)";
  let bd = "rgba(246,168,6,0.45)";
  if (hasRi && allRf) {
    label = "Complet";
    bg = "rgba(98,159,115,0.20)";
    fg = "var(--forest)";
    bd = "var(--sage)";
  } else if (!hasRi && noneRf) {
    label = "Aucun dépôt";
    bg = "rgba(178,59,27,0.10)";
    fg = "var(--clay)";
    bd = "rgba(178,59,27,0.3)";
  }
  return (
    <span
      className="font-mont text-micro uppercase tracking-widest px-2 py-0.5"
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${bd}`,
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}

// ─── Jury workload panel ──────────────────────────────────────────────

function JuryWorkload({
  jury,
  assignedTeams,
  totalTeams,
}: {
  jury: JuryMember[];
  assignedTeams: Map<string, Set<string>>;
  totalTeams: number;
}) {
  return (
    <section>
      <h3
        className="font-mont uppercase tracking-tight flex items-center gap-2 mb-4"
        style={{ fontSize: "1.1rem", color: "var(--forest)", fontWeight: 900 }}
      >
        <span
          className="diamond-marker"
          style={{ background: "var(--saffron)" }}
        />
        Charge de correction
      </h3>
      <div
        className="bg-white p-6 relative"
        style={{
          border: "1px solid var(--forest)",
          boxShadow: "2px 2px 0 0 var(--forest)",
        }}
      >
        {jury.length === 0 ? (
          <p
            className="font-open text-sm italic"
            style={{ color: "var(--ink-faint)" }}
          >
            Aucun membre du jury inscrit.
          </p>
        ) : (
          <ul className="space-y-5">
            {jury.map((j) => {
              const count = assignedTeams.get(j.id)?.size ?? 0;
              const pct = totalTeams
                ? Math.round((count / totalTeams) * 100)
                : 0;
              const color =
                pct >= 50
                  ? "var(--sage)"
                  : pct > 0
                    ? "var(--saffron)"
                    : "var(--ink-faint)";
              return (
                <li key={j.id}>
                  <div className="flex items-end justify-between mb-1.5">
                    <span
                      className="font-mont text-sm"
                      style={{ color: "var(--forest)", fontWeight: 700 }}
                    >
                      {j.firstName} {j.lastName}
                      {j.city && (
                        <span
                          className="font-mont text-micro uppercase tracking-widest ml-2"
                          style={{ color: "var(--ink-faint)", fontWeight: 600 }}
                        >
                          {j.city}
                        </span>
                      )}
                    </span>
                    <span
                      className="font-mont text-micro uppercase tracking-widest"
                      style={{ color, fontWeight: 800 }}
                    >
                      {count}/{totalTeams}
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
                        background: color,
                        transition: "width 500ms",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div
          className="mt-6 pt-4 text-right"
          style={{ borderTop: "1px dashed var(--border)" }}
        >
          <Link
            to="/tournoi"
            className="font-mont text-tiny uppercase tracking-widest inline-flex items-center gap-1"
            style={{ color: "var(--saffron-dark)", fontWeight: 800 }}
          >
            Gérer les affectations
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Pool distribution panel ──────────────────────────────────────────

function PoolDistribution({
  pools,
  teams,
  passages,
}: {
  pools: Pool[];
  teams: Team[];
  passages: Passage[];
}) {
  // Group teams by pool (using poolIdRound1; round 2 falls through the same logic via poolIdRound2).
  const byPool = new Map<string, Team[]>();
  for (const t of teams) {
    const k = t.poolIdRound1;
    if (!byPool.has(k)) byPool.set(k, []);
    byPool.get(k)!.push(t);
  }
  for (const t of teams) {
    if (!t.poolIdRound2) continue;
    const k = t.poolIdRound2;
    if (!byPool.has(k)) byPool.set(k, []);
    byPool.get(k)!.push(t);
  }

  return (
    <section>
      <h3
        className="font-mont uppercase tracking-tight flex items-center gap-2 mb-4"
        style={{ fontSize: "1.1rem", color: "var(--forest)", fontWeight: 900 }}
      >
        <span
          className="diamond-marker"
          style={{ background: "var(--saffron)" }}
        />
        Répartition des poules
      </h3>
      <div
        className="bg-white p-6 relative h-[calc(100%-2.5rem)]"
        style={{
          border: "1px solid var(--forest)",
          boxShadow: "2px 2px 0 0 var(--forest)",
        }}
      >
        {pools.length === 0 ? (
          <p
            className="font-open text-sm italic"
            style={{ color: "var(--ink-faint)" }}
          >
            Pools non générées.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {pools.map((pool) => {
              const inPool = byPool.get(pool.id) ?? [];
              const passCount = passages.filter(
                (p) => p.poolId === pool.id,
              ).length;
              const borderColor =
                pool.round === 1 ? "var(--forest)" : "var(--saffron)";
              return (
                <div
                  key={pool.id}
                  className="pl-3"
                  style={{ borderLeft: `3px solid ${borderColor}` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="font-mont"
                      style={{
                        color: "var(--forest)",
                        fontWeight: 900,
                        fontSize: "0.95rem",
                      }}
                    >
                      {pool.label}
                    </span>
                    <span
                      className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
                      style={{
                        background: "var(--paper-2)",
                        color: "var(--ink-soft)",
                        fontWeight: 700,
                        border: "1px solid var(--border)",
                      }}
                    >
                      {passCount} pass.
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {inPool.map((t) => (
                      <span
                        key={t.id}
                        className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
                        style={{
                          background: "var(--forest)",
                          color: "var(--saffron)",
                          fontWeight: 800,
                        }}
                      >
                        {t.quadrigramme}
                      </span>
                    ))}
                    {inPool.length === 0 && (
                      <span
                        className="font-open text-xs italic"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        Aucune équipe affectée
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div
          className="mt-6 pt-4 flex items-center justify-between"
          style={{ borderTop: "1px dashed var(--border)" }}
        >
          <span
            className="font-mont text-micro uppercase tracking-widest"
            style={{ color: "var(--ink-faint)", fontWeight: 700 }}
          >
            {pools.length} pools · {passages.length} passages
          </span>
          <Link
            to="/tournoi"
            className="font-mont text-tiny uppercase tracking-widest"
            style={{ color: "var(--saffron-dark)", fontWeight: 800 }}
          >
            Planificateur
          </Link>
        </div>
      </div>
    </section>
  );
}
