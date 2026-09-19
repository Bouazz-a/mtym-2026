import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Alert, Badge, Btn, BrutalCard, Input, PageHeader, PageLoading, PageMotion, SectionHeading, Segmented, Select,
  Stagger,
} from "@/features/shared/primitives";
import { EmptyState, StatCard } from "@/features/shared/widgets";
import { getTeams, setTeamDay } from "@/lib/repositories/teamRepository";
import {
  createCenterDay, deleteCenterDay, distributeTeams, getCenterDays, updateCenterDay,
} from "@/lib/repositories/centerDayRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { QUALIFS_PROBLEMS } from "@/lib/services/tournamentOptimizer";
import type { Center, CenterDay, PoolDetails, Team } from "@/types";
import { CENTERS, centerLabel, formatDay } from "@/utils/labels";
import { drawnTeamIds } from "@/utils/teams";
import { DayDraw } from "./DayDraw";
import { useAction, TOURNAMENT_QUERIES } from "./useAction";

// TournamentPage — qualifications, one center at a time:
//   1. declare the center's days, 2. give each team its day (by hand or
//   "Répartir"), 3. draw each day's pools, 4. adjust them by hand.

export function TournamentPage() {
  const [params, setParams] = useSearchParams();
  const center = (CENTERS.find((c) => c.value === params.get("centre"))?.value ?? "casablanca") as Center;
  const setCenter = (c: Center) => setParams({ centre: c }, { replace: true });

  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const daysQ = useQuery({ queryKey: ["center-days"], queryFn: () => getCenterDays() });
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: () => getPools() });

  const teams = useMemo(() => teamsQ.data ?? [], [teamsQ.data]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  if (teamsQ.isLoading || daysQ.isLoading || poolsQ.isLoading) {
    return <PageLoading />;
  }

  const centerTeams = teams.filter((t) => t.center === center);
  const days = (daysQ.data ?? []).filter((d) => d.center === center);
  const pools = (poolsQ.data ?? []).filter((p) => p.centerDay?.center === center);
  const withoutDay = centerTeams.filter((t) => !t.centerDayId).length;
  const countByCenter = (c: Center) => teams.filter((t) => t.center === c).length;

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Tournoi"
        title="Qualifications"
        sub="Pour chaque centre : déclarez ses jours, répartissez les équipes (une équipe joue un seul jour), puis tirez les poules de chaque jour et ajustez-les à la main."
      />

      <Segmented
        options={CENTERS.map((c) => ({ value: c.value, label: `${c.label} · ${countByCenter(c.value)}` }))}
        value={center}
        onChange={setCenter}
      />

      <Stagger key={center} className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Équipes" value={centerTeams.length} />
        <StatCard label="Jours" value={days.length} progressColor="var(--sage)" />
        <StatCard
          label="Équipes placées"
          value={centerTeams.length - withoutDay}
          denom={centerTeams.length || undefined}
          progressColor="var(--sage)"
          highlight={centerTeams.length > 0 && withoutDay === 0}
        />
        <StatCard label="Poules" value={pools.length} progressColor="var(--forest-soft)" />
      </Stagger>

      {centerTeams.length === 0 ? (
        <EmptyState
          title={`Aucune équipe à ${centerLabel(center)}`}
          sub="Les équipes viennent de l'import du site principal (scripts/import-dump.sh)."
        />
      ) : (
        <>
          <DaysSection center={center} days={days} withoutDay={withoutDay} />
          <TeamsSection teams={centerTeams} days={days} pools={pools} />
          {days.map((day, i) => (
            <DayDraw
              key={day.id}
              day={day}
              dayIndex={i}
              teams={centerTeams.filter((t) => t.centerDayId === day.id)}
              pools={pools.filter((p) => p.centerDayId === day.id)}
              teamById={teamById}
            />
          ))}
        </>
      )}
    </PageMotion>
  );
}

// ─── Days of the center ───────────────────────────────────────────────

function DaysSection({ center, days, withoutDay }: { center: Center; days: CenterDay[]; withoutDay: number }) {
  const [newDate, setNewDate] = useState("");
  const { run, busy, error } = useAction(TOURNAMENT_QUERIES);

  const add = async () => {
    if (await run(() => createCenterDay(center, newDate))) setNewDate("");
  };

  return (
    <section>
      <SectionHeading
        title={`Jours · ${centerLabel(center)}`}
        right={
          <Btn
            size="sm"
            onClick={() => run(() => distributeTeams(center))}
            disabled={busy || withoutDay === 0 || days.length === 0}
            title={days.length === 0 ? "Ajoutez d'abord un jour" : undefined}
          >
            Répartir {withoutDay > 0 ? `${withoutDay} équipe${withoutDay > 1 ? "s" : ""} sans jour` : "les équipes"}
          </Btn>
        }
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <BrutalCard className="overflow-hidden">
        <ul className="striped-rows">
          {days.map((day, i) => (
            <DayRow key={day.id} day={day} index={i} />
          ))}
        </ul>
        <div
          className="px-4 py-3 flex items-end gap-3 flex-wrap"
          style={{ borderTop: days.length ? "1px solid var(--border)" : undefined, background: "var(--paper-2)" }}
        >
          <label>
            <div className="font-mont text-micro uppercase tracking-widest mb-1" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
              Nouveau jour
            </div>
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ width: 180 }} />
          </label>
          <Btn variant="ghost" size="sm" onClick={add} disabled={!newDate || busy}>Ajouter</Btn>
        </div>
      </BrutalCard>
    </section>
  );
}

