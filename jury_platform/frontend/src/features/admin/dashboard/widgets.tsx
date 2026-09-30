import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/features/shared/primitives";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "@/features/shared/icons";
import { getRecentActivity } from "@/lib/repositories/auditRepository";
import { getMailings } from "@/lib/repositories/mailingRepository";
import {
  choiceCounts, countdown, dayChecks, dayOrder, jurorLoads, problemRows, since, sortJurors,
  type DashboardData, type DayCheck, type JurorSort, type Stage,
} from "@/lib/services/dashboard";
import type { Account } from "@/types";
import { centerLabel } from "@/utils/labels";
import { Donut, GroupedBars, Meter, Skeleton, Widget } from "./charts";
import { hatch } from "./hatch";

// The dashboard's widgets. Each gets the data already narrowed to the
// center filter (lib/services/dashboard.ts computes the figures).

const longDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

const figure = (done: number, total: number) => (total > 0 ? `${done}/${total}` : "—");

// A small segmented control for a widget's header
function Toggle<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex" style={{ border: "1.5px solid var(--forest)" }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className="dash-chip px-2.5 py-1 font-mont text-micro uppercase tracking-widest focus-ring"
          style={{ background: o.value === value ? "var(--forest)" : "transparent", color: o.value === value ? "var(--saffron)" : "var(--ink-soft)", fontWeight: 800 }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── The day to come, and what it still needs ────────────────────────

export function DayReadiness({ data, today, className }: { data: DashboardData; today: string; className?: string }) {
  const { days, focus } = dayOrder(data.days, today);
  const [index, setIndex] = useState(focus);
  const day = days[Math.min(index, days.length - 1)];
  const mailQ = useQuery({
    queryKey: ["mailings", day?.id],
    queryFn: () => getMailings(day!.id),
    enabled: Boolean(day?.drawValidatedAt),
  });

  if (!day) {
    return (
      <Widget title="Jour de compétition" className={className}>
        <p className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>Aucun jour déclaré pour l'instant.</p>
      </Widget>
    );
  }

  const checks = dayChecks(day, data, mailQ.data, today);
  const teams = data.teams.filter((t) => t.centerDayId === day.id).length;
  const pools = data.pools.filter((p) => p.centerDayId === day.id).length;
  const when = countdown(day.date, today);
  const upcoming = day.date >= today;
  const done = checks.filter((c) => c.state === "done").length;

  return (
    <Widget
      title={index === focus && upcoming ? "Prochain jour" : "Jour de compétition"}
      sub={`${done} étape${done > 1 ? "s" : ""} sur ${checks.length} terminée${done > 1 ? "s" : ""}`}
      className={className}
      right={
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Jour précédent" disabled={index === 0} onClick={() => setIndex(index - 1)} className="dash-chip p-2 focus-ring disabled:opacity-30 disabled:cursor-not-allowed" style={{ border: "1.5px solid var(--forest)" }}>
            <ChevronLeftIcon />
          </button>
          <span className="font-mont text-micro tabular-nums px-2" style={{ color: "var(--ink-soft)", fontWeight: 800 }} aria-live="polite">
            {index + 1} / {days.length}
          </span>
          <button type="button" aria-label="Jour suivant" disabled={index >= days.length - 1} onClick={() => setIndex(index + 1)} className="dash-chip p-2 focus-ring disabled:opacity-30 disabled:cursor-not-allowed" style={{ border: "1.5px solid var(--forest)" }}>
            <ChevronRightIcon />
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <div className="font-mont leading-none" style={{ fontSize: "2rem", color: "var(--forest)", fontWeight: 900, letterSpacing: "-0.02em" }}>
            {centerLabel(day.center)}
          </div>
          <div className="font-open text-sm mt-1.5 first-letter:uppercase" style={{ color: "var(--ink-soft)" }}>
            {longDay(day.date)} · {teams} équipe{teams > 1 ? "s" : ""} · {pools} poule{pools > 1 ? "s" : ""}
          </div>
        </div>
        <Badge tone={when === "Aujourd'hui" ? "sage" : upcoming ? "saffron" : "neutral"}>{when}</Badge>
      </div>
      <ul className="space-y-0.5">
        {checks.map((c) => <CheckRow key={c.key} check={c} />)}
      </ul>
    </Widget>
  );
}

// A step's state, drawn: ✓ done, ! to do, · not possible yet (it waits for
// an earlier step). Also said in words by whoever uses it.
const MARKS = {
  done: { bg: "var(--sage)", fg: "var(--surface)", bd: "var(--sage)", text: "fait" },
  todo: { bg: "var(--surface)", fg: "var(--saffron-dark)", bd: "var(--saffron)", text: "à faire" },
  later: { bg: "var(--paper-2)", fg: "var(--ink-faint)", bd: "var(--border)", text: "plus tard" },
} as const;

function StatusMark({ state, size = "1.5rem" }: { state: DayCheck["state"]; size?: string }) {
  const m = MARKS[state];
  return (
    <span
      aria-hidden
      className="shrink-0 grid place-items-center font-mont"
      style={{ width: size, height: size, background: m.bg, color: m.fg, border: `1.5px solid ${m.bd}`, fontWeight: 900, fontSize: "0.7rem" }}
    >
      {state === "done" ? <CheckIcon size="0.7rem" /> : state === "todo" ? "!" : "·"}
    </span>
  );
}

function CheckRow({ check: c }: { check: DayCheck }) {
  const mark = MARKS[c.state];
  const isFlag = c.key === "draw";
  return (
    <li>
      <Link to={c.to} className="dash-row flex items-center gap-3 px-2 py-2 -mx-2 focus-ring" aria-label={`${c.label} : ${isFlag ? (c.done ? "oui" : "non") : figure(c.done, c.total)}, ${mark.text}${c.note ? `, ${c.note}` : ""}`}>
        <StatusMark state={c.state} />
        <span className="flex-1 min-w-0">
          <span className="flex items-baseline justify-between gap-3">
            <span className="font-open text-sm truncate" style={{ color: c.state === "later" ? "var(--ink-faint)" : "var(--ink)", fontWeight: 600 }}>
              {c.label}
              {c.note && <span className="font-normal" style={{ color: "var(--ink-faint)" }}> · {c.note}</span>}
            </span>
            {!isFlag && (
              <span className="font-mont text-xs tabular-nums shrink-0" style={{ color: "var(--forest)", fontWeight: 900 }}>
                {c.loading ? "…" : figure(c.done, c.total)}
              </span>
            )}
          </span>
          {!isFlag && c.state !== "later" && c.total > 0 && (
            <span className="block mt-1"><Meter done={c.done} total={c.total} label={c.label} height="0.3rem" /></span>
          )}
        </span>
        <ChevronRightIcon style={{ color: "var(--ink-faint)" }} />
      </Link>
    </li>
  );
}

// ─── Every stage, from placement to grades ───────────────────────────

export function StagesWidget({ stages, className }: { stages: Stage[]; className?: string }) {
  return (
    <Widget title="Avancement" sub="Du placement des équipes aux notes : cliquez sur une étape pour la faire avancer" className={className}>
      <ul className="space-y-1">
        {stages.map((s) => {
          const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : null;
          return (
            <li key={s.key}>
              <Link to={s.to} className="dash-row block px-2 py-2 -mx-2 focus-ring">
                <span className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="font-open text-sm" style={{ color: "var(--ink)", fontWeight: 600 }}>{s.label}</span>
                  <span className="font-mont text-xs tabular-nums" style={{ color: "var(--forest)", fontWeight: 900 }}>
                    {s.loading ? "…" : figure(s.done, s.total)}
                    {!s.loading && pct !== null && <span className="ml-2" style={{ color: pct === 100 ? "var(--sage-dark)" : "var(--ink-faint)", fontWeight: 700 }}>{pct} %</span>}
                  </span>
                </span>
                {s.loading ? <div className="dash-skeleton" style={{ height: "0.5rem" }} /> : <Meter done={s.done} total={s.total} label={s.label} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </Widget>
  );
}

// ─── Problems: defended, wanted, reported ────────────────────────────

// Two views, each on its own scale: the draw (a team defends one problem)
// and the reports (a team writes one per problem)
const PROBLEM_VIEWS = {
  draw: {
    sub: "Problème défendu par les équipes en poule, face à leur 1er choix",
    label: "Défenses et premiers choix des équipes en poule, par problème",
    series: [
      { key: "defended", label: "Défenses", color: "var(--forest)" },
      { key: "firstChoice", label: "1er choix", color: "var(--saffron-dark)", hatched: true },
    ],
  },
  reports: {
    sub: "Rapports finaux déposés sur le site principal, et équipes qui n'en ont pas encore",
    label: "Rapports reçus et manquants, par problème",
    series: [
      { key: "reports", label: "Reçus", color: "var(--sage)" },
      { key: "missing", label: "Manquants", color: "var(--clay)", hatched: true },
    ],
  },
};

export function ProblemsWidget({ data, className }: { data: DashboardData; className?: string }) {
  const [view, setView] = useState<keyof typeof PROBLEM_VIEWS>("draw");
  const rows = problemRows(data.teams, data.pools);
  const v = PROBLEM_VIEWS[view];
  const drawn = rows.some((r) => r.defended > 0);
  return (
    <Widget
      title="Problèmes"
      sub={`${v.sub}. La légende masque une série.`}
      className={className}
      right={<Toggle label="Vue" value={view} onChange={setView} options={[{ value: "draw", label: "Tirage" }, { value: "reports", label: "Rapports" }]} />}
    >
      {data.teams.length === 0 ? (
        <p className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>Aucune équipe.</p>
      ) : view === "draw" && !drawn ? (
        <p className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>Pas encore de tirage.</p>
      ) : (
        <GroupedBars
          key={view} // a view's hidden series don't carry over
          label={v.label}
          series={v.series}
          groups={rows.map((r) => ({ key: String(r.problem), label: `P${r.problem}`, values: { ...r } }))}
        />
      )}
    </Widget>
  );
}

// ─── The choice each defender got ────────────────────────────────────

const RANK_STYLE: Record<string, { label: string; color: string }> = {
  "1": { label: "1er choix", color: "var(--forest)" },
  "2": { label: "2e choix", color: "var(--sage)" },
  "3": { label: "3e choix", color: "var(--saffron)" },
  "4": { label: "4e choix", color: "var(--clay)" },
};

// Only the teams that ranked the problems: the others had no choice to get
export function ChoicesWidget({ data, className }: { data: DashboardData; className?: string }) {
  const counts = choiceCounts(data.teams, data.pools);
  const ranked = counts.filter((c) => c.rank !== null);
  const total = ranked.reduce((s, c) => s + c.count, 0);
  const first = counts.find((c) => c.rank === 1)?.count ?? 0;
  const unranked = counts.find((c) => c.rank === null)?.count ?? 0;
  return (
    <Widget title="Choix obtenus" sub="Le problème que chaque équipe défend, dans son classement" className={className}>
      {total + unranked === 0 ? (
        <p className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>Pas encore de tirage.</p>
      ) : total === 0 ? (
        <p className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>Aucune équipe en poule n'a classé les problèmes.</p>
      ) : (
        <>
          <Donut
            label={`${first} défenseurs sur ${total} jouent leur 1er choix`}
            slices={ranked.map((c) => {
              const key = String(c.rank);
              return { key, label: RANK_STYLE[key].label, value: c.count, color: RANK_STYLE[key].color };
            })}
            center={
              <>
                <span className="font-mont leading-none" style={{ fontSize: "1.75rem", color: "var(--forest)", fontWeight: 900 }}>
                  {Math.round((first / total) * 100)} %
                </span>
                <span className="font-mont text-micro uppercase tracking-widest mt-1" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>1er choix</span>
              </>
            }
          />
          {unranked > 0 && (
            <p className="font-open text-xs mt-4" style={{ color: "var(--ink-faint)" }}>
              Sans compter {unranked} défenseur{unranked > 1 ? "s" : ""} dont l'équipe n'a pas classé les problèmes.
            </p>
          )}
        </>
      )}
    </Widget>
  );
}

// ─── The jurors' workload ────────────────────────────────────────────

const SHOWN_JURORS = 8;

export function JurorsWidget({ data, accounts, className }: { data: DashboardData; accounts?: Account[]; className?: string }) {
  const [sort, setSort] = useState<JurorSort>("left");
  const [all, setAll] = useState(false);
  const loaded = Boolean(accounts && data.board);
  const loads = loaded ? sortJurors(jurorLoads(accounts!, data), sort) : [];
  const max = Math.max(1, ...loads.map((j) => j.assigned));
  const shown = all ? loads : loads.slice(0, SHOWN_JURORS);

  return (
    <Widget
      title="Charge des jurés"
      sub="Rapports corrigés et à corriger, passages jugés"
      className={className}
      right={
        <Toggle
          label="Trier les jurés"
          value={sort}
          onChange={setSort}
          options={[{ value: "left", label: "Reste" }, { value: "load", label: "Charge" }, { value: "name", label: "Nom" }]}
        />
      }
    >
      {!loaded ? (
        <Skeleton lines={5} />
      ) : loads.length === 0 ? (
        <p className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>Aucun juré n'a encore de rapport ni de passage.</p>
      ) : (
        <>
          <ul className="space-y-0.5">
            {shown.map((j) => {
              const left = j.assigned - j.graded;
              return (
                <li key={j.id}>
                  <Link
                    to="/rapports"
                    aria-label={`${j.name} : ${j.graded} rapports corrigés sur ${j.assigned}, ${j.passages} passages`}
                    className="dash-row grid items-center gap-3 px-2 py-1.5 -mx-2 focus-ring"
                    style={{ gridTemplateColumns: "minmax(0, 9rem) minmax(0, 1fr) auto" }}
                  >
                    <span className="font-open text-sm truncate" title={j.name} style={{ color: "var(--ink)", fontWeight: 600 }}>{j.name}</span>
                    <span className="flex h-3" aria-hidden>
                      <span className="dash-grow-x h-full" style={{ width: `${(j.graded / max) * 100}%`, background: "var(--sage)", transformOrigin: "left" }} />
                      <span className="h-full" style={{ width: `${(left / max) * 100}%`, ...hatch("var(--saffron-dark)") }} />
                    </span>
                    <span className="flex items-center gap-2 justify-end">
                      <span className="font-mont text-xs tabular-nums" style={{ color: "var(--forest)", fontWeight: 900 }}>{figure(j.graded, j.assigned)}</span>
                      <span className="font-mont text-micro tabular-nums px-1.5 py-0.5" style={{ background: "var(--paper-2)", color: "var(--ink-soft)", fontWeight: 800 }} title="Passages jugés par son duo">
                        {j.passages} pass.
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            <span className="flex items-center gap-4 font-open text-xs" style={{ color: "var(--ink-soft)" }} aria-hidden>
              <span className="inline-flex items-center gap-1.5"><span style={{ width: "0.75rem", height: "0.75rem", background: "var(--sage)" }} />corrigés</span>
              <span className="inline-flex items-center gap-1.5"><span style={{ width: "0.75rem", height: "0.75rem", ...hatch("var(--saffron-dark)") }} />à corriger</span>
            </span>
            {loads.length > SHOWN_JURORS && (
              <button type="button" onClick={() => setAll(!all)} className="font-mont text-micro uppercase tracking-widest underline focus-ring" style={{ color: "var(--forest)", fontWeight: 800 }}>
                {all ? "Voir moins" : `Voir les ${loads.length} jurés`}
              </button>
            )}
          </div>
        </>
      )}
    </Widget>
  );
}

// ─── What the admins did lately ──────────────────────────────────────

const RECENT_DAYS = 14;
const SHOWN_ENTRIES = 7;

export function ActivityWidget({ className }: { className?: string }) {
  const [from] = useState(() => new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString());
  const logQ = useQuery({ queryKey: ["audit-log", "recent", from], queryFn: () => getRecentActivity(from) });
  const now = new Date();
  const entries = (logQ.data ?? []).slice(0, SHOWN_ENTRIES);
  return (
    <Widget
      title="Activité récente"
      sub={`Les dernières modifications (${RECENT_DAYS} derniers jours)`}
      className={className}
      right={<Link to="/journal" className="font-mont text-micro uppercase tracking-widest underline focus-ring" style={{ color: "var(--forest)", fontWeight: 800 }}>Tout le journal</Link>}
    >
      {logQ.isLoading ? (
        <Skeleton lines={5} />
      ) : logQ.isError ? (
        <p className="font-open text-sm" style={{ color: "var(--clay)" }}>
          Journal indisponible. <button type="button" className="underline" onClick={() => logQ.refetch()}>Réessayer</button>
        </p>
      ) : entries.length === 0 ? (
        <p className="font-open text-sm" style={{ color: "var(--ink-faint)" }}>Rien ces {RECENT_DAYS} derniers jours.</p>
      ) : (
        <ol className="relative space-y-3" style={{ borderLeft: "2px solid var(--border)", marginLeft: "0.3rem" }}>
          {entries.map((e) => (
            <li key={e.id} className="relative pl-4">
              <span aria-hidden className="absolute" style={{ left: "-0.4rem", top: "0.35rem", width: "0.625rem", height: "0.625rem", background: "var(--surface)", border: "2px solid var(--forest)" }} />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
                  <time dateTime={e.at} title={new Date(e.at).toLocaleString("fr-FR")}>{since(e.at, now)}</time>
                </span>
                <Badge tone="neutral">{e.category}</Badge>
              </div>
              <p className="font-open text-sm mt-0.5 line-clamp-2" style={{ color: "var(--ink)" }} title={e.summary}>{e.summary}</p>
              <p className="font-open text-xs" style={{ color: "var(--ink-faint)" }}>{e.actorName}</p>
            </li>
          ))}
        </ol>
      )}
    </Widget>
  );
}
