import { useEffect, useRef, useState } from "react";

// NotFoundHero — the 404 page's graph-paper panel:
//   · "404" drawn in dots that keep reaching for the digits and never
//     settle (each dot's target wanders on a small breathing circle), and
//     that flee the cursor;
//   · an "unsolved path" from point A that walks the grid and leaves the
//     frame, drawn once.
// Same lifecycle pattern as layout/BackgroundFX: one effect owns the
// animation loop and every listener, and tears them all down.

const NARROW = 600; // below this panel width: denser, bigger digits, finer dots
const SPRING = 0.035;
const DAMPING = 0.86;
const REPULSE_RADIUS = 90;
const REPULSE_FORCE = 2.4;
const FOREST = "18, 32, 25";
const SAFFRON = "246, 168, 6";
const GRID = 16; // the graph paper's fine grid (see .graph-paper)

interface Dot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number; // point of the digits it reaches for
  ty: number;
  orbit: number; // radius of its target's wander
  phase: number;
  speed: number;
  size: number;
  saffron: boolean;
}

export function NotFoundHero() {
  const panelRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(panelRef);
  return (
    <div
      ref={panelRef}
      className="graph-paper relative overflow-hidden h-[240px] sm:h-[340px]"
      style={{ border: "2px solid var(--forest)", boxShadow: "2px 2px 0 0 var(--forest)" }}
    >
      <DotCanvas />
      {size && <UnsolvedPath width={size.width} height={size.height} />}
    </div>
  );
}

// ─── The dots ─────────────────────────────────────────────────────────

function DotCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let onScreen = true;
    let cancelled = false;
    const mouse = { x: 0, y: 0, active: false };

    // Where the digits are: "404" in Montserrat 900 on an offscreen canvas,
    // sampled every STEP px.
    const digitPoints = (w: number, h: number): [number, number][] => {
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const o = off.getContext("2d");
      if (!o) return [];
      const narrow = w < NARROW;
      const STEP = narrow ? 5 : 8; // sampling step, in CSS px
      const fontSize = Math.min(h * 0.78, w * (narrow ? 0.4 : 0.34));
      o.font = `900 ${fontSize}px Montserrat, sans-serif`;
      o.textAlign = "center";
      o.textBaseline = "middle";
      o.fillText("404", w / 2, h / 2 + fontSize * 0.04);
      const pixels = o.getImageData(0, 0, w, h).data;
      const points: [number, number][] = [];
      for (let y = STEP / 2; y < h; y += STEP) {
        for (let x = STEP / 2; x < w; x += STEP) {
          if (pixels[(Math.floor(y) * w + Math.floor(x)) * 4 + 3] > 128) points.push([x, y]);
        }
      }
      return points;
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const [saffron, color] of [[false, `rgba(${FOREST}, 0.82)`], [true, `rgba(${SAFFRON}, 0.95)`]] as const) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (const d of dots) {
          if (d.saffron !== saffron) continue;
          ctx.moveTo(d.x + d.size, d.y);
          ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    };

    // Sizes the canvas (sharp under the page zoom: its rect is the zoomed
    // size) and re-targets the dots on the new digits.
    const layout = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (!width || !height) return;
      const zoom = canvas.getBoundingClientRect().width / width || 1;
      const scale = (window.devicePixelRatio || 1) * zoom;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      dots = digitPoints(Math.round(width), Math.round(height)).map(([tx, ty], i) => {
        const prev = dots[i];
        return {
          x: reduce ? tx : prev?.x ?? Math.random() * width,
          y: reduce ? ty : prev?.y ?? Math.random() * height,
          vx: 0,
          vy: 0,
          tx,
          ty,
          orbit: 1.5 + Math.random() * 2.5,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 0.9,
          size: width < NARROW ? 1 + Math.random() * 0.8 : 1.5 + Math.random() * 1.1,
          saffron: Math.random() < 0.1,
        };
      });
      draw();
    };

    const tick = (now: number) => {
      const t = now / 1000;
      for (const d of dots) {
        // The target itself never stands still, so neither does the dot
        const breathe = d.orbit * (0.6 + 0.4 * Math.sin(t * 0.35 + d.phase));
        const ax = d.tx + Math.cos(t * d.speed + d.phase) * breathe;
        const ay = d.ty + Math.sin(t * d.speed * 1.3 + d.phase) * breathe;
        d.vx += (ax - d.x) * SPRING;
        d.vy += (ay - d.y) * SPRING;
        if (mouse.active) {
          const dx = d.x - mouse.x;
          const dy = d.y - mouse.y;
          const dist = Math.hypot(dx, dy);
          if (dist < REPULSE_RADIUS && dist > 0.1) {
            const push = (1 - dist / REPULSE_RADIUS) * REPULSE_FORCE;
            d.vx += (dx / dist) * push;
            d.vy += (dy / dist) * push;
          }
        }
        d.vx *= DAMPING;
        d.vy *= DAMPING;
        d.x += d.vx;
        d.y += d.vy;
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!reduce && onScreen && !raf && !cancelled) raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    // Pointer in canvas coordinates — proportional to the rect, so the
    // page zoom needs no special case.
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * width;
      mouse.y = ((e.clientY - rect.top) / rect.height) * height;
      mouse.active = true;
    };
    const onLeave = () => {
      mouse.active = false;
    };
    if (!reduce) {
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerleave", onLeave);
    }

    const resize = new ResizeObserver(() => layout());
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });

    // The digits need the real font before they're sampled
    document.fonts
      .load("900 100px Montserrat")
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        layout();
        resize.observe(canvas);
        visibility.observe(canvas);
        start();
      });

    return () => {
      cancelled = true;
      stop();
      resize.disconnect();
      visibility.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="absolute inset-0 w-full h-full" style={{ touchAction: "pan-y" }} />;
}

