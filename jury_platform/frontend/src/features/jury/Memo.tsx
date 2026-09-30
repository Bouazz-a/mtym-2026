import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { BrutalCard } from "@/features/shared/primitives";
import { ChevronDownIcon } from "@/features/shared/icons";
import { BOARD_RULE, POOLS_NOTE, PRINCIPLES, QUESTIONS, REPORT_RULES, ROLES, SCALE, TIMELINE } from "./guide/guideContent";
import { QuarterMeter } from "./gradingWidgets";

// Aide-mémoire of a passage page: the grading scale, how a passage runs, the
// roles and room rules, the questions to ask and how the written report is
// marked — for a quick look during the passage, on a phone. Closed by
// default. Texts: guide/guideContent.ts (from the organizers' 2026 guide).
//
// Opening, the frame unrolls and its sections settle into place one after
// the other, in reading order, each dropping a few pixels as it appears;
// closing, the sections fade together and the frame rolls back up, faster.
// All at once with reduced motion.

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.4, 0, 1, 1] as const;

const frame = (reduce: boolean): Variants => ({
  closed: { height: 0, transition: reduce ? { duration: 0 } : { duration: 0.26, ease: EASE_IN } },
  open: {
    height: "auto",
    transition: reduce ? { duration: 0 } : { duration: 0.46, ease: EASE_OUT, staggerChildren: 0.055, delayChildren: 0.05 },
  },
});

const part = (reduce: boolean): Variants => ({
  closed: { opacity: 0, y: reduce ? 0 : -10, transition: { duration: reduce ? 0 : 0.1 } },
  open: { opacity: 1, y: 0, transition: reduce ? { duration: 0 } : { duration: 0.36, ease: EASE_OUT } },
});

export function Memo() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion() ?? false;
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
        <span style={{ color: "var(--forest)", transition: reduce ? undefined : "transform 260ms cubic-bezier(0.16, 1, 0.3, 1)", transform: open ? "rotate(180deg)" : "none" }}>
          <ChevronDownIcon size="1rem" />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="memo"
            variants={frame(reduce)}
            initial="closed"
            animate="open"
            exit="closed"
            style={{ overflow: "hidden" }}
          >
            <div className="px-5 pb-5 grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ borderTop: "1px solid var(--border)" }}>
              <Part className="pt-4">
                <Heading>Taux de réussite</Heading>
                {/* Each mark, drawn as quarters filled (its percentage for screen
                    readers), then what it means */}
                <ul className="space-y-2">
                  {SCALE.map((s) => (
                    <li key={s.value} className="flex items-baseline gap-3 text-sm font-open">
                      <span className="shrink-0 inline-flex items-center gap-2.5" style={{ width: "5.5rem" }}>
                        <span className="font-mont tabular-nums whitespace-nowrap" style={{ color: "var(--saffron-dark)", fontWeight: 900, width: "2.4rem" }}>
                          {s.value}
                        </span>
                        <QuarterMeter value={Number(s.value.replace(",", "."))} label={s.percent} />
                      </span>
                      <span style={{ color: "var(--ink)" }}>{s.meaning}</span>
                    </li>
                  ))}
                </ul>
                <ul className="mt-3 space-y-1 text-sm font-open list-disc pl-5" style={{ color: "var(--ink-soft)" }}>
                  {PRINCIPLES.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </Part>

              <Part className="pt-4">
                <Heading>Déroulé d'un passage (~63 min)</Heading>
                <ul className="text-sm font-open">
                  {TIMELINE.map((t) => (
                    <li key={t.step} className="flex justify-between gap-3 py-1" style={{ borderBottom: "1px dashed var(--border)" }}>
                      <span style={{ color: "var(--ink)" }}>{t.step}</span>
                      <span className="font-mont text-xs tabular-nums shrink-0" style={{ color: "var(--ink-soft)", fontWeight: 800 }}>{t.duration}</span>
                    </li>
                  ))}
                </ul>
              </Part>

              <Part>
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
              </Part>

              <Part>
                <Heading>Au tableau</Heading>
                <ul className="space-y-1.5 text-sm font-open list-disc pl-5" style={{ color: "var(--ink)" }}>
                  {BOARD_RULE.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </Part>

              <Part>
                <Heading>Questions à poser</Heading>
                <ul className="space-y-1.5 text-sm font-open list-disc pl-5" style={{ color: "var(--ink)" }}>
                  {QUESTIONS.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </Part>

              <Part>
                <Heading>Rapport écrit</Heading>
                <ul className="space-y-1.5 text-sm font-open list-disc pl-5" style={{ color: "var(--ink)" }}>
                  {REPORT_RULES.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </Part>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </BrutalCard>
  );
}

// One of the aide-mémoire's sections, settling into place as it opens
function Part({ className, children }: { className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  return <motion.section variants={part(reduce)} className={className}>{children}</motion.section>;
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mont text-micro uppercase tracking-widest mb-2" style={{ color: "var(--saffron-dark)", fontWeight: 900 }}>
      {children}
    </div>
  );
}
