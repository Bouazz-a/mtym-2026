import { useState } from "react";
import { BrutalCard } from "@/features/shared/primitives";
import { ChevronDownIcon } from "@/features/shared/icons";
import { BOARD_RULE, POOLS_NOTE, PRINCIPLES, QUESTIONS, REPORT_RULES, ROLES, SCALE, TIMELINE } from "./guide/guideContent";

// Aide-mémoire of a passage page: the grading scale, how a passage runs, the
// roles and room rules, the questions to ask and how the written report is
// marked — for a quick look during the passage, on a phone. Closed by
// default. Texts: guide/guideContent.ts (from the organizers' 2026 guide).

export function Memo() {
  const [open, setOpen] = useState(false);
  return (
    <BrutalCard withCorners={false} data-tour="memo">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full px-5 py-3 flex items-center justify-between gap-3 text-left hover-row"
      >
        <span className="font-mont text-tiny uppercase tracking-widest" style={{ color: "var(--forest)", fontWeight: 900 }}>
          Aide-mémoire
          <span className="ml-2 normal-case tracking-normal font-open" style={{ color: "var(--ink-faint)", fontWeight: 400 }}>
            notation, déroulé, rôles, règles de salle, rapport écrit
          </span>
        </span>
        <span style={{ color: "var(--forest)", transition: "transform 180ms", transform: open ? "rotate(180deg)" : "none" }}>
          <ChevronDownIcon size="1rem" />
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ borderTop: "1px solid var(--border)" }}>
          <section className="pt-4">
            <Heading>Taux de réussite</Heading>
            <ul className="space-y-1.5">
              {SCALE.map((s) => (
                <li key={s.value} className="flex gap-3 text-sm font-open">
                  <span className="font-mont tabular-nums shrink-0" style={{ color: "var(--saffron-dark)", fontWeight: 900, width: "4rem" }}>
                    {s.value} <span className="text-micro" style={{ color: "var(--ink-faint)" }}>{s.percent}</span>
                  </span>
                  <span style={{ color: "var(--ink)" }}>{s.meaning}</span>
                </li>
              ))}
            </ul>
            <ul className="mt-3 space-y-1 text-sm font-open list-disc pl-5" style={{ color: "var(--ink-soft)" }}>
              {PRINCIPLES.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </section>

          <section className="pt-4">
            <Heading>Déroulé d'un passage (~63 min)</Heading>
            <ul className="text-sm font-open">
              {TIMELINE.map((t) => (
                <li key={t.step} className="flex justify-between gap-3 py-1" style={{ borderBottom: "1px dashed var(--border)" }}>
                  <span style={{ color: "var(--ink)" }}>{t.step}</span>
                  <span className="font-mont text-xs tabular-nums shrink-0" style={{ color: "var(--ink-soft)", fontWeight: 800 }}>{t.duration}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <Heading>Rôles</Heading>
            <ul className="space-y-2 text-sm font-open">
              {ROLES.map((r) => (
                <li key={r.role}>
                  <strong className="font-mont" style={{ color: "var(--forest)" }}>{r.role}</strong>{" "}
                  <span style={{ color: "var(--ink)" }}>{r.text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-open" style={{ color: "var(--ink-soft)" }}>{POOLS_NOTE}</p>
          </section>

          <section>
            <Heading>Au tableau</Heading>
            <ul className="space-y-1.5 text-sm font-open list-disc pl-5" style={{ color: "var(--ink)" }}>
              {BOARD_RULE.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </section>

          <section>
            <Heading>Questions à poser</Heading>
            <ul className="space-y-1.5 text-sm font-open list-disc pl-5" style={{ color: "var(--ink)" }}>
              {QUESTIONS.map((q) => <li key={q}>{q}</li>)}
            </ul>
          </section>

          <section>
            <Heading>Rapport écrit</Heading>
            <ul className="space-y-1.5 text-sm font-open list-disc pl-5" style={{ color: "var(--ink)" }}>
              {REPORT_RULES.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </section>
        </div>
      )}
    </BrutalCard>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mont text-micro uppercase tracking-widest mb-2" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
      {children}
    </div>
  );
}
