import { useEffect, useRef, type CSSProperties } from "react";
import AppLogo from "@/assets/MTYM2.svg";
import { BrutalCard } from "./primitives";
import { BRUSHES, BRUSH_EVERY, FLOATS_PER_GRAIN, KICKS, brushWeight, buildField, driftAt, driftShare, grainAt, pickTrackers, type SandField, type SandFrame } from "./sand/sandField";
import { FRAGMENT, VERTEX } from "./sand/sandShaders";

// Inspired by Gather, by DAO (https://gather.be-of-dao.com): pictures turned
// into sand that blows away past a line and gathers into the next one, with
// trackers, hairlines and a ruler drawn over it. Written from scratch for
// the MTYM logo and colours; none of Gather's code is used.
//
// SandLogo: the login page's stage. The MTYM logo in saffron sand on the
// forest: the dust gathers into the letters, which then breathe and sway
// while the right of the logo keeps blowing away past a slowly wandering
// line and forming again. The pointer's wake parts the sand; a click (a
// tap) throws it out in a swirl, and it settles back. Over it, hairlines join a few grains that the trackers
// ride, and a ruler runs round the frame with the drift line's place on it.
//
// The grains are GPU points (WebGL2, sand/sandShaders.ts): the page does no
// work per grain. The trackers and the ruler are a 2D canvas on top. Without
// WebGL2 the plain logo shows instead; with reduced motion the sand is drawn
// once, at rest. Same lifecycle as layout/BackgroundFX: one effect owns the
// loop and every listener, and tears them all down.

const PAPER = "250, 247, 238"; // --paper: the marks and the readouts
const GRAINS_PER_PX = 0.95; // grains per CSS px² of the logo's box (about one and a half per inked px²)
const MIN_GRAINS = 6000;
const MAX_GRAINS = 90000;
const GRAIN_SIZE = 1.45; // CSS px, before each grain's own size
const TRACKERS = 16;
const TRACKER_GAP = 0.17; // logo units between two trackers, at least
const LINK = 0.38; // trackers closer than this (logo units) are joined
const KICK = 0.18;
const BRUSH_PUSH = 0.01; // how far the wake carries the sand, per unit of the pointer's speed
const MAX_SPEED = 6; // logo units per second: a flick pushes no harder than this

interface Layout {
  width: number;
  height: number;
  dpr: number;
  scale: number; // CSS px per logo unit
  cx: number;
  cy: number;
  inset: number; // the ruler's distance from the edge
}

