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
const COLOR = "212, 175, 55"; // --saffron, golden

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

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let raf = 0;
    const mouse = { x: 0, y: 0, active: false };

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    const buildParticles = () => {
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        particles.push({
          x,
          y,
          baseX: x,
          baseY: y,
          vx: rand(-0.18, 0.18),
          vy: rand(-0.18, 0.18),
          size: rand(1.1, 2.4),
          opacity: rand(0.35, 0.95),
        });
      }
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildParticles();
    };

    const onMouseMove = (e: MouseEvent) => {
      // Map the pointer into the canvas drawing space. Using the live
      // bounding rect (instead of raw clientX/Y) keeps tracking correct
      // under CSS `zoom`/scaling, where the canvas box no longer equals
      // the unscaled width/height the particles are drawn in.
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * width;
      mouse.y = ((e.clientY - rect.top) / rect.height) * height;
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

    const frame = () => {
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        // Drift the anchor; wrap it so particles never run out of the page.
        p.baseX = wrap(p.baseX + p.vx, width);
        p.baseY = wrap(p.baseY + p.vy, height);

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

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${COLOR}, ${p.opacity})`;
        ctx.fill();
      }

      // Thin links between nearby particles; alpha fades to 0 at the threshold.
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINE_DIST) {
            const alpha = 1 - dist / LINE_DIST;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(${COLOR}, ${alpha * 0.75})`;
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
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        // Sits in the same atmosphere band as body::before (z-index: -1 in
        // index.css) so it renders behind all app content. #root/.app-shell
        // are z-index: 1, which keeps text and cards above this canvas.
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
      }}
    />
  );
}
