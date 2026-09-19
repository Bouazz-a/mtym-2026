import { distinctValues, filterAndSort, isFilterActive, NO_FILTER, type FilterColumn } from "./columnFilters";

interface Row {
  id: string;
  note: number | null;
}

const note: FilterColumn<Row> = {
  key: "note",
  label: "Note",
  value: (r) => r.note,
  text: (r) => (r.note === null ? "" : String(r.note)),
  range: true,
};
const rows: Row[] = [
  { id: "a", note: 7.5 },
  { id: "b", note: null },
  { id: "c", note: 3 },
  { id: "d", note: 9 },
];
const ids = (rs: Row[]) => rs.map((r) => r.id);

describe("column filters", () => {
  it("keeps everything without a filter", () => {
    expect(ids(filterAndSort(rows, [note], {}, null))).toEqual(["a", "b", "c", "d"]);
    expect(isFilterActive(NO_FILTER)).toBe(false);
  });

  it("hides unchecked values, empty cells included", () => {
    const filters = { note: { ...NO_FILTER, hidden: ["", "9"] } };
    expect(ids(filterAndSort(rows, [note], filters, null))).toEqual(["a", "c"]);
    expect(isFilterActive(filters.note)).toBe(true);
  });

  it("keeps a numeric range, bounds included, and drops empty cells", () => {
    expect(ids(filterAndSort(rows, [note], { note: { ...NO_FILTER, min: "3", max: "7,5" } }, null))).toEqual(["a", "c"]);
    expect(ids(filterAndSort(rows, [note], { note: { ...NO_FILTER, min: "8" } }, null))).toEqual(["d"]);
  });

  it("sorts both ways with empty cells last", () => {
    expect(ids(filterAndSort(rows, [note], {}, { key: "note", dir: "asc" }))).toEqual(["c", "a", "d", "b"]);
    expect(ids(filterAndSort(rows, [note], {}, { key: "note", dir: "desc" }))).toEqual(["d", "a", "c", "b"]);
  });

  it("lists distinct values, empty first then ascending", () => {
    expect(distinctValues([...rows, { id: "e", note: 3 }], note)).toEqual(["", "3", "7.5", "9"]);
  });
});
