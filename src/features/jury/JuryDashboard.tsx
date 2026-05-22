import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/features/shared/SessionContext";
import {
  getTeamsAssignedToJuror,
  getPassagesAssignedToJuror,
} from "@/lib/repositories/juryRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { getDocuments } from "@/lib/repositories/documentRepository";
import type { Document, Passage, Pool, Team } from "@/types";
import { ROLE_PALETTE, teamRoleFromIds } from "@/features/shared/widgets";
import { PageMotion, Stagger } from "@/features/shared/primitives";

// JuryDashboard — editorial control room for a jury member.
// Header · Per-problem progress · Assigned teams · Assigned passages.

type Round = 1 | 2;
const PROBLEMS = [1, 2, 3, 4] as const;

export function JuryDashboard() {
  const { session } = useSession();
  const [round, setRound] = useState<Round>(1);
  const [data, setData] = useState<{
    interTeams: Team[];
    finalTeams: Team[];
    passages: Passage[];
    teamById: Map<string, Team>;
    poolById: Map<string, Pool>;
    docs: Document[];
  } | null>(null);

  useEffect(() => {
    if (!session || session.role !== "jury") return;
    const interTeams = getTeamsAssignedToJuror(session.juryMember.id, "intermediaire");
    const finalTeams = getTeamsAssignedToJuror(session.juryMember.id, "final");
    const passages = getPassagesAssignedToJuror(session.juryMember.id);
    const teamById = new Map(getTeams().map(t => [t.id, t]));
    const poolById = new Map(getPools().map(p => [p.id, p]));
    setData({ interTeams, finalTeams, passages, teamById, poolById, docs: getDocuments() });
  }, [session]);

  const passagesByRound = useMemo(() => {
    if (!data) return { 1: [] as Passage[], 2: [] as Passage[] };
    const r1: Passage[] = [], r2: Passage[] = [];
    for (const p of data.passages) {
      const pool = data.poolById.get(p.poolId);
      if (pool?.round === 2) r2.push(p);
      else r1.push(p);
    }
    return { 1: r1, 2: r2 };
  }, [data]);

  if (!session || session.role !== "jury" || !data) return null;

  const activePassages = passagesByRound[round];
  const allAssignedTeams = uniqTeams([...data.interTeams, ...data.finalTeams]);

  // Per-problem completion: counts of final report docs deposited for assigned teams
  const perProblem = PROBLEMS.map(n => {
    const teamIds = new Set(data.finalTeams.map(t => t.id));
    const deposited = data.docs.filter(
      d => teamIds.has(d.teamId) && d.docType === `rapport_final_p${n}`,
    ).length;
    const total = data.finalTeams.length;
    const pct = total ? Math.round((deposited / total) * 100) : 0;
    return { n, deposited, total, pct };
  });

  return (
    <PageMotion className="space-y-8">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6"
              style={{ borderBottom: "2px solid var(--border)" }}>
        <div>
          <span className="font-mont text-tiny uppercase tracking-widest px-2 py-0.5"
                style={{ background: "var(--forest-soft)", color: "var(--paper)", fontWeight: 800 }}>
            Espace jury
          </span>
          <h1 className="font-mont mt-3"
              style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.02em" }}>
            {session.juryMember.firstName} {session.juryMember.lastName}
          </h1>
          <p className="font-open text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
            {allAssignedTeams.length} équipe{allAssignedTeams.length > 1 ? "s" : ""} assignée{allAssignedTeams.length > 1 ? "s" : ""}
            {" · "}
            {data.passages.length} passage{data.passages.length > 1 ? "s" : ""} à juger
          </p>
        </div>

        {/* Round toggle */}
        <div className="inline-flex p-1 self-start lg:self-end shadow-brutal-sm"
             style={{ background: "var(--surface)", border: "2px solid var(--forest)" }}>
          {([1, 2] as Round[]).map(r => {
            const active = r === round;
            return (
              <button
                key={r}
                onClick={() => setRound(r)}
                className="px-5 py-2 font-mont text-tiny uppercase tracking-widest transition-colors"
                style={{
                  background: active ? "var(--forest)" : "transparent",
                  color: active ? "var(--saffron)" : "var(--ink-soft)",
                  fontWeight: active ? 900 : 700,
                }}
              >
                Tour {r}
              </button>
            );
          })}
        </div>
      </header>

      {/* Per-problem progress */}
      <section className="bg-white p-6 relative"
               style={{ border: "2px solid var(--forest)", boxShadow: "2px 2px 0 0 var(--forest)" }}>
        <h2 className="font-mont uppercase tracking-tight mb-6 flex items-center gap-2"
            style={{ fontSize: "1.05rem", color: "var(--forest)", fontWeight: 900 }}>
          <span className="diamond-marker" style={{ background: "var(--saffron)" }} />
          Progression rapports finaux
        </h2>
        <Stagger className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {perProblem.map(({ n, deposited, total, pct }) => {
            const color = pct === 100 ? "var(--sage)" : pct >= 50 ? "var(--saffron)" : pct > 0 ? "var(--forest-soft)" : "var(--ink-faint)";
            const active = pct > 0 && pct < 100;
            return (
              <div key={n} className="p-3 relative"
                   style={{
                     border: active ? "2px solid var(--saffron)" : "1px solid var(--border)",
                     background: active ? "rgba(246,168,6,0.05)" : "var(--paper-2)",
                   }}>
                {active && (
                  <span className="absolute" style={{ top: -3, right: -3, width: 6, height: 6, background: "var(--saffron)" }} />
                )}
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mont text-tiny uppercase tracking-widest"
                        style={{ color: "var(--forest-soft)", fontWeight: 900 }}>
                    Prob {n}
                  </span>
                  <span className="font-mont text-xs" style={{ color, fontWeight: 800 }}>
                    {pct}%
                  </span>
                </div>
                <div className="w-full" style={{ height: 6, background: "var(--paper)" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width 500ms" }} />
                </div>
                <p className="font-mont text-micro uppercase tracking-widest mt-2"
                   style={{ color: "var(--ink-soft)", fontWeight: 700 }}>
                  {deposited}/{total} copies
                </p>
              </div>
            );
          })}
        </Stagger>
      </section>

      {/* Two-column: assigned teams + assigned passages */}
      <Stagger className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-10">
        {/* Assigned teams */}
        <div>
          <div className="flex items-end justify-between mb-4">
            <h3 className="font-mont uppercase tracking-tight flex items-center gap-2"
                style={{ fontSize: "1.05rem", color: "var(--forest)", fontWeight: 900 }}>
              <span className="diamond-marker" style={{ background: "var(--saffron)" }} />
              Mes équipes
            </h3>
            <span className="font-mont text-micro uppercase tracking-widest"
                  style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
              {allAssignedTeams.length} équipes
            </span>
          </div>
          <div className="bg-white p-5 relative"
               style={{ border: "2px solid var(--forest)", boxShadow: "2px 2px 0 0 var(--forest)" }}>
            {allAssignedTeams.length === 0 ? (
              <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
                Aucune équipe n'est assignée à votre profil.
              </p>
            ) : (
              <ul className="space-y-2">
                {allAssignedTeams.map(t => (
                  <TeamRow
                    key={t.id}
                    team={t}
                    inter={data.interTeams.some(x => x.id === t.id)}
                    final={data.finalTeams.some(x => x.id === t.id)}
                    riDeposited={data.docs.some(d => d.teamId === t.id && d.docType === "rapport_intermediaire")}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Assigned passages for the active round */}
        <div>
          <div className="flex items-end justify-between mb-4">
            <h3 className="font-mont uppercase tracking-tight flex items-center gap-2"
                style={{ fontSize: "1.05rem", color: "var(--forest)", fontWeight: 900 }}>
              <span className="diamond-marker" style={{ background: "var(--saffron)" }} />
              Passages · Tour {round}
            </h3>
            <span className="font-mont text-micro uppercase tracking-widest"
                  style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
              {activePassages.length} pass.
            </span>
          </div>
          <div className="bg-white p-5 relative"
               style={{ border: "2px solid var(--forest)", boxShadow: "2px 2px 0 0 var(--forest)" }}>
            {activePassages.length === 0 ? (
              <p className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
                Aucun passage pour ce tour.
              </p>
            ) : (
              <ul className="space-y-2">
                {[...activePassages].sort((a, b) => a.label.localeCompare(b.label)).map(p => (
                  <PassageRow key={p.id} p={p} teamById={data.teamById} poolById={data.poolById} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </Stagger>
    </PageMotion>
  );
}

// ─── TeamRow ───────────────────────────────────────────────────────────

function TeamRow({
  team, inter, final, riDeposited,
}: {
  team: Team;
  inter: boolean;
  final: boolean;
  riDeposited: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 p-3 transition-colors hover-row"
        style={{ border: "1px solid var(--border)", borderLeft: "4px solid var(--forest)" }}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mont" style={{ fontWeight: 900, color: "var(--forest)", fontSize: "0.95rem", letterSpacing: "0.05em" }}>
            {team.quadrigramme}
          </span>
          <span className="font-open text-xs truncate" style={{ color: "var(--ink-soft)" }}>
            {team.name}
          </span>
        </div>
        <div className="mt-1 flex gap-2 flex-wrap">
          {inter && <Tag label="RI" bg="var(--paper-2)" fg="var(--forest)" />}
          {final && <Tag label="Final" bg="var(--paper-2)" fg="var(--forest)" />}
          {riDeposited && <Tag label="RI déposé" bg="rgba(98,159,115,0.18)" fg="var(--sage-dark)" />}
        </div>
      </div>
    </li>
  );
}

function Tag({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
          style={{ background: bg, color: fg, fontWeight: 800 }}>
      {label}
    </span>
  );
}

// ─── PassageRow ────────────────────────────────────────────────────────

function PassageRow({
  p, teamById, poolById,
}: {
  p: Passage;
  teamById: Map<string, Team>;
  poolById: Map<string, Pool>;
}) {
  const pool = poolById.get(p.poolId);
  const def = teamById.get(p.defenderTeamId);
  const opp = teamById.get(p.opponentTeamId);
  const rep = teamById.get(p.reporterTeamId);

  return (
    <li className="flex items-center justify-between gap-3 p-3 transition-colors hover-row"
        style={{ border: "1px solid var(--border)" }}>
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-mont text-tiny uppercase tracking-widest"
                style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
            {p.label}
          </span>
          <span className="font-mont" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
            P{p.problemNumber}
          </span>
          {pool && (
            <span className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
                  style={{ background: "var(--forest)", color: "var(--saffron)", fontWeight: 800 }}>
              {pool.label}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-2 font-mont text-xs">
          {def && <RoleQuad team={def} role="defender" />}
          {opp && <RoleQuad team={opp} role="opponent" />}
          {rep && <RoleQuad team={rep} role="reporter" />}
        </div>
      </div>
      <div className="font-mont text-micro uppercase tracking-widest text-right shrink-0"
           style={{ color: "var(--ink-soft)", fontWeight: 700 }}>
        {p.day ? p.day.split("-").reverse().join("/") : "—"}
        <br />
        {p.timeSlot ?? ""}
      </div>
    </li>
  );
}

function RoleQuad({ team, role }: { team: Team; role: "defender" | "opponent" | "reporter" }) {
  const meta = ROLE_PALETTE[role];
  return (
    <span className="font-mont text-micro uppercase tracking-widest px-1.5 py-0.5"
          style={{ background: meta.bg, color: meta.fg, fontWeight: 800 }}
          title={meta.label}>
      {team.quadrigramme} · {meta.short}
    </span>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────

function uniqTeams(arr: Team[]): Team[] {
  const seen = new Set<string>();
  const out: Team[] = [];
  for (const t of arr) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

// teamRoleFromIds is exported from widgets and used in [[PassageDetailPage]]
// for the participant flow; left here for parity when a future feature
// computes the jury's perspective on a passage.
void teamRoleFromIds;
