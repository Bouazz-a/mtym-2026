import { BRUSHES, BRUSH_LIFE, FLOATS_PER_GRAIN, KICKS, REST_REACH, brushWeight, buildField, driftAt, driftShare, grainAt, pickTrackers, type SandFrame } from "./sandField";

// A mask: a 40 x 10 box whose left half is inked
const W = 40;
const H = 10;
const mask = new Uint8ClampedArray(W * H).map((_, i) => (i % W < W / 2 ? 255 : 0));

const still = (time: number, extra: Partial<SandFrame> = {}): SandFrame => ({
  time,
  intro: 99,
  drift: 0,
  ...driftAt(time),
  extent: [1.5, 0.8],
  kicks: new Float32Array(KICKS * 4),
  brush: new Float32Array(BRUSHES * 4),
  ...extra,
});

describe("buildField", () => {
  it("drops every grain on the ink, in logo units", () => {
    const field = buildField(mask, W, H, 500);
    expect(field.count).toBe(500);
    expect(field.aspect).toBeCloseTo(0.25);
    for (let i = 0; i < field.count; i++) {
      const [hx, hy] = [field.data[i * FLOATS_PER_GRAIN], field.data[i * FLOATS_PER_GRAIN + 1]];
      expect(hx).toBeGreaterThanOrEqual(-1);
      expect(hx).toBeLessThan(0); // the inked left half
      expect(Math.abs(hy)).toBeLessThanOrEqual(0.25);
    }
  });

  it("gives the same sand at every visit", () => {
    expect(buildField(mask, W, H, 200).data).toEqual(buildField(mask, W, H, 200).data);
  });

  it("stops short on an empty mask instead of looping", () => {
    expect(buildField(new Uint8ClampedArray(W * H), W, H, 100).count).toBe(0);
  });
});

describe("pickTrackers", () => {
  it("keeps the trackers apart", () => {
    const field = buildField(mask, W, H, 2000);
    const trackers = pickTrackers(field, 8, 0.15);
    expect(trackers.length).toBeGreaterThan(3);
    for (const a of trackers) {
      for (const b of trackers) {
        if (a === b) continue;
        const d = Math.hypot(field.data[a * FLOATS_PER_GRAIN] - field.data[b * FLOATS_PER_GRAIN], field.data[a * FLOATS_PER_GRAIN + 1] - field.data[b * FLOATS_PER_GRAIN + 1]);
        expect(d).toBeGreaterThanOrEqual(0.15);
      }
    }
  });
});

describe("grainAt", () => {
  const field = buildField(mask, W, H, 300);
  const home = (i: number) => [field.data[i * FLOATS_PER_GRAIN], field.data[i * FLOATS_PER_GRAIN + 1]];

  it("keeps a grain near home when nothing blows, but never quite still", () => {
    for (let i = 0; i < field.count; i += 17) {
      const [hx, hy] = home(i);
      const a = grainAt(field, i, still(12.3));
      const b = grainAt(field, i, still(13.3));
      expect(Math.hypot(a.x - hx, a.y - hy)).toBeLessThanOrEqual(REST_REACH);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0);
      expect(a.alpha).toBe(1);
    }
  });

  it("starts the gathering from the scattered dust, faint", () => {
    const g = grainAt(field, 5, still(0, { intro: 0 }));
    const o = 5 * FLOATS_PER_GRAIN;
    expect(g.x).toBeCloseTo(field.data[o + 6] * 1.5);
    expect(g.y).toBeCloseTo(field.data[o + 7] * 0.8);
    expect(g.alpha).toBeCloseTo(0.35);
  });

  it("blows only the grains past the line, and downwind", () => {
    // A line through the middle of the ink, the right side blowing to the right
    const frame = (time: number) => still(time, { drift: 1, line: [-0.5, 0, 1, 0], wind: [1, 0] });
    let moved = 0;
    for (let i = 0; i < field.count; i++) {
      const [hx] = home(i);
      for (let time = 0; time < 8; time += 0.5) {
        const g = grainAt(field, i, frame(time));
        const calm = grainAt(field, i, still(time));
        if (hx < -0.5 - 0.15) expect(g.x).toBe(calm.x); // well upwind: the wind never reaches it
        if (g.x - calm.x > 0.05) moved++;
      }
    }
    expect(moved).toBeGreaterThan(0);
  });

  it("throws the sand out from a click, then lets it settle", () => {
    // A click at time 1, on the grain nearest to the middle of the ink
    const i = [...Array(field.count).keys()].reduce((best, j) => (Math.hypot(home(j)[0] + 0.5, home(j)[1]) < Math.hypot(home(best)[0] + 0.5, home(best)[1]) ? j : best));
    const kicks = new Float32Array(KICKS * 4);
    kicks.set([-0.5, 0, 1, 0.3]);
    // How far the click has taken it from where it would be without one
    const off = (time: number) => {
      const g = grainAt(field, i, still(time, { kicks }));
      const calm = grainAt(field, i, still(time));
      return Math.hypot(g.x - calm.x, g.y - calm.y);
    };
    expect(off(0.9)).toBe(0); // nothing before the click
    expect(off(1.5)).toBeGreaterThan(0.05); // thrown
    expect(off(6.5)).toBeLessThan(0.003); // settled
  });
});

describe("the pointer's wake", () => {
  const field = buildField(mask, W, H, 300);

  it("gives way softly and has let go before its mark is reused", () => {
    expect(brushWeight(0)).toBe(0);
    expect(brushWeight(0.12)).toBeCloseTo(1, 1);
    expect(brushWeight(0.05)).toBeLessThan(brushWeight(0.12));
    expect(brushWeight(0.5)).toBeLessThan(brushWeight(0.2));
    expect(brushWeight(BRUSH_LIFE)).toBe(0);
    // Marks are reused after BRUSHES x BRUSH_EVERY seconds
    expect(BRUSH_LIFE).toBeLessThanOrEqual(BRUSHES * 0.03);
  });

  it("carries the sand along and parts it to both sides of the path", () => {
    // The pointer went right along y = 0 through the middle of the ink
    const brush = new Float32Array(BRUSHES * 4);
    brush.set([-0.5, 0, 0.05, 0]);
    const moved = (i: number) => {
      const a = grainAt(field, i, still(3, { brush }));
      const b = grainAt(field, i, still(3));
      return [a.x - b.x, a.y - b.y];
    };
    for (let i = 0; i < field.count; i++) {
      const o = i * FLOATS_PER_GRAIN;
      const [hx, hy] = [field.data[o], field.data[o + 1]];
      if (Math.hypot(hx + 0.5, hy) > 0.12 || Math.abs(hy) < 0.02) continue;
      const [dx, dy] = moved(i);
      expect(dx).toBeGreaterThan(0); // along
      expect(Math.sign(dy)).toBe(Math.sign(hy)); // away from the path
    }
  });
});

describe("driftShare", () => {
  it("reads the part of the logo past the line", () => {
    expect(driftShare([0, 0, 1, 0])).toBe(50);
    expect(driftShare([0.6, 0, 1, 0])).toBe(20);
  });
});
