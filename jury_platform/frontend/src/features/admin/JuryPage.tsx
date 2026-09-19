import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, PageHeader, PageLoading, PageMotion, Segmented, Stagger } from "@/features/shared/primitives";
import { EmptyState, StatCard } from "@/features/shared/widgets";
import { getAccounts } from "@/lib/repositories/accountRepository";
import { getCenterDays } from "@/lib/repositories/centerDayRepository";
import { getDuos } from "@/lib/repositories/duoRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import type { Center } from "@/types";
import { CENTERS, formatDay } from "@/utils/labels";
import { DayJury } from "./DuoAssignment";

// JuryPage — one center day at a time: form its jury duos, then give each
// passage of the day's timetable a duo (from the organizers' jury plan).
// The center and day live in the query string and switch with history
// *replace*, like the Tournoi page's center picker.

export function JuryPage() {
  const [params, setParams] = useSearchParams();
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => getAccounts() });
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: () => getPools() });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const daysQ = useQuery({ queryKey: ["center-days"], queryFn: () => getCenterDays() });
  const duosQ = useQuery({ queryKey: ["duos"], queryFn: () => getDuos() });
  const teamById = useMemo(() => new Map((teamsQ.data ?? []).map((t) => [t.id, t])), [teamsQ.data]);

  if (accountsQ.isLoading || poolsQ.isLoading || teamsQ.isLoading || daysQ.isLoading || duosQ.isLoading) {
    return <PageLoading />;
  }

  const pools = poolsQ.data ?? [];
  const duos = duosQ.data ?? [];
  const days = daysQ.data ?? []; // by center, then date
  const jurors = (accountsQ.data ?? [])
    .filter((a) => a.role === "jury")
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
  const passages = pools.flatMap((p) => p.passages);
  const withDuo = passages.filter((p) => p.duo).length;
  const inDuo = new Set(duos.flatMap((d) => d.members.map((m) => m.id)));

  const centers = CENTERS.filter((c) => days.some((d) => d.center === c.value));
  const center = centers.find((c) => c.value === params.get("centre"))?.value ?? centers[0]?.value;
  const centerDays = days.filter((d) => d.center === center);
  const dayIndex = Math.max(0, centerDays.findIndex((d) => d.id === params.get("jour")));
  const day = centerDays[dayIndex];
  const select = (c: Center, dayId?: string) =>
    setParams(dayId ? { centre: c, jour: dayId } : { centre: c }, { replace: true });

  const dayProgress = (dayId: string) => {
    const ps = pools.filter((p) => p.centerDayId === dayId).flatMap((p) => p.passages);
    return ps.length ? ` · ${ps.filter((p) => p.duo).length}/${ps.length}` : "";
  };

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Administration"
        title="Jury"
        sub="Choisissez un jour, formez ses duos, puis cliquez sur un passage du planning pour lui donner un duo."
      />

      <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Jurés" value={jurors.length} />
        <StatCard label="Jurés dans un duo" value={jurors.filter((j) => inDuo.has(j.id)).length} denom={jurors.length || undefined} progressColor="var(--sage)" />
        <StatCard label="Duos" value={duos.length} progressColor="var(--forest-soft)" />
        <StatCard
          label="Passages avec un duo"
          value={withDuo}
          denom={passages.length || undefined}
          highlight={passages.length > 0 && withDuo === passages.length}
        />
      </Stagger>

      {jurors.length === 0 && (
        <Alert tone="warning" title="Aucun juré">
          Créez d'abord les comptes des jurés dans <Link to="/comptes" className="underline font-semibold">Comptes</Link>.
        </Alert>
      )}

      {!center || !day ? (
        <EmptyState title="Aucun jour" sub="Déclarez d'abord les jours des centres depuis la page Tournoi." />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <Picker label="Centre">
              <Segmented options={centers.map((c) => ({ value: c.value, label: c.label }))} value={center} onChange={(c) => select(c)} />
            </Picker>
            <Picker label="Jour">
              <Segmented
                options={centerDays.map((d, i) => ({ value: d.id, label: `J${i + 1} · ${formatDay(d.date)}${dayProgress(d.id)}` }))}
                value={day.id}
                onChange={(id) => select(center, id)}
              />
            </Picker>
          </div>

          <DayJury
            key={day.id}
            day={day}
            dayIndex={dayIndex}
            duos={duos.filter((d) => d.centerDayId === day.id).sort((a, b) => a.number - b.number)}
            pools={pools.filter((p) => p.centerDayId === day.id)}
            jurors={jurors}
            teamById={teamById}
          />
        </>
      )}
    </PageMotion>
  );
}

function Picker({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mont text-micro uppercase tracking-widest mb-1.5" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
