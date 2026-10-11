import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDownIcon } from "./icons";
import { CHEVRON_TURN, unrollFrame, unrollPart } from "./motion";

// The detail a table row unrolls under itself when it is clicked (Notes): it
// opens and closes like the jurors' aide-mémoire, its parts settling into
// place one after the other (shared/motion.ts). The row above carries the
// chevron, aria-expanded and the click.

export function DetailRow({ open, colSpan, children }: { open: boolean; colSpan: number; children: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  return (
    // No motion for a detail already unrolled when the table appears (a link to it)
    <AnimatePresence initial={false}>
      {open && (
        <motion.tr key="detail" initial="closed" animate="open" exit="closed">
          {/* No padding on the cell: the frame inside it starts from nothing */}
          <td colSpan={colSpan} style={{ padding: 0, borderRight: "none", background: "var(--paper-2)" }}>
            <motion.div variants={unrollFrame(reduce)} style={{ overflow: "hidden" }}>
              {children}
            </motion.div>
          </td>
        </motion.tr>
      )}
    </AnimatePresence>
  );
}

// One of the detail's parts, settling into place as it unrolls
export function DetailPart({ className, children }: { className?: string; children: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  return <motion.div variants={unrollPart(reduce)} className={className}>{children}</motion.div>;
}

// In the row's first cell: points down, turns over while the detail is unrolled
export function ExpandChevron({ open }: { open: boolean }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <span
      aria-hidden
      className="shrink-0 inline-flex"
      style={{ color: "var(--ink-faint)", transition: reduce ? undefined : CHEVRON_TURN, transform: open ? "rotate(180deg)" : "none" }}
    >
      <ChevronDownIcon size="0.9rem" />
    </span>
  );
}
