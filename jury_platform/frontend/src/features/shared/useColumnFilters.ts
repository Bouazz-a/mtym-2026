import { useState } from "react";
import {
  distinctValues, filterAndSort, type ColumnFilter, type ColumnSort, type FilterColumn, type SortDir,
} from "@/lib/services/columnFilters";

// The state behind a table's spreadsheet-style filters (Notes, Résultats,
// Journal): one filter per column, one sorted column, the rows they leave,
// and the props each column's ColumnFilterMenu needs.
export function useColumnFilters<Row>(rows: Row[], columns: FilterColumn<Row>[]) {
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [sort, setSort] = useState<ColumnSort>(null);
  const shown = filterAndSort(rows, columns, filters, sort);

  const menuProps = (column: FilterColumn<Row>) => ({
    label: column.label,
    values: distinctValues(rows, column),
    filter: filters[column.key],
    onFilter: (filter: ColumnFilter) => setFilters((all) => ({ ...all, [column.key]: filter })),
    sort: sort?.key === column.key ? sort.dir : null,
    onSort: (dir: SortDir | null) => setSort(dir ? { key: column.key, dir } : null),
    range: column.range,
  });

  return {
    shown,
    /** Some rows are hidden, or the order isn't the natural one */
    narrowed: shown.length < rows.length || sort !== null,
    clear: () => {
      setFilters({});
      setSort(null);
    },
    menuProps,
  };
}