export function SandLogo({ className = "" }: { className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLImageElement>(null);
  const driftRef = useRef<HTMLSpanElement>(null);
  const grainsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = glRef.current;
    const overlay = overlayRef.current;
    const octx = overlay?.getContext("2d");
    if (!stage || !canvas || !overlay || !octx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const showFallback = () => {
      if (fallbackRef.current) fallbackRef.current.style.opacity = "1";
      canvas.style.display = "none";
      if (grainsRef.current) grainsRef.current.textContent = "";
    };
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    const program = gl && makeProgram(gl);
    if (!gl || !program) {
      showFallback();
      return;
    }

    let cancelled = false;
    let raf = 0;
    let onScreen = true;
    let field: SandField | null = null;
    let trackers: number[] = [];
    let vao: WebGLVertexArrayObject | null = null;
    let buffer: WebGLBuffer | null = null;
    let layout: Layout | null = null;
    let ruler: { minor: Path2D; major: Path2D; corners: Path2D } | null = null;
    let shownDrift = "";
    let introStart = 0;

    const start0 = performance.now() / 1000;
    const clock = () => performance.now() / 1000 - start0;
    const kicks = new Float32Array(KICKS * 4);
    let nextKick = 0;
    // The pointer's wake: where it passed, how fast, and when
    const stamps = Array.from({ length: BRUSHES }, () => ({ x: 0, y: 0, vx: 0, vy: 0, t: -99 }));
    let nextStamp = 0;
    let lastMove: { x: number; y: number; t: number } | null = null;
    const brush = new Float32Array(BRUSHES * 4);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uniforms = {
      res: u("uRes"), center: u("uCenter"), scale: u("uScale"), dpr: u("uDpr"), size: u("uSize"),
      time: u("uTime"), intro: u("uIntro"), drift: u("uDrift"), line: u("uLine"), wind: u("uWind"),
      extent: u("uExtent"), kick: u("uKick"), brush: u("uBrush"),
    };

    // Sizes both canvases (sharp on high-density screens) and places the logo:
    // a little left of centre, so the dust has room to blow to the right
    const measure = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (!width || !height || !field) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [canvas, overlay]) {
        c.width = Math.round(width * dpr);
        c.height = Math.round(height * dpr);
      }
      const scale = logoScale(width, height, field.aspect);
      layout = { width, height, dpr, scale, cx: width * 0.46, cy: height * 0.5, inset: width < 480 ? 10 : 16 };
      ruler = buildRuler(layout);
    };

    // Everything that moves, at this instant
    const frameAt = (time: number): SandFrame => {
      const intro = reduce ? 99 : time - introStart;
      const { line, wind } = driftAt(time);
      for (let b = 0; b < BRUSHES; b++) {
        const s = stamps[b];
        const w = brushWeight(time - s.t) * BRUSH_PUSH;
        brush.set([s.x, s.y, s.vx * w, s.vy * w], b * 4);
      }
      const l = layout;
      return {
        time,
        intro,
        drift: reduce ? 0 : smooth(2.2, 4.5, intro),
        line,
        wind,
        extent: l ? [l.width / 2 / l.scale, l.height / 2 / l.scale] : [1.5, 0.8],
        kicks,
        brush,
      };
    };

    const draw = () => {
      if (!field || !layout || !vao) return;
      const f = frameAt(clock());
      const { width, height, dpr, scale, cx, cy } = layout;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(uniforms.res, width, height);
      gl.uniform2f(uniforms.center, cx, cy);
      gl.uniform1f(uniforms.scale, scale);
      gl.uniform1f(uniforms.dpr, dpr);
      gl.uniform1f(uniforms.size, GRAIN_SIZE);
      gl.uniform1f(uniforms.time, f.time);
      gl.uniform1f(uniforms.intro, f.intro);
      gl.uniform1f(uniforms.drift, f.drift);
      gl.uniform4f(uniforms.line, ...f.line);
      gl.uniform2f(uniforms.wind, ...f.wind);
      gl.uniform2f(uniforms.extent, ...f.extent);
      gl.uniform4fv(uniforms.kick, f.kicks);
      gl.uniform4fv(uniforms.brush, f.brush);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.POINTS, 0, field.count);
      drawOverlay(f);

      // The readout comes with the wind (never, with reduced motion)
      const drift = f.drift > 0 ? `Dérive ${driftShare(f.line)}` : "";
      if (drift !== shownDrift && driftRef.current) driftRef.current.textContent = shownDrift = drift;
    };

    // The ruler, then the hairlines between trackers, then the trackers
    const drawOverlay = (f: SandFrame) => {
      const sand = field;
      if (!layout || !ruler || !sand) return;
      const { width, height, dpr, scale, cx, cy, inset } = layout;
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, width, height);
      octx.lineWidth = 1;
      octx.strokeStyle = `rgba(${PAPER}, 0.16)`;
      octx.stroke(ruler.minor);
      octx.strokeStyle = `rgba(${PAPER}, 0.3)`;
      octx.stroke(ruler.major);
      octx.strokeStyle = `rgba(${PAPER}, 0.45)`;
      octx.stroke(ruler.corners);

      // Where the drift line crosses the top and bottom rulers
      if (f.drift > 0) {
        const [lx, ly, nx, ny] = f.line;
        const xAt = (py: number) => cx + (lx - (-(py - cy) / scale - ly) * (ny / nx)) * scale;
        octx.strokeStyle = `rgba(${PAPER}, ${0.7 * f.drift})`;
        octx.lineWidth = 1.5;
        octx.beginPath();
        octx.moveTo(xAt(inset), inset);
        octx.lineTo(xAt(inset + 12), inset + 12);
        octx.moveTo(xAt(height - inset), height - inset);
        octx.lineTo(xAt(height - inset - 12), height - inset - 12);
        octx.stroke();
      }

      const at = trackers.map((i) => {
        const g = grainAt(sand, i, f);
        return { x: cx + g.x * scale, y: cy - g.y * scale, lx: g.x, ly: g.y, alpha: g.alpha };
      });
      octx.lineWidth = 1;
      for (let a = 0; a < at.length; a++) {
        for (let b = a + 1; b < at.length; b++) {
          const d = Math.hypot(at[a].lx - at[b].lx, at[a].ly - at[b].ly);
          if (d >= LINK) continue;
          const alpha = (1 - d / LINK) * Math.min(at[a].alpha, at[b].alpha) * 0.85;
          if (alpha < 0.02) continue;
          octx.strokeStyle = `rgba(${PAPER}, ${alpha})`;
          octx.beginPath();
          octx.moveTo(at[a].x, at[a].y);
          octx.lineTo(at[b].x, at[b].y);
          octx.stroke();
        }
      }
      for (const p of at) {
        if (p.alpha < 0.02) continue;
        octx.fillStyle = `rgba(${PAPER}, ${0.9 * p.alpha})`;
        octx.beginPath();
        octx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        octx.fill();
      }
    };

    const tick = () => {
      draw();
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!reduce && onScreen && !raf && !cancelled && field) raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    // Pointer, in logo units
    const toLogo = (e: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      if (!layout || !rect.width) return null;
      return {
        x: ((e.clientX - rect.left) / rect.width * layout.width - layout.cx) / layout.scale,
        y: -((e.clientY - rect.top) / rect.height * layout.height - layout.cy) / layout.scale,
      };
    };
    // A mark of the wake every BRUSH_EVERY seconds, with the speed the
    // pointer had since the last one. A mark never moves once left: the sand
    // under it is pushed by its own mark only, and settles back on its own.
    const onMove = (e: PointerEvent) => {
      const p = toLogo(e);
      if (!p) return;
      const t = clock();
      if (!lastMove || t - lastMove.t > 0.2) {
        lastMove = { ...p, t }; // the pointer comes back: no speed yet
        return;
      }
      const dt = t - lastMove.t;
      if (dt < BRUSH_EVERY) return;
      let vx = (p.x - lastMove.x) / dt;
      let vy = (p.y - lastMove.y) / dt;
      const speed = Math.hypot(vx, vy);
      if (speed > MAX_SPEED) [vx, vy] = [(vx / speed) * MAX_SPEED, (vy / speed) * MAX_SPEED];
      Object.assign(stamps[nextStamp], { x: p.x, y: p.y, vx, vy, t });
      nextStamp = (nextStamp + 1) % BRUSHES;
      lastMove = { ...p, t };
    };
    const onDown = (e: PointerEvent) => {
      const p = toLogo(e);
      if (!p || (e.pointerType === "mouse" && e.button !== 0)) return;
      kicks.set([p.x, p.y, clock(), KICK], nextKick * 4);
      nextKick = (nextKick + 1) % KICKS;
    };
    const onLeave = () => {
      lastMove = null;
    };
    if (!reduce) {
      stage.addEventListener("pointermove", onMove);
      stage.addEventListener("pointerdown", onDown);
      stage.addEventListener("pointerleave", onLeave);
    }

    // Resizing clears the canvases: draw again at once, not at the next frame
    const resize = new ResizeObserver(() => {
      measure();
      draw();
    });
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    const onLost = (e: Event) => {
      e.preventDefault();
      stop();
      cancelled = true;
      showFallback();
    };
    canvas.addEventListener("webglcontextlost", onLost);

    // The logo's ink, then the grains on it. The count follows the size the
    // logo is drawn at, so the sand is as fine on a phone as on a desktop.
    logoMask()
      .then((mask) => {
        if (cancelled || !mask) {
          if (!mask) showFallback();
          return;
        }
        const aspect = mask.height / mask.width;
        const scale = logoScale(stage.clientWidth, stage.clientHeight, aspect);
        const box = 4 * scale * scale * aspect;
        const count = Math.round(Math.min(MAX_GRAINS, Math.max(MIN_GRAINS, box * GRAINS_PER_PX)));
        field = buildField(mask.alpha, mask.width, mask.height, count);
        trackers = pickTrackers(field, TRACKERS, TRACKER_GAP);

        vao = gl.createVertexArray();
        buffer = gl.createBuffer();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, field.data, gl.STATIC_DRAW);
        const stride = FLOATS_PER_GRAIN * 4;
        for (const [name, size, offset] of [["aHome", 2, 0], ["aSeed", 4, 2], ["aStart", 2, 6], ["aTone", 1, 8]] as const) {
          const loc = gl.getAttribLocation(program, name);
          if (loc < 0) continue;
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        if (grainsRef.current) grainsRef.current.textContent = `${groupThousands(field.count)} grains`;
        introStart = clock();
        measure();
        draw();
        resize.observe(stage);
        visibility.observe(stage);
        start();
      })
      .catch(() => {
        if (!cancelled) showFallback();
      });

    return () => {
      cancelled = true;
      stop();
      resize.disconnect();
      visibility.disconnect();
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    };
  }, []);

  const readout: CSSProperties = {
    position: "absolute",
    fontFamily: "var(--font-display)",
    fontSize: "0.56rem",
    fontWeight: 600,
    letterSpacing: "0.32em",
    textTransform: "uppercase",
    fontVariantNumeric: "tabular-nums",
    color: `rgba(${PAPER}, 0.5)`,
    pointerEvents: "none",
    whiteSpace: "nowrap",
  };

  return (
    <BrutalCard dark className={className}>
      <div ref={stageRef} aria-hidden className="absolute inset-0 select-none" style={{ cursor: "crosshair", touchAction: "pan-y" }}>
        <img
          ref={fallbackRef}
          src={AppLogo}
          alt=""
          className="absolute pointer-events-none"
          style={{ left: "9%", width: "74%", top: "50%", transform: "translateY(-50%)", opacity: 0 }}
        />
        <canvas ref={glRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        <span ref={driftRef} style={{ ...readout, top: "1.75rem", right: "2rem" }} />
        <span ref={grainsRef} style={{ ...readout, bottom: "1.75rem", left: "2rem" }} />
      </div>
    </BrutalCard>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

// Half the logo's width in CSS px: three quarters of the stage across, and
// never more than about two fifths of it high
const logoScale = (width: number, height: number, aspect: number) => Math.min(width * 0.37, (height * 0.21) / aspect);

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// 52000 as "52 000", with a plain space
const groupThousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

function makeProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn("SandLogo:", gl.getShaderInfoLog(shader));
      return null;
    }
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("SandLogo:", gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

// The logo drawn offscreen and cropped to its ink: one alpha byte per pixel
async function logoMask(): Promise<{ alpha: Uint8ClampedArray; width: number; height: number } | null> {
  const img = new Image();
  img.src = AppLogo;
  await img.decode();
  const W = 1200;
  const H = 500; // the SVG's own 2400 x 1000
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const ctx = off.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, W, H);
  const pixels = ctx.getImageData(0, 0, W, H).data;
  let [x0, y0, x1, y1] = [W, H, -1, -1];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (pixels[(y * W + x) * 4 + 3] < 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0) return null;
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) alpha[y * width + x] = pixels[((y + y0) * W + x + x0) * 4 + 3];
  }
  return { alpha, width, height };
}

