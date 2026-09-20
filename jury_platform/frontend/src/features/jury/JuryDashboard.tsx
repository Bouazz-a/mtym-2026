import { Fragment } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge, Btn, BrutalCard, PageHeader, PageLoading, PageMotion, SectionHeading, Segmented, Stagger } from "@/features/shared/primitives";
import { EmptyState, RoleChip, StatCard } from "@/features/shared/widgets";
import { useSession } from "@/features/shared/SessionContext";
import { getOralEvaluations, getReportEvaluations } from "@/lib/repositories/evaluationRepository";
import { getPools } from "@/lib/repositories/poolRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import type { PassageDetails, PoolDetails } from "@/types";
import { centerLabel, formatDay } from "@/utils/labels";
import { breakMinutes, DEFAULT_SCHEDULE, slotEnd } from "@/utils/schedule";
import { hasSeenGuide } from "./guide/guideStorage";
import { useJuryGuide } from "./guide/useJuryGuide";

// JuryDashboard — "Mon planning": the juror's day hour by hour, from the
// day's schedule. Each slot shows the passage their duo judges (pool, room,
// problem, teams, grading progress) or that they're free; pauses between.
// With several days, a picker switches between them (query string +
// history replace, like the admin pages). The guided tour starts here the
// first time (or when the account menu asks for it, ?guide=1).

type MyPassage = PassageDetails & { pool: PoolDetails };

