import { useEffect, useState } from "react";
import {
  PageHeader, BrutalCard, SectionHeading, Badge, DiamondMarker, PageMotion,
} from "@/features/shared/primitives";
import { StatCounter } from "@/features/shared/widgets";
import { useSession } from "@/features/shared/SessionContext";
import {
  autoAssignAll, autoAssignReports, autoAssignPassages,
  computeJurorLoads,
  type JurorLoad,
} from "@/lib/services/juryAssignmentService";
import {
  getJuryAssignments, getJuryPassageAssignments,
} from "@/lib/repositories/juryRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getPools, getPassages } from "@/lib/repositories/poolRepository";
import { ServiceError } from "@/lib/services/errors";
import type { JuryAssignment, JuryPassageAssignment, Passage, Pool, Team } from "@/types";

// JuryManagementPage — organizer-side jury workload distribution.
//
// Layout:
//  · Stat cards (jurors / RI assignments / RF assignments / passage slots)
//  · Auto-assign actions (full / per-type / passages-only)
//  · Per-juror workload table (RI · RF · passages)
//  · Passage assignment table (each passage with its 2 jurors)

export function JuryManagementPage() {
  const { session } = useSession();
  const [state, setState] = useState<{
    loads: JurorLoad[];
    reports: JuryAssignment[];
    passages: JuryPassageAssignment[];
    teams: Team[];
    passageList: Passage[];
    pools: Pool[];
  } | null>(null);
  const [busy, setBusy] = useState<null | "all" | "inter" | "final" | "passages">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => {
    setState({
      loads: computeJurorLoads(),
      reports: getJuryAssignments(),
      passages: getJuryPassageAssignments(),
      teams: getTeams(),
      passageList: getPassages(),
      pools: getPools(),
    });
  };

  useEffect(refresh, []);

  if (!session || session.role !== "organizer" || !state) return null;

  const handle = (action: NonNullable<typeof busy>) => () => {
    setError(null); setNotice(null); setBusy(action);
    setTimeout(() => {
      try {
        if (action === "all") {
          const r = autoAssignAll(session);
          setNotice(`Affectations régénérées : ${r.reportAssignments.length} rapports · ${r.passageAssignments.length} oraux.`);
        } else if (action === "inter") {
          const r = autoAssignReports(session, "intermediaire");
          setNotice(`Rapports intermédiaires régénérés : ${r.length} affectations.`);
        } else if (action === "final") {
          const r = autoAssignReports(session, "final");
          setNotice(`Rapports finaux régénérés : ${r.length} affectations.`);
        } else {
          const r = autoAssignPassages(session);
          setNotice(`Passages régénérés : ${r.length} affectations.`);
        }
        refresh();
      } catch (e) {
        if (e instanceof ServiceError) setError(e.message);
        else throw e;
      } finally {
        setBusy(null);
      }
    }, 30);
  };

  const interCount = state.reports.filter(a => a.reportType === "intermediaire").length;
  const finalCount = state.reports.filter(a => a.reportType === "final").length;
  const passageCount = state.passages.length;
  const teamCount = state.teams.length;
  const passageListCount = state.passageList.length;

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Administration"
        title="Gestion du jury"
        sub="Affectation automatique des correcteurs aux rapports écrits et aux passages oraux."
        right={
          <button
            onClick={handle("all")}
            disabled={Boolean(busy)}
            className="btn-brutal"
          >
            {busy === "all" ? "Génération…" : "Régénérer tout"}
          </button>
        }
      />

      {error && (
        <BrutalCard
          className="p-4"
          style={{ borderColor: "var(--clay)", boxShadow: "2px 2px 0 0 var(--clay)" }}
          withCorners={false}
        >
          <div className="font-mont text-tiny uppercase tracking-widest mb-1"
               style={{ color: "var(--clay)", fontWeight: 800 }}>
            Erreur
          </div>
          <div className="font-open text-sm" style={{ color: "var(--ink)" }}>{error}</div>
        </BrutalCard>
      )}

      {notice && !error && (
        <BrutalCard
          className="p-4"
          style={{ borderColor: "var(--sage-dark)", boxShadow: "2px 2px 0 0 var(--sage-dark)" }}
          withCorners={false}
        >
          <div className="font-mont text-tiny uppercase tracking-widest mb-1"
               style={{ color: "var(--sage-dark)", fontWeight: 800 }}>
            Succès
          </div>
          <div className="font-open text-sm" style={{ color: "var(--ink)" }}>{notice}</div>
        </BrutalCard>
      )}

      {/* Stat cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Jurés" value={state.loads.length} progressColor="var(--saffron)" />
        <StatCard
          label="RI · assignés"
          value={interCount}
          denom={teamCount}
          progressColor="var(--sage)"
        />
        <StatCard
          label="RF · assignés"
          value={finalCount}
          denom={teamCount}
          progressColor="var(--forest-soft)"
        />
        <StatCard
          label="Passages · slots"
          value={passageCount}
          denom={passageListCount * 2}
          progressColor="var(--saffron)"
          highlight={passageCount === passageListCount * 2 && passageCount > 0}
        />
      </section>

      {/* Per-juror workload */}
      <section>
        <SectionHeading
          title="Charge par juré"
          right={
            <div className="flex gap-2">
              <button onClick={handle("inter")} disabled={Boolean(busy)} className="btn-brutal btn-brutal--ghost">
                {busy === "inter" ? "…" : "Réaffecter RI"}
              </button>
              <button onClick={handle("final")} disabled={Boolean(busy)} className="btn-brutal btn-brutal--ghost">
                {busy === "final" ? "…" : "Réaffecter RF"}
              </button>
              <button onClick={handle("passages")} disabled={Boolean(busy)} className="btn-brutal btn-brutal--dark">
                {busy === "passages" ? "…" : "Réaffecter passages"}
              </button>
            </div>
          }
        />

        <BrutalCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="brutal-table">
              <thead>
                <tr>
                  <th>Membre du jury</th>
                  <th style={{ textAlign: "center" }}>RI</th>
                  <th style={{ textAlign: "center" }}>RF</th>
                  <th style={{ textAlign: "center" }}>Passages</th>
                  <th style={{ borderRight: "none" }}>Affectations</th>
                </tr>
              </thead>
              <tbody>
                {state.loads.map(load => (
                  <JurorRow
                    key={load.juror.id}
                    load={load}
                    reports={state.reports}
                    passages={state.passages}
                    teamById={new Map(state.teams.map(t => [t.id, t]))}
                    passageById={new Map(state.passageList.map(p => [p.id, p]))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </BrutalCard>
      </section>

      {/* Passage assignments table */}
      <section className="pb-10">
        <SectionHeading
          title="Affectation des passages"
          right={
            <Badge tone={passageCount === passageListCount * 2 ? "sage" : "saffron"}>
              {passageCount}/{passageListCount * 2} slots
            </Badge>
          }
        />

        <BrutalCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="brutal-table">
              <thead>
                <tr>
                  <th>Passage</th>
                  <th>Pool</th>
                  <th style={{ textAlign: "center" }}>Pb</th>
                  <th>Défense</th>
                  <th>Opposition</th>
                  <th>Rapport</th>
                  <th style={{ borderRight: "none" }}>Jurés</th>
                </tr>
              </thead>
              <tbody>
                {[...state.passageList].sort((a, b) => a.label.localeCompare(b.label)).map(p => {
                  const jurors = state.passages.filter(a => a.passageId === p.id);
                  const teamById = new Map(state.teams.map(t => [t.id, t]));
                  const poolById = new Map(state.pools.map(po => [po.id, po]));
                  const jurorById = new Map(state.loads.map(l => [l.juror.id, l.juror]));
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="font-mont text-xs"
                              style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
                          {p.label}
                        </span>
                      </td>
                      <td>
                        <span className="font-mont text-xs"
                              style={{ color: "var(--forest)", fontWeight: 800 }}>
                          {poolById.get(p.poolId)?.label ?? "—"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span className="font-mont"
                              style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
                          P{p.problemNumber}
                        </span>
                      </td>
                      <td>
                        <Quad>{teamById.get(p.defenderTeamId)?.quadrigramme}</Quad>
                      </td>
                      <td>
                        <Quad>{teamById.get(p.opponentTeamId)?.quadrigramme}</Quad>
                      </td>
                      <td>
                        <Quad>{teamById.get(p.reporterTeamId)?.quadrigramme}</Quad>
                      </td>
                      <td style={{ borderRight: "none" }}>
                        {jurors.length === 0 ? (
                          <span className="font-open text-xs italic"
                                style={{ color: "var(--ink-faint)" }}>
                            Non affecté
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {jurors.map(a => {
                              const j = jurorById.get(a.juryMemberId);
                              if (!j) return null;
                              return (
                                <span key={a.juryMemberId}
                                      className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
                                      style={{ background: "var(--forest)", color: "var(--saffron)", fontWeight: 800 }}>
                                  {initials(j.firstName, j.lastName)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BrutalCard>
      </section>
    </PageMotion>
  );
}

// ─── Stat card (matches the tournament & organizer dashboard) ──────────

function StatCard({
  label, value, denom, progressColor, highlight = false,
}: {
  label: string;
  value: number;
  denom?: number;
  progressColor?: string;
  highlight?: boolean;
}) {
  const pct = denom ? Math.round((value / denom) * 100) : null;
  return (
    <BrutalCard hoverable highlight={highlight} className="p-6 noise-overlay noise-overlay--soft">
      <div className="absolute top-0 right-0 clip-triangle-tr pointer-events-none"
           style={{ width: 48, height: 48,
                    background: highlight ? "rgba(246,168,6,0.12)" : "rgba(18,32,25,0.04)" }} />
      <p className="font-mont text-tiny uppercase tracking-widest mb-2"
         style={{ color: highlight ? "var(--saffron-dark)" : "var(--ink-faint)", fontWeight: 800 }}>
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
        <>
          <div className="w-full" style={{ height: 6, background: "var(--paper-2)" }}>
            <div style={{
              height: "100%", width: `${pct}%`,
              background: progressColor ?? "var(--saffron)",
              transition: "width 600ms cubic-bezier(0.22,1,0.36,1)",
            }} />
          </div>
          <p className="text-right mt-1 font-mont text-micro uppercase tracking-widest"
             style={{ color: progressColor ?? "var(--saffron)", fontWeight: 800 }}>
            {pct}%
          </p>
        </>
      )}
    </BrutalCard>
  );
}

// ─── Per-juror row ────────────────────────────────────────────────────

function JurorRow({
  load, reports, passages, teamById, passageById,
}: {
  load: JurorLoad;
  reports: JuryAssignment[];
  passages: JuryPassageAssignment[];
  teamById: Map<string, Team>;
  passageById: Map<string, Passage>;
}) {
  const myInter = reports.filter(a => a.juryMemberId === load.juror.id && a.reportType === "intermediaire");
  const myFinal = reports.filter(a => a.juryMemberId === load.juror.id && a.reportType === "final");
  const myPassages = passages.filter(a => a.juryMemberId === load.juror.id);

  return (
    <tr>
      <td>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center font-mont shrink-0"
                style={{
                  width: 36, height: 36,
                  background: "var(--paper-2)", color: "var(--forest)",
                  fontWeight: 900, border: "1px solid var(--forest)",
                  fontSize: "0.75rem",
                }}>
            {initials(load.juror.firstName, load.juror.lastName)}
          </span>
          <div className="min-w-0">
            <div className="font-mont"
                 style={{ color: "var(--forest)", fontWeight: 800, fontSize: "0.95rem" }}>
              {load.juror.firstName} {load.juror.lastName}
            </div>
            {load.juror.city && (
              <div className="font-open text-xs" style={{ color: "var(--ink-soft)" }}>
                {load.juror.city}
              </div>
            )}
          </div>
        </div>
      </td>
      <td style={{ textAlign: "center" }}>
        <Counter value={load.interTeams} />
      </td>
      <td style={{ textAlign: "center" }}>
        <Counter value={load.finalTeams} />
      </td>
      <td style={{ textAlign: "center" }}>
        <Counter value={load.passages} />
      </td>
      <td style={{ borderRight: "none" }}>
        <div className="flex flex-col gap-1">
          {myInter.length > 0 && (
            <Lane label="RI" tone="sage">
              {myInter.map(a => teamById.get(a.teamId)?.quadrigramme).filter(Boolean).join(" · ")}
            </Lane>
          )}
          {myFinal.length > 0 && (
            <Lane label="RF" tone="saffron">
              {myFinal.map(a => teamById.get(a.teamId)?.quadrigramme).filter(Boolean).join(" · ")}
            </Lane>
          )}
          {myPassages.length > 0 && (
            <Lane label="Oral" tone="dark">
              {myPassages.map(a => passageById.get(a.passageId)?.label).filter(Boolean).join(" · ")}
            </Lane>
          )}
          {myInter.length + myFinal.length + myPassages.length === 0 && (
            <span className="font-open text-xs italic" style={{ color: "var(--ink-faint)" }}>
              Aucune affectation
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function Counter({ value }: { value: number }) {
  return (
    <span className="font-mont"
          style={{ color: value > 0 ? "var(--forest)" : "var(--ink-faint)", fontWeight: 900, fontSize: "1.1rem" }}>
      {value}
    </span>
  );
}

function Lane({ label, tone, children }: { label: string; tone: "sage" | "saffron" | "dark"; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <Badge tone={tone}>{label}</Badge>
      <span className="font-mont text-xs" style={{ color: "var(--forest)", fontWeight: 700, letterSpacing: "0.05em" }}>
        {children}
      </span>
    </div>
  );
}

function Quad({ children }: { children: React.ReactNode }) {
  if (!children) return <span className="font-mont text-xs" style={{ color: "var(--ink-faint)" }}>—</span>;
  return (
    <span className="font-mont text-xs"
          style={{ color: "var(--forest)", fontWeight: 800, letterSpacing: "0.05em" }}>
      {children}
    </span>
  );
}

function initials(a: string, b: string): string {
  return `${(a[0] ?? "").toUpperCase()}${(b[0] ?? "").toUpperCase()}`;
}

// DiamondMarker import kept available for future section additions.
void DiamondMarker;
