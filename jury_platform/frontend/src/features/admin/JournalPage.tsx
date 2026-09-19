import { Fragment, useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert, Badge, Btn, BrutalCard, Input, PageHeader, PageLoading, PageMotion,
} from "@/features/shared/primitives";
import { ColumnFilterMenu } from "@/features/shared/ColumnFilterMenu";
import { DownloadIcon } from "@/features/shared/icons";
import { EmptyState } from "@/features/shared/widgets";
import { getAuditLog } from "@/lib/repositories/auditRepository";
import {
  distinctValues, filterAndSort, type ColumnFilter, type ColumnSort, type FilterColumn,
} from "@/lib/services/columnFilters";
import { errorMessage } from "@/lib/services/errors";
import type { AuditEntry } from "@/types";

// JournalPage — every admin change: when, who, what. Filter by day, author
// or category, search the details, and export what's shown.

const PAGE = 200; // rows rendered at once

const dateOf = (e: AuditEntry) => new Date(e.at).toLocaleDateString("fr-FR");
const timeOf = (e: AuditEntry) => new Date(e.at).toLocaleTimeString("fr-FR");

const COLUMNS: (FilterColumn<AuditEntry> & { sortKind: "date" | "text" })[] = [
  { key: "day", label: "Date", value: (e) => new Date(e.at).getTime(), text: dateOf, sortKind: "date" },
  { key: "actor", label: "Auteur", value: (e) => e.actorName, text: (e) => e.actorName, sortKind: "text" },
  { key: "category", label: "Catégorie", value: (e) => e.category, text: (e) => e.category, sortKind: "text" },
];

export function JournalPage() {
  const logQ = useQuery({ queryKey: ["audit-log"], queryFn: getAuditLog, staleTime: 0 });
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [sort, setSort] = useState<ColumnSort>(null);
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());
  const [limit, setLimit] = useState(PAGE);
  const [exportError, setExportError] = useState<string | null>(null);

  if (logQ.isLoading) return <PageLoading />;

  const entries = logQ.data ?? [];
  const shown = filterAndSort(entries, COLUMNS, filters, sort).filter(
    (e) => !query || `${e.summary} ${e.actorName} ${e.category}`.toLowerCase().includes(query),
  );
  const narrowed = shown.length < entries.length || sort !== null;
  const clear = () => { setFilters({}); setSort(null); setSearch(""); };

  const exportXlsx = async () => {
    setExportError(null);
    try {
      const { exportJournalXlsx } = await import("@/lib/services/exportService");
      exportJournalXlsx(shown);
    } catch (err) {
      setExportError(errorMessage(err, "Export impossible."));
    }
  };

  return (
    <PageMotion className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Journal"
        sub="Chaque modification faite par un administrateur : quand, par qui, et ce qui a changé."
        right={
          <Btn onClick={exportXlsx} disabled={shown.length === 0}>
            <DownloadIcon size={15} /> Exporter (xlsx)
          </Btn>
        }
      />
      {exportError && <Alert>{exportError}</Alert>}
      {logQ.isError && <Alert>{errorMessage(logQ.error, "Journal indisponible.")}</Alert>}

      {entries.length === 0 ? (
        <EmptyState title="Journal vide" sub="Les modifications des administrateurs apparaîtront ici." />
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div style={{ width: 320, maxWidth: "100%" }}>
              <Input
                type="search"
                value={search}
                placeholder="Rechercher dans le journal"
                aria-label="Rechercher dans le journal"
                onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }}
              />
            </div>
            {narrowed && (
              <>
                <Badge tone="saffron">{shown.length}/{entries.length} entrées</Badge>
                <Btn variant="ghost" size="sm" onClick={clear}>Effacer les filtres</Btn>
              </>
            )}
          </div>

          <BrutalCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="brutal-table brutal-table--manual-stripes">
                <thead>
                  <tr>
                    <FilterHeader column={COLUMNS[0]} entries={entries} filters={filters} setFilters={setFilters} sort={sort} setSort={setSort} />
                    <th>Heure</th>
                    <FilterHeader column={COLUMNS[1]} entries={entries} filters={filters} setFilters={setFilters} sort={sort} setSort={setSort} />
                    <FilterHeader column={COLUMNS[2]} entries={entries} filters={filters} setFilters={setFilters} sort={sort} setSort={setSort} />
                    <th style={{ borderRight: "none" }}>Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, limit).map((e, i) => <EntryRow key={e.id} entry={e} alt={i % 2 === 1} />)}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ borderRight: "none" }}>
                        <div className="py-4 flex items-center justify-center gap-3 flex-wrap">
                          <span className="font-open text-sm italic" style={{ color: "var(--ink-faint)" }}>
                            Aucune entrée ne correspond.
                          </span>
                          <Btn variant="ghost" size="sm" onClick={clear}>Effacer les filtres</Btn>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </BrutalCard>
          {shown.length > limit && (
            <div className="flex justify-center">
              <Btn variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                Afficher {Math.min(PAGE, shown.length - limit)} entrées de plus
              </Btn>
            </div>
          )}
        </>
      )}
    </PageMotion>
  );
}

