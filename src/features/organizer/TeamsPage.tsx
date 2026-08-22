import { useMemo, useState } from "react";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getParticipantsByTeam } from "@/lib/repositories/participantRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { getDocumentsByTeam } from "@/lib/repositories/documentRepository";
import type { Document, Participant, Pool, Team } from "@/types";
import { PageMotion } from "@/features/shared/primitives";

// TeamsPage — organizer view of all teams with the mockup's "team hero card"
// look (dark quadrigramme block + info column + member roster).

interface Enriched {
  team: Team;
  members: Participant[];
  pool1: Pool | null;
  pool2: Pool | null;
  docs: Document[];
}

export function TeamsPage() {
  const [query, setQuery] = useState("");

  const items = useMemo<Enriched[]>(() => {
    const pools = getPools();
    const poolById = new Map(pools.map(p => [p.id, p]));
    const teams = getTeams().sort((a, b) => a.quadrigramme.localeCompare(b.quadrigramme));
    return teams.map(team => ({
      team,
      members: getParticipantsByTeam(team.id),
      pool1: poolById.get(team.poolIdRound1) ?? null,
      pool2: team.poolIdRound2 ? poolById.get(team.poolIdRound2) ?? null : null,
      docs: getDocumentsByTeam(team.id),
    }));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      it.team.quadrigramme.toLowerCase().includes(q) ||
      it.team.name.toLowerCase().includes(q) ||
      it.members.some(m => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)),
    );
  }, [items, query]);

  return (
    <PageMotion className="space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6"
              style={{ borderBottom: "2px solid var(--border)" }}>
        <div>
          <span className="font-mont text-tiny uppercase tracking-widest"
                style={{ color: "var(--saffron-dark)", fontWeight: 700 }}>
            Gestion
          </span>
          <h1 className="font-mont mt-1"
              style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.02em" }}>
            Équipes inscrites
          </h1>
          <p className="font-open text-sm mt-2" style={{ color: "var(--ink-soft)" }}>
            {items.length} équipe{items.length > 1 ? "s" : ""} · {items.reduce((a, b) => a + b.members.length, 0)} participants.
          </p>
        </div>
        <div className="relative">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher quadrigramme, nom, participant…"
            className="font-open text-sm px-3 py-2 w-72 focus-ring"
            style={{
              background: "var(--surface)",
              border: "2px solid var(--forest)",
              color: "var(--ink)",
              boxShadow: "2px 2px 0 0 var(--forest)",
            }}
          />
        </div>
      </header>

      {/* Team cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {filtered.map(it => (
          <TeamCard key={it.team.id} {...it} />
        ))}
        {filtered.length === 0 && (
          <div
            className="col-span-full flex flex-col items-center justify-center text-center px-6 py-16"
            style={{
              border: "2px dashed var(--border)",
              background: "var(--surface)",
            }}
          >
            <svg
              width="84"
              height="84"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--forest)"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              style={{ opacity: 0.55, marginBottom: 20 }}
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="var(--saffron-dark)" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            <h3
              className="font-mont uppercase tracking-tight"
              style={{
                fontSize: "1.1rem",
                color: "var(--forest)",
                fontWeight: 900,
                marginBottom: 6,
              }}
            >
              Aucune équipe trouvée
            </h3>
            <p
              className="font-mont text-tiny uppercase tracking-widest"
              style={{ color: "var(--ink-faint)", fontWeight: 700, maxWidth: 360 }}
            >
              Aucun résultat ne correspond à votre recherche. Essayez un autre
              quadrigramme ou un autre nom.
            </p>
          </div>
        )}
      </div>
    </PageMotion>
  );
}

// ─── TeamCard ──────────────────────────────────────────────────────────

function TeamCard({ team, members, pool1, pool2, docs }: Enriched) {
  const riDeposited = docs.some(d => d.docType === "rapport_intermediaire");
  const rfCount = docs.filter(d => d.docType.startsWith("rapport_final_p")).length;
  const creator = members.find(m => m.id === team.creatorId);

  return (
    <article
      className="relative bg-white transition-all hover:-translate-y-0.5"
      style={{
        border: "2px solid var(--forest)",
        boxShadow: "3px 3px 0 0 var(--forest)",
      }}
    >
      {/* corner markers */}
      {(["tl","tr","bl","br"] as const).map(c => (
        <span key={c} className="absolute" style={{
          width: 6, height: 6, background: "var(--forest)",
          top: c.startsWith("t") ? -3 : "auto",
          bottom: c.startsWith("b") ? -3 : "auto",
          left: c.endsWith("l") ? -3 : "auto",
          right: c.endsWith("r") ? -3 : "auto",
        }} />
      ))}

      <div className="flex flex-col md:flex-row">
        {/* Quadrigramme block (dark) */}
        <div className="md:w-44 p-6 flex flex-col items-center justify-center relative overflow-hidden noise-overlay noise-overlay--card"
             style={{
               backgroundColor: "var(--forest)",
               // Gold halo from the top — matches RADAR + filled RF tile.
               backgroundImage:
                 "radial-gradient(ellipse 100% 60% at 50% 0%, rgba(246,168,6,0.07) 0%, transparent 70%)",
               color: "var(--paper)",
             }}>
          <div className="absolute top-0 right-0 clip-triangle-tr pointer-events-none"
               style={{ width: 48, height: 48, background: "rgba(255,255,255,0.06)" }} />
          <div className="absolute bottom-0 left-0 clip-triangle-bl pointer-events-none"
               style={{ width: 36, height: 36, background: "rgba(246,168,6,0.20)" }} />
          <span className="font-mont text-micro uppercase tracking-[0.3em] mb-2"
                style={{ color: "rgba(244,236,216,0.5)", fontWeight: 700 }}>
            Quad.
          </span>
          <h2 className="font-mont"
              style={{ fontSize: "2.25rem", color: "var(--saffron)", fontWeight: 900, letterSpacing: "0.1em" }}>
            {team.quadrigramme}
          </h2>
        </div>

        {/* Info block */}
        <div className="flex-1 p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="font-mont"
                  style={{ fontSize: "1.25rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.01em" }}>
                {team.name}
              </h3>
              {creator && (
                <p className="font-open text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                  Créateur : <span style={{ color: "var(--forest)", fontWeight: 700 }}>
                    {creator.firstName} {creator.lastName}
                  </span>
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 px-2 py-1"
                   style={{ background: "var(--paper-2)", border: "1px solid var(--border)" }}>
                <span className="font-mont text-micro uppercase tracking-widest"
                      style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
                  T1
                </span>
                <span className="font-mont"
                      style={{ color: "var(--forest)", fontWeight: 900, fontSize: "0.95rem" }}>
                  {pool1?.label ?? "—"}
                </span>
                <span className="font-mont text-micro uppercase tracking-widest"
                      style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
                  T2
                </span>
                <span className="font-mont"
                      style={{ color: "var(--forest)", fontWeight: 900, fontSize: "0.95rem" }}>
                  {pool2?.label ?? "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-3 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <Stat label="Membres" value={String(members.length)} />
            <Stat label="RI" value={riDeposited ? "✓" : "—"} ok={riDeposited} />
            <Stat label="RF" value={`${rfCount}/4`} ok={rfCount === 4} warn={rfCount > 0 && rfCount < 4} />
          </div>

          {/* Members roster */}
          <div className="mt-5 pt-4" style={{ borderTop: "1px dashed var(--border)" }}>
            <div className="font-mont text-micro uppercase tracking-widest mb-2"
                 style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
              Roster
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {members.map(m => (
                <MemberRow key={m.id} m={m} isCreator={m.id === team.creatorId} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value, ok, warn }: { label: string; value: string; ok?: boolean; warn?: boolean }) {
  const color = ok ? "var(--sage-dark)" : warn ? "var(--saffron-dark)" : "var(--forest)";
  return (
    <div>
      <div className="font-mont text-micro uppercase tracking-widest"
           style={{ color: "var(--ink-faint)", fontWeight: 700 }}>
        {label}
      </div>
      <div className="font-mont mt-0.5"
           style={{ color, fontWeight: 900, fontSize: "1.15rem" }}>
        {value}
      </div>
    </div>
  );
}

function MemberRow({ m, isCreator }: { m: Participant; isCreator: boolean }) {
  const initials = `${m.firstName[0] ?? ""}${m.lastName[0] ?? ""}`.toUpperCase();
  return (
    <div className="flex items-center gap-2 p-2 transition-colors hover-row"
         style={{ border: "1px solid var(--border)" }}>
      <span
        className="flex items-center justify-center font-mont shrink-0"
        style={{
          width: 32, height: 32,
          background: isCreator ? "var(--saffron)" : "var(--paper-2)",
          color: isCreator ? "var(--forest)" : "var(--forest)",
          fontWeight: 900,
          border: "1px solid var(--forest)",
          fontSize: "0.75rem",
        }}
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-mont text-xs truncate" style={{ color: "var(--forest)", fontWeight: 700 }}>
          {m.firstName} {m.lastName}
        </div>
        <div className="font-open text-micro truncate" style={{ color: "var(--ink-soft)" }}>
          {m.email}
        </div>
      </div>
      {isCreator && (
        <span className="font-mont text-micro uppercase tracking-widest px-1 shrink-0"
              style={{ color: "var(--saffron-dark)", fontWeight: 800 }}>
          ★
        </span>
      )}
    </div>
  );
}
