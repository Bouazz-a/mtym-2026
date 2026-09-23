import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { isFilterActive, NO_FILTER, type ColumnFilter, type SortDir } from "@/lib/services/columnFilters";
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, FunnelIcon } from "./icons";
import { Badge, Btn, Input, Popover } from "./primitives";

// The dropdown of a table header, like a spreadsheet's filter button: sort
// the column, keep a numeric range, tick the values to show. Changes apply
// as they're made.

// The menu renders inside a <th>: undo the header's typography
const MENU_TEXT: CSSProperties = {
  textTransform: "none",
  letterSpacing: "normal",
  fontWeight: 400,
  fontSize: "0.82rem",
  textAlign: "left",
  color: "var(--ink)",
};

const SORT_LABELS = {
  number: ["Trier du plus petit au plus grand", "Trier du plus grand au plus petit"],
  text: ["Trier de A à Z", "Trier de Z à A"],
  date: ["Du plus ancien au plus récent", "Du plus récent au plus ancien"],
} as const;

// The header button: plain, sorted (outlined), or filtered (filled)
const BUTTON_TONES: Record<"dark" | "light", (filtered: boolean, sorted: boolean) => CSSProperties> = {
  dark: (filtered, sorted) => ({
    border: `1px solid ${filtered || sorted ? "var(--saffron)" : "rgba(244,236,216,0.35)"}`,
    background: filtered ? "var(--saffron)" : "transparent",
    color: filtered ? "var(--forest)" : sorted ? "var(--saffron)" : "var(--paper)",
  }),
  light: (filtered, sorted) => ({
    border: `1px solid ${filtered || sorted ? "var(--forest)" : "rgba(18,32,25,0.35)"}`,
    background: filtered ? "var(--forest)" : "transparent",
    color: filtered ? "var(--saffron)" : "var(--forest)",
    ...(sorted && !filtered && { borderWidth: 2 }),
  }),
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
  tone = "dark",
  sortKind = "number",
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
  tone?: "dark" | "light"; // the header it sits on: forest (default) or saffron
  sortKind?: keyof typeof SORT_LABELS;
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
        style={{ width: "1.5rem", height: "1.5rem", ...BUTTON_TONES[tone](filtered, sort !== null) }}
      >
        {filtered ? <FunnelIcon size="0.8rem" /> : sort === "asc" ? <ArrowUpIcon size="0.8rem" /> : sort ? <ArrowDownIcon size="0.8rem" /> : <ChevronDownIcon size="0.8rem" />}
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} width={17} align={align}>
        <div className="py-2 font-open" style={MENU_TEXT}>
          <MenuItem active={sort === "asc"} onClick={() => onSort(sort === "asc" ? null : "asc")}>
            <ArrowUpIcon size="0.8rem" /> {SORT_LABELS[sortKind][0]}
          </MenuItem>
          <MenuItem active={sort === "desc"} onClick={() => onSort(sort === "desc" ? null : "desc")}>
            <ArrowDownIcon size="0.8rem" /> {SORT_LABELS[sortKind][1]}
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
            <div style={{ maxHeight: "12rem", overflowY: "auto", border: "1px solid var(--border)" }}>
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

// "3/11 passages" + "Effacer les filtres", shown while a table is narrowed
export function FilterSummary({ shown, total, unit, onClear }: { shown: number; total: number; unit: string; onClear: () => void }) {
  return (
    <>
      <Badge tone="saffron">{shown}/{total} {unit}</Badge>
      <Btn variant="ghost" size="sm" onClick={onClear}>Effacer les filtres</Btn>
    </>
  );
}

// The row a filtered table shows when nothing is left
export function NoMatchRow({ colSpan, label, onClear }: { colSpan: number; label: string; onClear: () => void }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ borderRight: "none" }}>
        <div className="py-4 flex items-center justify-center gap-3 flex-wrap">
          <span className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>{label}</span>
          <Btn variant="ghost" size="sm" onClick={onClear}>Effacer les filtres</Btn>
        </div>
      </td>
    </tr>
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
        style={{ accentColor: "var(--forest)", width: "0.95rem", height: "0.95rem" }}
      />
      <span className="font-mont" style={{ fontWeight: 600 }}>{children}</span>
    </label>
  );
}
