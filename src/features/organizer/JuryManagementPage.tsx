import { useState } from "react";
import {
  PageHeader, BrutalCard, SectionHeading, Badge, DiamondMarker, PageMotion,
} from "@/features/shared/primitives";
import { StatCounter, ROLE_PALETTE } from "@/features/shared/widgets";
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
import { getPoolDisplayLabel } from "@/utils/naming";
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
  const loadState = () => ({
    loads: computeJurorLoads(),
    reports: getJuryAssignments(),
    passages: getJuryPassageAssignments(),
    teams: getTeams(),
    passageList: getPassages(),
    pools: getPools(),
  });
  const [state, setState] = useState(loadState);
  const [busy, setBusy] = useState<null | "all" | "inter" | "final" | "passages">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => setState(loadState());

  if (!session || session.role !== "organizer") return null;

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

      {/* Passage assignments — grouped by pool */}
      <section className="pb-10">
        <SectionHeading
          title="Affectation des passages"
          right={
            <Badge tone={passageCount === passageListCount * 2 ? "sage" : "saffron"}>
              {passageCount}/{passageListCount * 2} slots
            </Badge>
          }
        />
        <PassageAssignmentsByPool state={state} />
      </section>
    </PageMotion>
  );
}

// ─── Passage assignments grouped by pool ──────────────────────────────

function PassageAssignmentsByPool({
  state,
}: {
  state: {
    loads: JurorLoad[];
    passages: JuryPassageAssignment[];
    teams: Team[];
    passageList: Passage[];
    pools: Pool[];
  };
}) {
  const teamById = new Map(state.teams.map(t => [t.id, t]));
  const jurorById = new Map(state.loads.map(l => [l.juror.id, l.juror]));
  const passagesByPool = new Map<string, Passage[]>();
  for (const p of state.passageList) {
    const list = passagesByPool.get(p.poolId) ?? [];
    list.push(p);
    passagesByPool.set(p.poolId, list);
  }
  const sortedPools = [...state.pools].sort((a, b) => a.label.localeCompare(b.label));

  if (sortedPools.length === 0) {
    return (
      <BrutalCard className="p-8" withCorners={false}
                  style={{ borderStyle: "dashed", boxShadow: "none" }}>
        <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
          Aucune poule générée. Lancez d'abord le tirage depuis la page Tournoi.
        </p>
      </BrutalCard>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {sortedPools.map(pool => {
        const pool_passages = (passagesByPool.get(pool.id) ?? [])
          .sort((a, b) => a.label.localeCompare(b.label));
        const total = pool_passages.length;
        const assigned = pool_passages.filter(p =>
          state.passages.some(a => a.passageId === p.id),
        ).length;
        const accent = pool.round === 1 ? "var(--forest)" : "var(--saffron)";
        return (
          <BrutalCard key={pool.id} className="overflow-hidden">
            <div
              className="px-4 py-3 flex items-center justify-between gap-3"
              style={{
                borderBottom: "2px solid var(--forest)",
                background: pool.round === 1 ? "rgba(98,159,115,0.08)" : "rgba(246,168,6,0.08)",
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span style={{ width: 6, height: 22, background: accent }} />
                <div className="min-w-0">
                  <div className="font-mont text-tiny uppercase tracking-widest"
                       style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
                    Tour {pool.round}
                  </div>
                  <div className="font-mont"
                       style={{ color: "var(--forest)", fontWeight: 900, fontSize: "1.05rem" }}>
                    {getPoolDisplayLabel(pool)}
                  </div>
                </div>
              </div>
              <Badge tone={assigned === total && total > 0 ? "sage" : assigned > 0 ? "saffron" : "neutral"}>
                {assigned}/{total} affectés
              </Badge>
            </div>

            {pool_passages.length === 0 ? (
              <p className="font-open text-xs italic px-4 py-4"
                 style={{ color: "var(--ink-faint)" }}>
                Aucun passage dans cette poule.
              </p>
            ) : (
              <ul>
                {pool_passages.map((p, i) => {
                  const jurors = state.passages.filter(a => a.passageId === p.id);
                  return (
                    <li
                      key={p.id}
                      className="px-4 py-3 transition-colors hover-row"
                      style={{ borderTop: i === 0 ? undefined : "1px solid var(--border)" }}
                    >
                      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
                                style={{ background: "var(--paper-2)", color: "var(--ink-soft)",
                                         border: "1px solid var(--border)", fontWeight: 800 }}>
                            {p.label}
                          </span>
                          <span className="font-mont"
                                style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
                            P{p.problemNumber}
                          </span>
                        </div>
                        {jurors.length === 0 ? (
                          <span className="font-mont text-micro uppercase tracking-widest"
                                style={{ color: "var(--clay)", fontWeight: 800 }}>
                            Non affecté
                          </span>
                        ) : (
                          <div className="flex gap-1.5">
                            {jurors.map(a => {
                              const j = jurorById.get(a.juryMemberId);
                              if (!j) return null;
                              return (
                                <span key={a.juryMemberId}
                                      title={`${j.firstName} ${j.lastName}`}
                                      className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
                                      style={{ background: "var(--forest)", color: "var(--saffron)", fontWeight: 800 }}>
                                  {initials(j.firstName, j.lastName)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <RoleQuad role="defender" team={teamById.get(p.defenderTeamId)} />
                        <RoleQuad role="opponent" team={teamById.get(p.opponentTeamId)} />
                        <RoleQuad role="reporter" team={teamById.get(p.reporterTeamId)} />
                        {p.extraTeamId && (
                          <RoleQuad role="extra" team={teamById.get(p.extraTeamId)} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </BrutalCard>
        );
      })}
    </div>
  );
}

function RoleQuad({
  role, team,
}: {
  role: keyof typeof ROLE_PALETTE;
  team: Team | undefined;
}) {
  const meta = ROLE_PALETTE[role];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1"
          style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
      <span className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
            style={{ background: meta.bg, color: meta.fg, fontWeight: 800 }}>
        {meta.short}
      </span>
      <span className="font-mont text-xs"
            style={{ color: "var(--forest)", fontWeight: 900, letterSpacing: "0.05em" }}>
        {team?.quadrigramme ?? "—"}
      </span>
    </span>
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

function initials(a: string, b: string): string {
  return `${(a[0] ?? "").toUpperCase()}${(b[0] ?? "").toUpperCase()}`;
}

// DiamondMarker import kept available for future section additions.
void DiamondMarker;