function FilterHeader({
  column,
  entries,
  filters,
  setFilters,
  sort,
  setSort,
}: {
  column: (typeof COLUMNS)[number];
  entries: AuditEntry[];
  filters: Record<string, ColumnFilter>;
  setFilters: React.Dispatch<React.SetStateAction<Record<string, ColumnFilter>>>;
  sort: ColumnSort;
  setSort: (sort: ColumnSort) => void;
}) {
  return (
    <th>
      <div className="flex items-center justify-between gap-2">
        <span>{column.label}</span>
        <ColumnFilterMenu
          label={column.label}
          values={distinctValues(entries, column)}
          filter={filters[column.key]}
          onFilter={(f) => setFilters((all) => ({ ...all, [column.key]: f }))}
          sort={sort?.key === column.key ? sort.dir : null}
          onSort={(dir) => setSort(dir ? { key: column.key, dir } : null)}
          sortKind={column.sortKind}
        />
      </div>
    </th>
  );
}

// A row with details (before/after, what was deleted) opens on click.
function EntryRow({ entry, alt }: { entry: AuditEntry; alt: boolean }) {
  const [open, setOpen] = useState(false);
  const hasDetails = entry.details != null;
  const toggle = () => setOpen((o) => !o);
  return (
    <>
      <tr
        className={`${hasDetails ? "row-clickable" : ""}${alt ? " row-alt" : ""}`}
        {...(hasDetails && {
          tabIndex: 0,
          "aria-expanded": open,
          onClick: toggle,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          },
        })}
      >
        <td className="font-mont text-xs tabular-nums whitespace-nowrap" style={{ fontWeight: 800, color: "var(--forest)" }}>{dateOf(entry)}</td>
        <td className="font-mont text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>{timeOf(entry)}</td>
        <td>
          <div className="font-mont text-xs" style={{ fontWeight: 800, color: "var(--forest)" }}>{entry.actorName}</div>
          <div className="font-open text-xs" style={{ color: "var(--ink-faint)" }}>{entry.actorEmail}</div>
        </td>
        <td><Badge tone="neutral">{entry.category}</Badge></td>
        <td className="font-open text-sm" style={{ borderRight: "none", color: "var(--ink)" }}>
          {entry.summary}
          {hasDetails && (
            <span className="font-mont text-micro uppercase tracking-widest ml-2" style={{ color: "var(--saffron-dark)", fontWeight: 800 }}>
              {open ? "Masquer" : "Détails"}
            </span>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} style={{ borderRight: "none", background: "var(--paper-2)" }}>
            <Details details={entry.details} />
          </td>
        </tr>
      )}
    </>
  );
}

// { before, after } read as a small Avant / Après grid (a nested <table>
// would inherit the journal table's styles); anything else as indented JSON.
function Details({ details }: { details: unknown }) {
  const d = details as { before?: unknown; after?: unknown } | null;
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (d && isRecord(d.before) && isRecord(d.after)) {
    const [before, after] = [d.before, d.after];
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const show = (v: unknown) => (v === null || v === undefined || v === "" ? "vide" : typeof v === "object" ? JSON.stringify(v) : String(v));
    const head = "font-mont text-micro uppercase tracking-widest pb-1";
    return (
      <div className="inline-grid gap-x-8 gap-y-1 my-1 text-sm font-open" style={{ gridTemplateColumns: "auto auto auto" }}>
        <span />
        <span className={head} style={{ color: "var(--ink-faint)", fontWeight: 800 }}>Avant</span>
        <span className={head} style={{ color: "var(--ink-faint)", fontWeight: 800 }}>Après</span>
        {keys.map((k) => (
          <Fragment key={k}>
            <span className="font-mont text-xs" style={{ fontWeight: 800, color: "var(--ink-soft)" }}>{k}</span>
            <span style={{ color: "var(--ink)" }}>{show(before[k])}</span>
            <span style={{ color: "var(--forest)", fontWeight: 700 }}>{show(after[k])}</span>
          </Fragment>
        ))}
      </div>
    );
  }
  return (
    <pre className="text-xs font-mono whitespace-pre-wrap my-1" style={{ color: "var(--ink)" }}>
      {JSON.stringify(details, null, 2)}
    </pre>
  );
}
