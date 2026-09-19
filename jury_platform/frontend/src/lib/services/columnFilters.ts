// Spreadsheet-style column filters: per column, values to hide (the
// checklist) and an optional numeric range, plus a single-column sort.

export interface ColumnFilter {
  hidden: string[]; // unchecked values, by their text ("" = empty cell)
  min: string; // range bounds as typed — "" = no bound
  max: string;
}

export interface FilterColumn<Row> {
  key: string;
  label: string;
  value: (row: Row) => number | null; // for the range and the sort
  text: (row: Row) => string; // as shown in the checklist ("" = empty)
  range?: boolean; // offer the numeric range
}

export type SortDir = "asc" | "desc";
export type ColumnSort = { key: string; dir: SortDir } | null;

export const NO_FILTER: ColumnFilter = { hidden: [], min: "", max: "" };

const bound = (typed: string): number | null => (typed.trim() === "" ? null : Number(typed.replace(",", ".")));

export function isFilterActive(filter: ColumnFilter | undefined): boolean {
  return Boolean(filter && (filter.hidden.length > 0 || bound(filter.min) !== null || bound(filter.max) !== null));
}

function keeps<Row>(row: Row, column: FilterColumn<Row>, filter: ColumnFilter): boolean {
  if (filter.hidden.includes(column.text(row))) return false;
  const min = bound(filter.min);
  const max = bound(filter.max);
  if (min === null && max === null) return true;
  const v = column.value(row);
  return v !== null && (min === null || v >= min) && (max === null || v <= max);
}

// Rows kept by every column's filter, sorted — empty values always last.
export function filterAndSort<Row>(
  rows: Row[],
  columns: FilterColumn<Row>[],
  filters: Record<string, ColumnFilter>,
  sort: ColumnSort,
): Row[] {
  const kept = rows.filter((row) => columns.every((c) => keeps(row, c, filters[c.key] ?? NO_FILTER)));
  const column = sort && columns.find((c) => c.key === sort.key);
  if (!sort || !column) return kept;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...kept].sort((a, b) => {
    const [x, y] = [column.value(a), column.value(b)];
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return (x - y) * sign;
  });
}

// The checklist of a column: its distinct values, empty first, then ascending
export function distinctValues<Row>(rows: Row[], column: FilterColumn<Row>): string[] {
  const byText = new Map(rows.map((row) => [column.text(row), column.value(row)]));
  return [...byText]
    .sort(([, x], [, y]) => (x === null ? -1 : y === null ? 1 : x - y))
    .map(([text]) => text);
}
