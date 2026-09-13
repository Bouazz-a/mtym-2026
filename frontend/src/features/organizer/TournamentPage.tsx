import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, BrutalCard, SectionHeading, Badge, PageMotion } from "@/features/shared/primitives";
import {
  ROLE_PALETTE,
  CONSTRAINT_PALETTE,
  buildViolationIndex,
  dominantViolation,
  ConstraintLegend,
  StatCounter,
} from "@/features/shared/widgets";
import {
  generateBothRoundsOptimal,
  getConstraintReport,
} from "@/lib/services/tournamentOptimizer";
import type { ConstraintViolation } from "@/lib/services/tournamentOptimizer";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getPools, getPassages, saveGeneratedRounds } from "@/lib/repositories/poolRepository";
import { ServiceError } from "@/lib/services/errors";
import { getPoolDisplayLabel } from "@/utils/naming";
import type { Pool, Passage, Team } from "@/types";

type ViolationIndex = Map<string, ConstraintViolation[]>;

type RoundData = { pools: Pool[]; passages: Passage[] };

export function TournamentPage() {
  const queryClient = useQueryClient();

  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: getTeams });
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: getPools });
  const passagesQ = useQuery({ queryKey: ["passages"], queryFn: getPassages });
  const reportQ = useQuery({ queryKey: ["constraint-report"], queryFn: getConstraintReport });

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState(false);

  const loading = teamsQ.isLoading || poolsQ.isLoading || passagesQ.isLoading || reportQ.isLoading;

  const teams = teamsQ.data ?? [];
  const allPools = poolsQ.data ?? [];
  const allPassages = passagesQ.data ?? [];
  const r1Pools = allPools.filter(p => p.round === 1);
  const r2Pools = allPools.filter(p => p.round === 2);
  const round1: RoundData | null = r1Pools.length ? {
    pools: r1Pools,
    passages: allPassages.filter(p => r1Pools.some(po => po.id === p.poolId)),
  } : null;
  const round2: RoundData | null = r2Pools.length ? {
    pools: r2Pools,
    passages: allPassages.filter(p => r2Pools.some(po => po.id === p.poolId)),
  } : null;
  const report = reportQ.data ?? null;

  const handleGenerate = () => {
    setError(null);
    setBusy(true);
    // The Hungarian solve below is synchronous and blocks the main thread.
    // Wait for two animation frames so React commits the overlay and the
    // browser paints it before the freeze — its CSS animations run on the
    // compositor and keep moving while JS is blocked.
    requestAnimationFrame(() =>
      requestAnimationFrame(async () => {
        try {
          const result = generateBothRoundsOptimal({ teams, poolSize: 4, problemPool: [1, 2, 3, 4, 5, 6] });
          await saveGeneratedRounds(result);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["pools"] }),
            queryClient.invalidateQueries({ queryKey: ["passages"] }),
            queryClient.invalidateQueries({ queryKey: ["teams"] }),
            queryClient.invalidateQueries({ queryKey: ["constraint-report"] }),
          ]);
        } catch (e) {
          if (e instanceof ServiceError) setError(e.message);
          else throw e;
        } finally {
          setBusy(false);
        }
      }),
    );
  };

  const vindex = useMemo<ViolationIndex>(
    () => buildViolationIndex(report?.violations ?? []),
    [report],
  );

  if (loading) {
    return <div className="py-24 text-center text-foreground/55">Chargement…</div>;
  }

  const totalPassages = (round1?.passages.length ?? 0) + (round2?.passages.length ?? 0);
  const totalPools = (round1?.pools.length ?? 0) + (round2?.pools.length ?? 0);
  const violationCount = report?.violations.length ?? 0;

  return (
    <PageMotion className="space-y-10">
      {busy && <GenerationOverlay regenerate={Boolean(round1)} />}
      <PageHeader
        eyebrow="Tournoi"
        title="Génération des poules"
        sub="Tirage automatique du tour 1, puis du tour 2 avec les contraintes héritées (interdiction de re-défendre, scoring des oppositions)."
        right={
          <button
            onClick={handleGenerate}
            disabled={busy || teams.length < 3}
            className="btn-brutal"
          >
            {busy ? "Génération…" : round1 ? "Régénérer" : "Générer le tournoi"}
          </button>
        }
      />

      {error && (
        <BrutalCard className="p-4" style={{ borderColor: "var(--clay)", boxShadow: "2px 2px 0 0 var(--clay)" }} withCorners={false}>
          <div className="font-mont text-tiny uppercase tracking-widest mb-1" style={{ color: "var(--clay)", fontWeight: 800 }}>
            Erreur
          </div>
          <div className="font-open text-sm" style={{ color: "var(--ink)" }}>{error}</div>
        </BrutalCard>
      )}

      {/* Stat cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Équipes" value={teams.length} progressColor="var(--saffron)" />
        <StatCard label="Poules" value={totalPools} progressColor="var(--sage)" />
        <StatCard label="Passages" value={totalPassages} progressColor="var(--forest-soft)" />
        <StatCard
          label="Tours"
          value={(round1 ? 1 : 0) + (round2 ? 1 : 0)}
          denom={2}
          highlight={Boolean(round1 && round2)}
        />
      </section>

      {round2 && report && (
        <BrutalCard
          className="p-5"
          withCorners={false}
          style={
            violationCount === 0
              ? { borderColor: "var(--sage-dark)", boxShadow: "2px 2px 0 0 var(--sage-dark)" }
              : { borderColor: "#B91C1C", boxShadow: "2px 2px 0 0 #B91C1C" }
          }
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div
                className="font-mont text-tiny uppercase tracking-widest mb-1"
                style={{ color: violationCount === 0 ? "var(--sage-dark)" : "#B91C1C", fontWeight: 800 }}
              >
                {violationCount === 0 ? "Solution parfaite" : "Conflits de contraintes"}
              </div>
              <div className="font-open text-sm" style={{ color: "var(--ink)" }}>
                {violationCount === 0 ? (
                  "Tour 2 généré sans aucune violation de contrainte souple (score 0)."
                ) : (
                  <>
                    Score total{" "}
                    <strong style={{ color: "#B91C1C" }}>{report.totalScore}</strong> ·{" "}
                    <strong>{violationCount}</strong> violation
                    {violationCount > 1 ? "s" : ""} (la contrainte absolue DD reste
                    toujours respectée).
                  </>
                )}
              </div>
            </div>
            {violationCount > 0 && (
              <button
                onClick={() => setHighlight(h => !h)}
                className="btn-brutal"
                style={
                  highlight
                    ? { background: "#B91C1C", color: "#FEE2E2", borderColor: "#7F1D1D" }
                    : undefined
                }
              >
                {highlight ? "Masquer les conflits" : `Surligner les conflits (${violationCount})`}
              </button>
            )}
          </div>
          {highlight && violationCount > 0 && (
            <div className="mt-4 pt-4 page-fade" style={{ borderTop: "1px dashed var(--border)" }}>
              <ConstraintLegend />
            </div>
          )}
        </BrutalCard>
      )}

      {round1 && <RoundSection label="Tour 1" data={round1} teams={teams} vindex={vindex} highlight={highlight} />}
      {round2 && <RoundSection label="Tour 2" data={round2} teams={teams} vindex={vindex} highlight={highlight} />}

      {!round1 && !round2 && (
        <BrutalCard className="p-10">
          <div className="font-mont mb-1" style={{ fontSize: "1.15rem", color: "var(--forest)", fontWeight: 900 }}>
            Aucun tour généré
          </div>
          <div className="font-open text-sm max-w-xl" style={{ color: "var(--ink-soft)" }}>
            {teams.length} équipes prêtes. Cliquez sur Générer pour lancer l'algorithme.
          </div>
        </BrutalCard>
      )}
    </PageMotion>
  );
}

// ─── Generation loader (MTYM-themed, compositor-driven) ────────────────

function GenerationOverlay({ regenerate }: { regenerate: boolean }) {
  return (
    <div className="mtym-loader-backdrop" role="status" aria-live="polite">
      <div className="mtym-loader-card">
        <div className="mtym-loader-stage" aria-hidden>
          <div className="mtym-role mtym-role--def">DÉF</div>
          <div className="mtym-role mtym-role--opp">OPP</div>
          <div className="mtym-role mtym-role--rap">RAP</div>
          <div className="mtym-loader-track" />
          <div className="mtym-loader-token" />
        </div>
        <div className="mtym-loader-title">
          {regenerate ? "Régénération du tournoi" : "Génération du tournoi"}
        </div>
        <div className="mtym-loader-cycle" aria-hidden>
          <span>Constitution des poules</span>
          <span>Attribution des rôles</span>
          <span>Contrôle des contraintes</span>
        </div>
      </div>
    </div>
  );
}

// ─── Stat card (mirrors the dashboard) ─────────────────────────────────

function StatCard({
  label, value, denom, highlight = false, progressColor,
}: {
  label: string;
  value: number;
  denom?: number;
  highlight?: boolean;
  progressColor?: string;
}) {
  return (
    <BrutalCard hoverable highlight={highlight} className="p-6 noise-overlay noise-overlay--soft">
      <div
        className="absolute top-0 right-0 clip-triangle-tr pointer-events-none"
        style={{
          width: 48, height: 48,
          background: highlight ? "rgba(246,168,6,0.12)" : "rgba(18,32,25,0.04)",
        }}
      />
      <p className="font-mont text-tiny uppercase tracking-widest mb-2"
         style={{ color: highlight ? "var(--saffron-dark)" : "var(--ink-faint)", fontWeight: 800 }}>
        {label}
      </p>
      <div className="flex items-end gap-3">
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
      {progressColor && (
        <div className="mt-3 w-full" style={{ height: 4, background: "var(--paper-2)" }}>
          <div style={{
            height: "100%",
            width: value > 0 ? "100%" : "0%",
            background: progressColor,
            transition: "width 600ms cubic-bezier(0.22,1,0.36,1)",
          }} />
        </div>
      )}
    </BrutalCard>
  );
}

// ─── Round section ────────────────────────────────────────────────────

function RoundSection({
  label,
  data,
  teams,
  vindex,
  highlight,
}: {
  label: string;
  data: RoundData;
  teams: Team[];
  vindex: ViolationIndex;
  highlight: boolean;
}) {
  const teamById = useMemo(() => {
    const m = new Map<string, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  return (
    <section>
      <SectionHeading
        title={label}
        right={
          <span className="font-mont text-tiny uppercase tracking-widest"
                style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
            {data.pools.length} pool{data.pools.length > 1 ? "s" : ""} · {data.passages.length} passages
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.pools.map(pool => (
          <PoolCard
            key={pool.id}
            pool={pool}
            passages={data.passages.filter(p => p.poolId === pool.id).sort((a, b) => a.label.localeCompare(b.label))}
            teamById={teamById}
            vindex={vindex}
            highlight={highlight}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Pool card ────────────────────────────────────────────────────────

function PoolCard({
  pool,
  passages,
  teamById,
  vindex,
  highlight,
}: {
  pool: Pool;
  passages: Passage[];
  teamById: Map<string, Team>;
  vindex: ViolationIndex;
  highlight: boolean;
}) {
  const accent = pool.round === 1 ? "var(--forest)" : "var(--saffron)";
  const vio = (label: string, role: "defender" | "opponent" | "reporter") =>
    dominantViolation(vindex.get(`${label}::${role}`));
  return (
    <BrutalCard className="overflow-hidden">
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{
          borderBottom: "2px solid var(--forest)",
          background: pool.round === 1 ? "rgba(98,159,115,0.10)" : "rgba(246,168,6,0.08)",
        }}
      >
        <div className="flex items-center gap-3">
          <span style={{ width: 8, height: 28, background: accent }} />
          <h3 className="font-mont"
              style={{ color: "var(--forest)", fontWeight: 900, fontSize: "1.25rem", letterSpacing: "-0.01em" }}>
            {getPoolDisplayLabel(pool)}
          </h3>
        </div>
        <Badge tone={pool.round === 1 ? "sage" : "saffron"}>
          {passages.length} pass.
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="brutal-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Pb</th>
              <th>DEF</th>
              <th>OPP</th>
              <th>RAP</th>
              <th style={{ borderRight: "none" }}>EX</th>
            </tr>
          </thead>
          <tbody>
            {passages.map(p => (
              <tr key={p.id}>
                <td>
                  <span className="font-mont text-xs" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
                    {p.label}
                  </span>
                </td>
                <td>
                  <span className="font-mont"
                        style={{ color: ROLE_PALETTE.defender.bg, fontWeight: 900, fontSize: "0.95rem" }}>
                    P{p.problemNumber}
                  </span>
                </td>
                <td><TeamCell q={teamById.get(p.defenderTeamId)?.quadrigramme} role="defender" violation={vio(p.label, "defender")} highlight={highlight} /></td>
                <td><TeamCell q={teamById.get(p.opponentTeamId)?.quadrigramme} role="opponent" violation={vio(p.label, "opponent")} highlight={highlight} /></td>
                <td><TeamCell q={teamById.get(p.reporterTeamId)?.quadrigramme} role="reporter" violation={vio(p.label, "reporter")} highlight={highlight} /></td>
                <td style={{ borderRight: "none" }}>
                  <span className="font-mont text-xs" style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
                    {p.extraTeamId ? teamById.get(p.extraTeamId)?.quadrigramme ?? "—" : "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BrutalCard>
  );
}

function TeamCell({
  q,
  role,
  violation,
  highlight,
}: {
  q: string | undefined;
  role: "defender" | "opponent" | "reporter";
  violation?: ConstraintViolation | null;
  highlight?: boolean;
}) {
  if (!q) return <span className="font-mont text-xs" style={{ color: "var(--ink-faint)" }}>—</span>;
  const meta = ROLE_PALETTE[role];
  const flagged = Boolean(highlight && violation);
  const cmeta = flagged ? CONSTRAINT_PALETTE[violation!.code] : null;

  if (flagged && cmeta) {
    return (
      <span
        key={`vc-${violation!.code}`}
        className="conflict-cell font-mont text-xs px-1.5 py-0.5 inline-flex items-center gap-1"
        style={{
          background: cmeta.bg,
          color: cmeta.fg,
          border: `1px solid ${cmeta.bg}`,
          fontWeight: 800,
          letterSpacing: "0.05em",
        }}
        title={`${violation!.code} · P${violation!.problemNumber} · ${cmeta.desc} (poids ${cmeta.weight})`}
      >
        {q}
        <span
          className="text-micro"
          style={{ opacity: 0.85, borderLeft: `1px solid ${cmeta.fg}`, paddingLeft: 4 }}
        >
          {violation!.code}
        </span>
      </span>
    );
  }

  return (
    <span
      key="plain"
      className="font-mont text-xs px-1.5 py-0.5"
      style={{
        background: role === "defender" ? meta.bg : "transparent",
        color: role === "defender" ? meta.fg : "var(--forest)",
        border: role === "defender" ? "none" : `1px solid ${meta.bg}`,
        fontWeight: 800,
        letterSpacing: "0.05em",
      }}
    >
      {q}
    </span>
  );
}