function DayRow({ day, index }: { day: CenterDay; index: number }) {
  const [date, setDate] = useState(day.date);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { run, busy, error } = useAction(TOURNAMENT_QUERIES);
  const hasPools = day._count.pools > 0;

  return (
    <li className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-4 flex-wrap">
        <Badge tone="dark">J{index + 1}</Badge>
        <span className="font-mont" style={{ color: "var(--forest)", fontWeight: 900, minWidth: 120 }}>
          {formatDay(day.date)}
        </span>
        <span className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-soft)", fontWeight: 700 }}>
          {day._count.teams} équipe{day._count.teams > 1 ? "s" : ""} · {day._count.pools} poule{day._count.pools > 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
          <Btn variant="ghost" size="sm" disabled={busy || date === day.date || !date} onClick={() => run(() => updateCenterDay(day.id, date))}>
            Modifier
          </Btn>
          {confirmDelete ? (
            <>
              <Btn variant="danger" size="sm" onClick={() => run(() => deleteCenterDay(day.id))}>Confirmer</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Annuler</Btn>
            </>
          ) : (
            <Btn
              variant="danger"
              size="sm"
              disabled={hasPools}
              title={hasPools ? "Annulez d'abord le tirage de ce jour" : "Ses équipes repasseront « sans jour »"}
              onClick={() => setConfirmDelete(true)}
            >
              Supprimer
            </Btn>
          )}
        </div>
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </li>
  );
}

// ─── Teams of the center and their day ────────────────────────────────

function TeamsSection({ teams, days, pools }: { teams: Team[]; days: CenterDay[]; pools: PoolDetails[] }) {
  const [onlyWithoutDay, setOnlyWithoutDay] = useState(false);
  const { run, error } = useAction(TOURNAMENT_QUERIES);
  const drawn = drawnTeamIds(pools);
  const shown = onlyWithoutDay ? teams.filter((t) => !t.centerDayId) : teams;

  return (
    <section>
      <SectionHeading
        title="Équipes"
        right={
          <Segmented
            options={[
              { value: "all", label: `Toutes · ${teams.length}` },
              { value: "none", label: `Sans jour · ${teams.filter((t) => !t.centerDayId).length}` },
            ]}
            value={onlyWithoutDay ? "none" : "all"}
            onChange={(v) => setOnlyWithoutDay(v === "none")}
          />
        }
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <BrutalCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="brutal-table">
            <thead>
              <tr>
                <th>Équipe</th>
                <th>Membres</th>
                <th>Rapports finaux</th>
                <th style={{ borderRight: "none", width: 220 }}>Jour</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((team) => {
                const locked = drawn.has(team.id);
                return (
                  <tr key={team.id}>
                    <td>
                      <div className="font-mont" style={{ color: "var(--forest)", fontWeight: 900, letterSpacing: "0.05em" }}>
                        {team.quadrigram}
                      </div>
                      <div className="font-open text-xs" style={{ color: "var(--ink-soft)" }}>{team.name}</div>
                    </td>
                    <td className="font-open text-xs" style={{ color: "var(--ink-soft)", maxWidth: 320 }}>
                      {team.members.map((m) => `${m.firstName} ${m.lastName}`).join(", ") || "—"}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {QUALIFS_PROBLEMS.map((n) => (
                          <Badge key={n} tone={team.reports.some((r) => r.problemNumber === n) ? "sage" : "neutral"} outlined={!team.reports.some((r) => r.problemNumber === n)}>
                            P{n}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td style={{ borderRight: "none" }}>
                      <Select
                        value={team.centerDayId ?? ""}
                        disabled={locked}
                        title={locked ? "Déjà dans une poule — annulez le tirage de son jour pour la déplacer" : undefined}
                        onChange={(e) => run(() => setTeamDay(team.id, e.target.value || null))}
                      >
                        <option value="">Sans jour</option>
                        {days.map((d, i) => (
                          <option key={d.id} value={d.id}>J{i + 1} · {formatDay(d.date)}</option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </BrutalCard>
    </section>
  );
}