export function JuryDashboard() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const poolsQ = useQuery({ queryKey: ["pools"], queryFn: () => getPools() });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => getTeams() });
  const oralQ = useQuery({ queryKey: ["oral-evaluations"], queryFn: () => getOralEvaluations() });
  const reportQ = useQuery({ queryKey: ["report-evaluations"], queryFn: () => getReportEvaluations() });
  const loading = poolsQ.isLoading || teamsQ.isLoading || oralQ.isLoading || reportQ.isLoading;
  const guideWanted = params.get("guide") === "1" || (user ? !hasSeenGuide(user.id) : false);
  useJuryGuide("planning", !loading && guideWanted, user?.id);

  if (loading) return <PageLoading />;

  const teamById = new Map((teamsQ.data ?? []).map((t) => [t.id, t]));
  const mine: MyPassage[] = (poolsQ.data ?? []).flatMap((pool) =>
    pool.passages.filter((p) => p.duo?.members.some((m) => m.id === user?.id)).map((p) => ({ ...p, pool })),
  );

  const oralDone = (p: PassageDetails) => (oralQ.data ?? []).filter((e) => e.passageId === p.id).length;
  const reportDone = (p: PassageDetails) =>
    (reportQ.data ?? []).some((e) => e.teamId === p.defenderTeamId && e.problemNumber === p.problemNumber);

  // The juror's days, in date order; by default the first one not past yet
  const days = [...new Map(mine.filter((p) => p.pool.centerDay).map((p) => [p.pool.centerDay!.id, p.pool.centerDay!])).values()]
    .sort((a, b) => a.date.localeCompare(b.date));
  const today = new Date().toISOString().slice(0, 10);
  const day = days.find((d) => d.id === params.get("jour")) ?? days.find((d) => d.date >= today) ?? days[0];
  const dayPassages = mine.filter((p) => p.pool.centerDay?.id === day?.id);
  const firstPassageId = [...dayPassages].sort((a, b) => a.slot - b.slot)[0]?.id; // the guide points at it
  const coJurors = dayPassages[0]?.duo?.members.filter((m) => m.id !== user?.id) ?? [];

  return (
    <PageMotion className="space-y-10">
      <PageHeader
        eyebrow="Jury"
        title={`Bonjour ${user?.firstName ?? ""}`}
        sub="Votre planning : les passages que votre duo juge, heure par heure. Notez l'oral (les trois rôles) et le rapport écrit du défenseur."
        right={
          <Link to="/entrainement">
            <Btn variant="ghost" data-tour="practice-button">S'entraîner sur un passage fictif</Btn>
          </Link>
        }
      />

      {mine.length === 0 ? (
        <EmptyState title="Aucun passage pour l'instant" sub="Les organisateurs ne vous ont pas encore attribué de passage." />
      ) : (
        <>
          <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <StatCard label="Passages" value={mine.length} />
            <StatCard
              label="Oraux notés"
              value={mine.reduce((s, p) => s + oralDone(p), 0)}
              denom={mine.length * 3}
              progressColor="var(--sage)"
            />
            <StatCard
              label="Rapports notés"
              value={mine.filter(reportDone).length}
              denom={mine.length}
              progressColor="var(--forest-soft)"
            />
          </Stagger>

          {days.length > 1 && day && (
            <div data-tour="day-picker" className="inline-block">
              <Segmented
                options={days.map((d) => ({ value: d.id, label: `${centerLabel(d.center)} · ${formatDay(d.date)}` }))}
                value={day.id}
                onChange={(id) => setParams({ jour: id }, { replace: true })}
              />
            </div>
          )}

          {day && (
            <section>
              <SectionHeading
                title={`Mon planning · ${centerLabel(day.center)} · ${formatDay(day.date)}`}
                right={coJurors.length > 0 && (
                  <Badge tone="dark">
                    Duo {dayPassages[0].duo?.number} · avec {coJurors.map((j) => `${j.firstName} ${j.lastName}`).join(", ")}
                  </Badge>
                )}
              />
              <BrutalCard className="overflow-hidden" data-tour="planning">
                {(day.schedule ?? DEFAULT_SCHEDULE).map((slot, i, schedule) => {
                  const here = dayPassages.filter((p) => p.slot === i + 1);
                  return (
                    <Fragment key={i}>
                      {i > 0 && <PauseBand minutes={breakMinutes(schedule, i)} />}
                      <div className="flex" style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                        <div
                          className="shrink-0 px-3 py-4 flex flex-col"
                          style={{ width: "5.25rem", background: "var(--paper-2)", borderRight: "2px solid var(--forest)" }}
                        >
                          <span className="font-mont tabular-nums" style={{ color: "var(--forest)", fontWeight: 900, fontSize: "1.05rem" }}>{slot.start}</span>
                          <span className="font-mont text-xs tabular-nums" style={{ color: "var(--ink-soft)", fontWeight: 700 }}>{slotEnd(slot)}</span>
                        </div>
                        <div className="flex-1 min-w-0 p-4 space-y-4">
                          {here.length === 0 ? (
                            <p className="font-mont text-micro uppercase tracking-widest py-2" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
                              Libre
                            </p>
                          ) : (
                            here.map((p) => (
                              <PassageSlot
                                key={p.id}
                                passage={p}
                                quad={(id) => teamById.get(id)?.quadrigram ?? "—"}
                                oral={oralDone(p)}
                                report={reportDone(p)}
                                tourAnchors={p.id === firstPassageId}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </BrutalCard>
            </section>
          )}
        </>
      )}
    </PageMotion>
  );
}

function PauseBand({ minutes }: { minutes: number }) {
  return (
    <div
      className="px-3 flex items-center font-mont text-micro uppercase tracking-widest"
      style={{
        height: `calc(1.5rem + ${(Math.min(minutes, 90) * 0.025).toFixed(3)}rem)`,
        borderTop: "1px solid var(--border)",
        color: "var(--ink-soft)",
        fontWeight: 800,
        background: "repeating-linear-gradient(135deg, var(--paper) 0 0.375rem, var(--paper-2) 0.375rem 0.75rem)",
      }}
    >
      {minutes > 0 ? `Pause · ${minutes} min` : "Sans pause"}
    </div>
  );
}

function PassageSlot({
  passage,
  quad,
  oral,
  report,
  tourAnchors = false,
}: {
  passage: MyPassage;
  quad: (teamId: string) => string;
  oral: number; // orals graded, out of 3
  report: boolean;
  tourAnchors?: boolean; // the passage the guide points at
}) {
  const anchor = (name: string) => (tourAnchors ? name : undefined);
  return (
    <div className="flex items-center gap-4 flex-wrap" data-tour={anchor("passage-card")}>
      <div style={{ minWidth: "9.375rem" }}>
        <div className="font-mont" style={{ color: "var(--forest)", fontWeight: 900 }}>Poule {passage.pool.label}</div>
        <div className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
          {passage.label}{passage.room ? ` · Salle ${passage.room}` : ""}
        </div>
      </div>
      <Badge tone="dark">Problème {passage.problemNumber}</Badge>
      <div className="flex gap-1.5 flex-wrap">
        {(["defender", "opponent", "reporter"] as const).map((role) => (
          <RoleChip key={role} role={role} quad={quad(passage[`${role}TeamId`])} />
        ))}
      </div>
      <div className="flex items-center gap-2 ml-auto flex-wrap">
        <Link to={`/passages/${passage.id}`} data-tour={anchor("oral-button")}>
          <Btn size="sm" variant={oral === 3 ? "ghost" : "primary"}>Oral · {oral}/3</Btn>
        </Link>
        <Link to={`/passages/${passage.id}?onglet=rapport`} data-tour={anchor("report-button")}>
          <Btn size="sm" variant={report ? "ghost" : "forest"}>Rapport · {report ? "noté" : "à noter"}</Btn>
        </Link>
      </div>
    </div>
  );
}
