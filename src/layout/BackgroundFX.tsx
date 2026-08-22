import { useEffect, useRef } from "react";

// BackgroundFX — self-contained interactive particle canvas. Golden particles
// drift slowly, repulse from the cursor, reconnect with thin lines, and ease
// back to their drifting anchor when the pointer leaves. Zero dependencies;
// all lifecycle lives in one effect so React StrictMode double-mounts stay
// clean (the cleanup fully tears down the RAF loop and every listener).

const PARTICLE_COUNT = 110;
const REPULSE_RADIUS = 110;
const REPULSE_FORCE = 5;
const RETURN_LERP = 0.06;
const LINE_DIST = 130;
const SAFFRON = "212, 175, 55"; // --saffron, golden — used over the paper canvas
const PAPER = "244, 236, 216";  // --paper, cream — used when a particle is currently within a registered dark region (the footer)

// Dark regions act as a "color filter" — when a particle's viewport
// position falls inside one, the canvas draws it (and any link touching
// it) in cream instead of saffron. The simulation itself is unchanged, so
// the particle keeps the same trajectory, repulses the cursor, and reads
// as a single continuous constellation that simply changes color in that
// band rather than a separate set.
let darkRegion: HTMLElement | null = null;
export function registerDarkRegion(el: HTMLElement | null): void {
  darkRegion = el;
}

type Particle = {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
};

const particleState: { particles: Particle[]; width: number; height: number } = {
  particles: [],
  width: 0,
  height: 0,
};

export function BackgroundFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Honor reduced-motion: leave the canvas blank, wire up nothing.
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let dpr = 1;
    let zoom = 1;
    let raf = 0;
    const mouse = { x: 0, y: 0, active: false };

    // Dark-region backdrop. A body-level fixed div at z-index -1 painted
    // forest, synced each frame to the registered region's viewport rect.
    // The canvas (z-index 0) paints particles ON TOP of this backdrop, so
    // they remain visible over the dark band — and below .app-shell
    // content (z-index 1), so cards still occlude the particles.
    const backdrop = document.createElement("div");
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.style.cssText =
      "position:fixed;left:0;right:0;background:var(--forest);" +
      "z-index:-1;pointer-events:none;display:none;";
    document.body.appendChild(backdrop);

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    const buildParticles = () => {
      const { width, height } = particleState;
      const arr: Particle[] = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        arr.push({
          x,
          y,
          baseX: x,
          baseY: y,
          vx: rand(-0.18, 0.18),
          vy: rand(-0.18, 0.18),
          size: rand(1.1, 2.4),
          opacity: rand(0.15, 0.45),
        });
      }
      particleState.particles = arr;
    };

    const resize = () => {
      particleState.width = window.innerWidth;
      particleState.height = window.innerHeight;
      dpr = window.devicePixelRatio || 1;
      zoom = parseFloat(getComputedStyle(document.body).getPropertyValue("zoom")) || 1;
      canvas.width = Math.floor(particleState.width * dpr);
      canvas.height = Math.floor(particleState.height * dpr);
      canvas.style.width = `${particleState.width}px`;
      canvas.style.height = `${particleState.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildParticles();
    };

    const onMouseMove = (e: MouseEvent) => {
      // Map the pointer into the canvas drawing space. Using the live
      // bounding rect (instead of raw clientX/Y) keeps tracking correct
      // under CSS `zoom`/scaling, where the canvas box no longer equals
      // the unscaled width/height the particles are drawn in.
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * particleState.width;
      mouse.y = ((e.clientY - rect.top) / rect.height) * particleState.height;
      mouse.active = true;
    };

    const onMouseLeave = () => {
      mouse.active = false;
    };

    const wrap = (v: number, max: number) => {
      if (v < 0) return v + max;
      if (v > max) return v - max;
      return v;
    };

    const inRegion = (x: number, y: number, r: DOMRect | null): boolean =>
      !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

    const frame = () => {
      const w = particleState.width;
      const h = particleState.height;
      const particles = particleState.particles;
      ctx.clearRect(0, 0, w, h);

      // Snapshot the registered dark region's rect once per frame — it
      // changes as the user scrolls and the footer enters/leaves view.
      const dark = darkRegion ? darkRegion.getBoundingClientRect() : null;

      if (dark) {
        backdrop.style.top = `${dark.top / zoom}px`;
        backdrop.style.height = `${dark.height / zoom}px`;
        backdrop.style.display = "block";
      } else {
        backdrop.style.display = "none";
      }

      for (const p of particles) {
        // Drift the anchor; wrap it so particles never run out of the page.
        p.baseX = wrap(p.baseX + p.vx, w);
        p.baseY = wrap(p.baseY + p.vy, h);

        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);

        if (mouse.active && dist < REPULSE_RADIUS && dist > 0) {
          const f = (REPULSE_RADIUS - dist) / REPULSE_RADIUS;
          p.x += (dx / dist) * f * REPULSE_FORCE;
          p.y += (dy / dist) * f * REPULSE_FORCE;
        } else {
          p.x += (p.baseX - p.x) * RETURN_LERP;
          p.y += (p.baseY - p.y) * RETURN_LERP;
        }

        const col = inRegion(p.x, p.y, dark) ? PAPER : SAFFRON;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col}, ${p.opacity})`;
        ctx.fill();
      }

      // Thin links between nearby particles; alpha fades to 0 at the threshold.
      const n = particles.length;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINE_DIST) {
            const alpha = 1 - dist / LINE_DIST;
            const aIn = inRegion(a.x, a.y, dark);
            const bIn = inRegion(b.x, b.y, dark);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            if (aIn !== bIn) {
              // Line straddles the seam — gradient between the two colors
              // so the transition is smooth.
              const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
              grad.addColorStop(0, `rgba(${aIn ? PAPER : SAFFRON}, ${alpha * 0.40})`);
              grad.addColorStop(1, `rgba(${bIn ? PAPER : SAFFRON}, ${alpha * 0.40})`);
              ctx.strokeStyle = grad;
            } else {
              ctx.strokeStyle = `rgba(${aIn ? PAPER : SAFFRON}, ${alpha * 0.40})`;
            }
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      raf = window.requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);
    raf = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      backdrop.remove();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        // Sits between the body's atmosphere/backdrop layer (z-index: -1)
        // and the .app-shell content layer (z-index: 1). Particles paint
        // over the body bg and the dark-region backdrop, but stay BELOW
        // any in-flow card or text in .app-shell — so cards occlude
        // particles. Pointer-events: none keeps clicks passing through.
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
