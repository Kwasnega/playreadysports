import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Lightweight Three.js particle field for the hero background.
 * - ~120 points, additive blending, soft cursor parallax
 * - Pauses when offscreen (IntersectionObserver) and on tab blur
 * - DPR clamped to 1.5 for perf
 */
export const ParticleField = ({ className = "" }: { className?: string }) => {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const w = () => wrap.clientWidth;
    const h = () => wrap.clientHeight;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(w(), h(), false);
    renderer.setClearColor(0x000000, 0);
    wrap.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, w() / h(), 0.1, 100);
    camera.position.z = 6;

    // Particles
    const COUNT = 140;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Read brand cyan from CSS so it auto-themes.
    const cssCyan = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    // CSS var format: "187 100% 50%" → "hsl(187, 100%, 50%)"
    const color = new THREE.Color(`hsl(${cssCyan.split(/\s+/).join(", ")})`);

    const mat = new THREE.PointsMaterial({
      color,
      size: 0.06,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // Mouse parallax
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 0.8;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * -0.5;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const onResize = () => {
      camera.aspect = w() / h();
      camera.updateProjectionMatrix();
      renderer.setSize(w(), h(), false);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(wrap);

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.01 });
    io.observe(wrap);

    let raf = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      current.x += (target.x - current.x) * 0.04;
      current.y += (target.y - current.y) * 0.04;
      points.rotation.y = current.x * 0.6 + (reduce ? 0 : t * 0.00004);
      points.rotation.x = current.y * 0.6;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={wrapRef} className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden />;
};