// ─── The unsolved path ────────────────────────────────────────────────

// Grid walk from A (near the origin of the axes) under the digits, up the
// right side and out of the frame. Waypoints are fractions of the panel,
// snapped to the grid so the path runs along its lines. On a narrow panel
// the digits are wider, so the path climbs past them further right.
const WAYPOINTS: [number, number][] = [
  [0.06, 0.86], [0.2, 0.86], [0.2, 0.95], [0.52, 0.95], [0.52, 0.86],
  [0.84, 0.86], [0.84, 0.56], [0.93, 0.56], [0.93, 0.22], [1.2, 0.22],
];
const NARROW_WAYPOINTS: [number, number][] = [
  [0.1, 0.86], [0.28, 0.86], [0.28, 0.95], [0.62, 0.95], [0.62, 0.86],
  [0.96, 0.86], [0.96, 0.2], [1.2, 0.2],
];

function UnsolvedPath({ width, height }: { width: number; height: number }) {
  const snap = (v: number) => Math.round(v / GRID) * GRID;
  const points = (width < NARROW ? NARROW_WAYPOINTS : WAYPOINTS).map(([fx, fy]) => [fx > 1 ? width * fx : snap(width * fx), snap(height * fy)] as const);
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const [ax, ay] = points[0];
  const exitY = points[points.length - 1][1];
  const origin = { x: GRID * 2, y: height - GRID * 2 };

  return (
    <svg aria-hidden className="absolute inset-0 pointer-events-none" width={width} height={height}>
      {/* Faint axes, arrow tips drawn as lines */}
      <g stroke={`rgba(${FOREST}, 0.28)`} strokeWidth={1.5} fill="none" strokeLinecap="round">
        <line x1={origin.x} y1={origin.y} x2={width - GRID} y2={origin.y} />
        <polyline points={`${width - GRID - 6},${origin.y - 4} ${width - GRID},${origin.y} ${width - GRID - 6},${origin.y + 4}`} />
        <line x1={origin.x} y1={origin.y} x2={origin.x} y2={GRID} />
        <polyline points={`${origin.x - 4},${GRID + 6} ${origin.x},${GRID} ${origin.x + 4},${GRID + 6}`} />
      </g>
      <defs>
        <mask id="nf-path-reveal" maskUnits="userSpaceOnUse" x={0} y={0} width={width * 1.3} height={height}>
          <path d={d} pathLength={1} className="nf-path-reveal" stroke="white" strokeWidth={10} fill="none" strokeLinejoin="round" />
        </mask>
      </defs>
      <path
        d={d}
        mask="url(#nf-path-reveal)"
        stroke="var(--saffron-dark)"
        strokeWidth={2.5}
        strokeDasharray="7 6"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx={ax} cy={ay} r={5} fill="var(--forest)" />
      <text x={ax - 4} y={ay - 12} className="font-mont" fontSize={13} fontWeight={900} fill="var(--forest)">A</text>
      <text x={width - GRID * 2.2} y={exitY - 12} className="nf-path-exit font-mont" fontSize={20} fontWeight={900} fill="var(--saffron-dark)">?</text>
    </svg>
  );
}

function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
