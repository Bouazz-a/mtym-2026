import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { isFilterActive, NO_FILTER, type ColumnFilter, type SortDir } from "@/lib/services/columnFilters";
import { Btn, Input, Popover } from "./primitives";

// The dropdown of a table header, like a spreadsheet's filter button: sort
// the column, keep a numeric range, tick the values to show. Changes apply
// as they're made.

// The menu renders inside a <th>: undo the header's typography
const MENU_TEXT: CSSProperties = {
  textTransform: "none",
  letterSpacing: "normal",
  fontWeight: 400,
  fontSize: 13,
  textAlign: "left",
  color: "var(--ink)",
};

export function ColumnFilterMenu({
  label,
  values,
  filter = NO_FILTER,
  onFilter,
  sort,
  onSort,
  range = false,
  emptyLabel = "(Vide)",
  align = "left",
}: {
  label: string;
  values: string[]; // the checklist — see distinctValues()
  filter?: ColumnFilter;
  onFilter: (filter: ColumnFilter) => void;
  sort: SortDir | null; // this column's sort, if it's the sorted one
  onSort: (dir: SortDir | null) => void;
  range?: boolean;
  emptyLabel?: string; // how "" reads in the checklist
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const filtered = isFilterActive(filter);
  const hidden = new Set(filter.hidden);
  const shown = values.filter((v) => !hidden.has(v)).length;

  const toggle = (value: string) =>
    onFilter({ ...filter, hidden: hidden.has(value) ? filter.hidden.filter((v) => v !== value) : [...filter.hidden, value] });

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Filtrer et trier : ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={filtered ? "Filtre actif" : sort ? "Colonne triée" : "Filtrer et trier"}
        className="shrink-0 inline-flex items-center justify-center transition-colors"
        style={{
          width: 24,
          height: 24,
          border: `1px solid ${filtered || sort ? "var(--saffron)" : "rgba(244,236,216,0.35)"}`,
          background: filtered ? "var(--saffron)" : "transparent",
          color: filtered ? "var(--forest)" : sort ? "var(--saffron)" : "var(--paper)",
        }}
      >
        {filtered ? <FunnelIcon /> : sort ? <ArrowIcon up={sort === "asc"} /> : <ChevronIcon />}
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} width={270} align={align}>
        <div className="py-2 font-open" style={MENU_TEXT}>
          <MenuItem active={sort === "asc"} onClick={() => onSort(sort === "asc" ? null : "asc")}>
            <ArrowIcon up /> Trier du plus petit au plus grand
          </MenuItem>
          <MenuItem active={sort === "desc"} onClick={() => onSort(sort === "desc" ? null : "desc")}>
            <ArrowIcon up={false} /> Trier du plus grand au plus petit
          </MenuItem>

          {range && (
            <div className="px-3 pt-3 pb-1" style={{ borderTop: "1px solid var(--border)", marginTop: 6 }}>
              <SubLabel>Note entre</SubLabel>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder="min"
                  aria-label={`${label} : note minimum`}
                  value={filter.min}
                  onChange={(e) => onFilter({ ...filter, min: e.target.value })}
                />
                <span className="text-xs" style={{ color: "var(--ink-soft)" }}>et</span>
                <Input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder="max"
                  aria-label={`${label} : note maximum`}
                  value={filter.max}
                  onChange={(e) => onFilter({ ...filter, max: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="px-3 pt-3 pb-1" style={{ borderTop: range ? undefined : "1px solid var(--border)", marginTop: range ? 0 : 6 }}>
            <SubLabel>Valeurs</SubLabel>
            <div style={{ maxHeight: 190, overflowY: "auto", border: "1px solid var(--border)" }}>
              <CheckRow
                checked={shown === values.length}
                indeterminate={shown > 0 && shown < values.length}
                onChange={() => onFilter({ ...filter, hidden: shown === values.length ? [...values] : [] })}
              >
                (Tout sélectionner)
              </CheckRow>
              {values.map((v) => (
                <CheckRow key={v} checked={!hidden.has(v)} onChange={() => toggle(v)}>
                  {v === "" ? emptyLabel : v}
                </CheckRow>
              ))}
            </div>
          </div>

          <div className="px-3 pt-3 flex items-center justify-between gap-2">
            <Btn variant="ghost" size="sm" disabled={!filtered && !sort} onClick={() => { onFilter(NO_FILTER); onSort(null); }}>
              Effacer
            </Btn>
            <Btn size="sm" onClick={() => setOpen(false)}>OK</Btn>
          </div>
        </div>
      </Popover>
    </>
  );
}

function SubLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mont text-micro uppercase tracking-widest mb-1.5" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>
      {children}
    </div>
  );
}

function MenuItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover-row transition-colors"
      style={{ color: active ? "var(--forest)" : "var(--ink)", fontWeight: active ? 700 : 400, background: active ? "rgba(98,159,115,0.14)" : undefined }}
    >
      {children}
    </button>
  );
}

function CheckRow({
  checked,
  indeterminate = false,
  onChange,
  children,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover-row">
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => { if (el) el.indeterminate = indeterminate; }}
        onChange={onChange}
        style={{ accentColor: "var(--forest)", width: 15, height: 15 }}
      />
      <span className="font-mont" style={{ fontWeight: 600 }}>{children}</span>
    </label>
  );
}

const ICON = { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function ChevronIcon() {
  return <svg {...ICON}><polyline points="6 9 12 15 18 9" /></svg>;
}

function FunnelIcon() {
  return <svg {...ICON}><polygon points="3 4 21 4 14 12.5 14 19 10 21 10 12.5 3 4" /></svg>;
}

function ArrowIcon({ up }: { up: boolean }) {
  return (
    <svg {...ICON}>
      {up ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="6 11 12 5 18 11" /></> : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="6 13 12 19 18 13" /></>}
    </svg>
  );
}
