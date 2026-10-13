import {
  bins, concordance, frStat, linearFit, mad, mean, median, niceDomain, niceMax, pearson, quantile, ranking, spearman, stdDev, strength, summarize,
  variance, type Pair,
} from "./stats";

// The 43 final notes of the previous edition, with the mean and the standard
// deviation the committee published for them.
const HISTORIC = [
  14.25642086, 12.33556158, 12.08244054, 11.90462154, 11.87105996, 11.53556859, 11.44475278,
  10.77799011, 10.5546599, 10.31687119, 9.881487321, 9.688905996, 9.468743994, 8.663908237,
  8.632559041, 8.577981324, 8.553391682, 8.30271492, 8.227335453, 8.203745185, 7.479378155,
  7.4329043, 7.318373713, 7.261392288, 7.196823137, 6.729994044, 6.686974864, 6.005414294,
  5.922915203, 5.897126186, 5.548959923, 5.530112558, 5.262105724, 5.096188472, 4.579821219,
  4.179461639, 4.086997375, 3.886240662, 3.728588229, 3.545947204, 3.536001716, 2.616026045,
  1.651284171,
];

describe("stats", () => {
  it("finds the mean and the standard deviation the committee published", () => {
    expect(mean(HISTORIC)).toBeCloseTo(7.592087240093024, 12);
    // The population's (divisor n), not the sample's (3.0239)
    expect(stdDev(HISTORIC)).toBeCloseTo(2.988523633407572, 12);
    expect(variance(HISTORIC)).toBeCloseTo(8.931273507435597, 12);
  });

  it("takes the median of an odd and of an even number of notes", () => {
    expect(median(HISTORIC)).toBe(7.4329043); // the 22nd of 43
    expect(median([40, 10, 30, 20])).toBe(25);
    expect(median([7])).toBe(7);
  });

  it("measures the spread around the median (MAD)", () => {
    expect(mad(HISTORIC)).toBeCloseTo(2.256001696, 9);
    // |x - 50|: 40 30 0 10 40 -> median 30
    expect(mad([10, 20, 50, 60, 90])).toBe(30);
    expect(mad([5, 5, 5])).toBe(0);
  });

  it("interpolates quartiles like a spreadsheet's QUARTILE.INC", () => {
    expect(quantile(HISTORIC, 0.25)).toBeCloseTo(5.396109141, 9);
    expect(quantile(HISTORIC, 0.75)).toBeCloseTo(9.7851966585, 9);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
  });

  it("has nothing to say about an empty list", () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
    expect(variance([])).toBeNull();
    expect(stdDev([])).toBeNull();
    expect(mad([])).toBeNull();
    expect(summarize([])).toBeNull();
  });

  it("summarizes a list in one go, whatever its order", () => {
    expect(summarize([30, 10, 20, 40])).toEqual({
      count: 4, mean: 25, median: 25, variance: 125, stdDev: Math.sqrt(125), mad: 10, min: 10, q1: 17.5, q3: 32.5, max: 40,
    });
  });

  it("rounds an axis of counts up to a round number", () => {
    expect([0, 1, 7, 13, 42].map(niceMax)).toEqual([1, 1, 8, 15, 50]);
  });

  it("rounds a chart's scale outwards", () => {
    expect(niceDomain([23.4, 78.1])).toEqual([20, 80]);
    expect(niceDomain([50])).toEqual([50, 60]); // never an empty scale
    expect(niceDomain([40, 100])).toEqual([40, 100]);
    expect(niceDomain([])).toEqual([0, 10]);
  });

  it("sorts items into classes, empty ones included, the top bound in the last", () => {
    const classes = bins([12, 14, 31, 40], (x) => x, 10);
    expect(classes.map((b) => [b.from, b.to, b.items])).toEqual([
      [10, 20, [12, 14]],
      [20, 30, []],
      [30, 40, [31, 40]],
    ]);
    expect(bins([], (x: number) => x, 10)).toEqual([]);
  });

  it("writes a statistic the French way", () => {
    expect(frStat(54.26)).toBe("54,3");
    expect(frStat(0.7, 2)).toBe("0,70");
    expect(frStat(12, 0)).toBe("12");
  });
});

// Checked against SciPy (pearsonr, spearmanr)
describe("two notes of the same teams", () => {
  const TEXTBOOK: Pair[] = [[1, 2], [2, 4], [3, 5], [4, 4], [5, 5]];
  const NOTES: Pair[] = [[62.5, 58], [48, 52.5], [71.2, 60.1], [55.5, 70.3], [39.9, 45], [80.1, 77.7], [66.6, 49.9]];

  it("measures how closely one note follows the other", () => {
    expect(pearson([[1, 2], [2, 4], [3, 6]])).toBeCloseTo(1, 12);
    expect(pearson([[1, 6], [2, 4], [3, 2]])).toBeCloseTo(-1, 12);
    expect(pearson(TEXTBOOK)).toBeCloseTo(0.7745966692414834, 12);
    expect(pearson(NOTES)).toBeCloseTo(0.6619505299557582, 12);
  });

  it("says nothing of fewer than three teams, nor of a note that never varies", () => {
    expect(pearson([])).toBeNull();
    expect(pearson([[1, 2], [3, 4]])).toBeNull();
    expect(pearson([[5, 1], [5, 2], [5, 3]])).toBeNull();
    expect(spearman([[1, 2], [3, 4]])).toBeNull();
    expect(linearFit([[5, 1], [5, 2], [5, 3]])).toBeNull();
    expect(concordance([[1, 1]])).toBeNull();
  });

  it("draws the line that best tells one note from the other", () => {
    const fit = linearFit(TEXTBOOK)!;
    expect(fit.slope).toBeCloseTo(0.6, 12);
    expect(fit.intercept).toBeCloseTo(2.2, 12);
  });

  it("ranks the highest first, equal notes sharing their place", () => {
    expect(ranking([50, 80, 80, 20])).toEqual([3, 1, 1, 4]);
    expect(ranking([7])).toEqual([1]);
    expect(ranking([])).toEqual([]);
    // 0.1 + 0.2 and 0.3 are one note
    expect(ranking([0.1 + 0.2, 0.3, 0.2])).toEqual([1, 1, 3]);
  });

  it("compares two rankings, ties included", () => {
    expect(spearman(NOTES)).toBeCloseTo(0.642857142857143, 12);
    expect(spearman([[10, 1], [20, 3], [20, 2], [30, 5], [40, 4]])).toBeCloseTo(0.8720815992723809, 12);
    expect(spearman([[1, 4], [2, 3], [3, 2], [4, 1]])).toBeCloseTo(-1, 12);
  });

  it("counts the pairs of teams both notes put in the same order", () => {
    expect(concordance(NOTES)).toBeCloseTo(16 / 21, 12);
    expect(concordance([[1, 4], [2, 3], [3, 2], [4, 1]])).toBe(0);
    // The two teams level at 20 are left out: 8 of the 9 other pairs agree
    expect(concordance([[10, 1], [20, 3], [20, 2], [30, 5], [40, 4]])).toBeCloseTo(8 / 9, 12);
  });

  it("puts a word on a correlation, whatever its sign", () => {
    expect([0.05, 0.2, -0.4, 0.6, -0.9].map(strength)).toEqual(["none", "weak", "moderate", "strong", "veryStrong"]);
  });
});
