// Min-cost assignment (Hungarian algorithm, e-maxx formulation), shared by
// the finale draw and the automatic duo assignment.
//
// cost[row][col]: needs at least as many columns as rows (square is fine).
// Returns, for each row, the column it gets. O(rows² × columns).

export function minCostAssignment(cost: number[][]): number[] {
  const rows = cost.length;
  const cols = cost[0]?.length ?? 0;
  const u = new Array(rows + 1).fill(0); // row potentials
  const v = new Array(cols + 1).fill(0); // column potentials
  const match = new Array(cols + 1).fill(0); // column -> row (1-based, 0 = free)
  const way = new Array(cols + 1).fill(0); // column -> previous column

  for (let row = 1; row <= rows; row++) {
    match[0] = row;
    let col0 = 0;
    const minv = new Array(cols + 1).fill(Infinity);
    const used = new Array(cols + 1).fill(false);
    do {
      used[col0] = true;
      const row0 = match[col0];
      let delta = Infinity;
      let col1 = 0;
      for (let col = 1; col <= cols; col++) {
        if (used[col]) continue;
        const current = cost[row0 - 1][col - 1] - u[row0] - v[col];
        if (current < minv[col]) { minv[col] = current; way[col] = col0; }
        if (minv[col] < delta) { delta = minv[col]; col1 = col; }
      }
      for (let col = 0; col <= cols; col++) {
        if (used[col]) { u[match[col]] += delta; v[col] -= delta; }
        else minv[col] -= delta;
      }
      col0 = col1;
    } while (match[col0] !== 0);
    do {
      const col1 = way[col0];
      match[col0] = match[col1];
      col0 = col1;
    } while (col0);
  }

  const result = new Array<number>(rows).fill(-1);
  for (let col = 1; col <= cols; col++) {
    if (match[col] > 0) result[match[col] - 1] = col - 1;
  }
  return result;
}
