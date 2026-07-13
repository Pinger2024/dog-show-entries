'use client';

import { useEffect, useRef, useState } from 'react';

const COLORS = ['#5bb579', '#e6a53a', '#f3ecdc', '#2f6b43'];
const PARTICLE_COUNT = 80;
const DURATION_MS = 1200;
const GRAVITY = 0.14;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
}

/**
 * One-shot confetti burst for the entry-confirmation "delight moment"
 * (POLISH.md #8) — fires once on mount, runs ~1.2s, then unmounts itself.
 * A fixed, pointer-events-none full-viewport canvas overlay so it never
 * blocks taps. Skips entirely under `prefers-reduced-motion: reduce` (the
 * confirmation disc's own CSS spring-in degrades to a plain fade for that
 * case — this component intentionally renders nothing on top of it).
 */
export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setActive(false);
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const originX = width / 2;
    const originY = height * 0.28;
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      return {
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        size: 4 + Math.random() * 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
      };
    });

    const start = performance.now();
    let raf = 0;

    function tick(now: number) {
      const t = Math.min((now - start) / DURATION_MS, 1);
      ctx!.clearRect(0, 0, width, height);
      const fade = 1 - t;
      for (const p of particles) {
        p.vy += GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        ctx!.save();
        ctx!.globalAlpha = fade;
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rotation);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx!.restore();
      }
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setActive(false);
      }
    }
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, []);

  if (!active) return null;

  return (
    // `fixed inset-0` alone sizes this to the viewport (no explicit
    // width/height needed) — 100vw/100vh would include scrollbar width and
    // trigger horizontal overflow on mobile.
    <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70]" />
  );
}