// The ruler round the frame: a tick every 12 px, a longer one every fifth,
// each a little uneven, and a cross at each corner
function buildRuler({ width, height, inset: m }: Layout) {
  const minor = new Path2D();
  const major = new Path2D();
  const corners = new Path2D();
  const STEP = 12;
  const wobble = (i: number) => Math.sin(i * 12.9898) * 1.5;
  const snap = (v: number) => Math.round(v) + 0.5;
  let i = 0;
  const side = (from: [number, number], to: [number, number], inward: [number, number]) => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const [ux, uy] = [(to[0] - from[0]) / len, (to[1] - from[1]) / len];
    for (let s = STEP * 2, k = 0; s <= len - STEP * 2; s += STEP, k++, i++) {
      const isMajor = k % 5 === 0;
      const tick = (isMajor ? 9 : 4) + wobble(i);
      const [x, y] = [snap(from[0] + ux * s), snap(from[1] + uy * s)];
      const path = isMajor ? major : minor;
      path.moveTo(x, y);
      path.lineTo(x + inward[0] * tick, y + inward[1] * tick);
    }
  };
  side([m, m], [width - m, m], [0, 1]);
  side([m, height - m], [width - m, height - m], [0, -1]);
  side([m, m], [m, height - m], [1, 0]);
  side([width - m, m], [width - m, height - m], [-1, 0]);
  for (const [x, y] of [[m, m], [width - m, m], [m, height - m], [width - m, height - m]]) {
    corners.moveTo(snap(x) - 7, snap(y));
    corners.lineTo(snap(x) + 7, snap(y));
    corners.moveTo(snap(x), snap(y) - 7);
    corners.lineTo(snap(x), snap(y) + 7);
  }
  return { minor, major, corners };
}
