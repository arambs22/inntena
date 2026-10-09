import { useEffect, useRef } from "react";
import * as THREE from "three";
import { BASE_RADIUS, PILLARS, pillarPosition, type Pillar } from "../lib/pillarLayout";
import { createRandom } from "../lib/random";

/**
 * Brand red of the design reference. Constant on purpose: the scene lives on a panel that is
 * dark in both themes, so it must not pick up the darker light-theme `primary` token.
 */
const BRAND_RED = 0xf23843;
const OFF_WHITE = 0xfbeded;

const SPHERE_RADIUS = 0.55;
const SPHERE_Y = 6.6;
const ROTATION_SPEED = 0.1; // radians per second
const PULSE_PERIOD = 2.4; // seconds, matches the cadence of the wordmark's pulse dot
const MAX_FRAME_DELTA = 0.1; // seconds; clamps big gaps (tab switches) so motion never jumps
const STATIC_TIME = 2.4; // time at which the single frame is drawn under reduced motion

const FOV = 38;
const LOOK_AT_Y = 3.1;
const CAMERA_HEIGHT = 5.2;
const VISIBLE_HALF_WIDTH = BASE_RADIUS + 0.35;
const VISIBLE_HEIGHT = 8.8;

interface AuthSceneProps {
  /** Called once the first frame has been drawn, so the caller can retire its static fallback. */
  onReady?: () => void;
}

/** Soft radial dot used for the sphere's halo and for the stars: a bright core with a long, gentle falloff. */
function createGlowTexture(rgb: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `rgba(${rgb},1)`);
  gradient.addColorStop(0.18, `rgba(${rgb},0.65)`);
  gradient.addColorStop(0.5, `rgba(${rgb},0.16)`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A thin expanding ring, used for the sphere's ping that mirrors the wordmark's pulse dot. */
function createRingTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(242,56,67,0)");
  gradient.addColorStop(0.72, "rgba(242,56,67,0)");
  gradient.addColorStop(0.86, "rgba(242,56,67,0.9)");
  gradient.addColorStop(1, "rgba(242,56,67,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** One monolith: a box whose top face is slanted, with crisp edges drawn over the matte faces. */
function buildPillar(pillar: Pillar): THREE.Group {
  const geometry = new THREE.BoxGeometry(pillar.width, pillar.height, pillar.depth);
  geometry.translate(0, pillar.height / 2, 0);

  // Slant the cap: lift or lower the top vertices in proportion to their x position.
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    if (positions.getY(i) > pillar.height / 2) {
      positions.setY(i, positions.getY(i) + positions.getX(i) * pillar.capSlope);
    }
  }
  geometry.computeVertexNormals();

  const body = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xece0e0, roughness: 0.85, metalness: 0, flatShading: true })
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 15),
    new THREE.LineBasicMaterial({ color: OFF_WHITE, transparent: true, opacity: 0.9 })
  );

  const group = new THREE.Group();
  group.add(body, edges);
  const { x, z } = pillarPosition(pillar);
  group.position.set(x, 0, z);
  // Turn each footprint to face the center so the group reads as deliberately arranged.
  group.rotation.y = -(pillar.angle * Math.PI) / 180;
  return group;
}

/** The circular base: a dark slab with concentric rings and a ring of tick marks around its rim. */
function buildBase(): THREE.Group {
  const group = new THREE.Group();

  const slabGeometry = new THREE.CylinderGeometry(BASE_RADIUS, BASE_RADIUS + 0.12, 0.22, 128);
  slabGeometry.translate(0, -0.11, 0);
  group.add(
    new THREE.Mesh(slabGeometry, new THREE.MeshStandardMaterial({ color: 0x241d1c, roughness: 0.75, metalness: 0.25 }))
  );

  for (const radius of [BASE_RADIUS - 0.07, 2.35, 1.4]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.012, radius + 0.012, 192),
      new THREE.MeshBasicMaterial({ color: OFF_WHITE, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.003;
    group.add(ring);
  }

  const TICKS = 96;
  const points: number[] = [];
  for (let i = 0; i < TICKS; i++) {
    const angle = (i / TICKS) * Math.PI * 2;
    const long = i % 8 === 0;
    const outer = BASE_RADIUS - 0.14;
    const inner = outer - (long ? 0.22 : 0.1);
    points.push(Math.cos(angle) * inner, 0.004, Math.sin(angle) * inner, Math.cos(angle) * outer, 0.004, Math.sin(angle) * outer);
  }
  const tickGeometry = new THREE.BufferGeometry();
  tickGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.LineSegments(tickGeometry, new THREE.LineBasicMaterial({ color: OFF_WHITE, transparent: true, opacity: 0.55 })));

  return group;
}

/** A shell of stars spread across the whole field of view, behind everything else. */
function buildStars(
  count: number,
  size: number,
  seed: number,
  dot: THREE.Texture
): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const random = createRandom(seed);
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const direction = new THREE.Vector3((random() - 0.5) * 1.5, random() * 1.4 - 0.35, -1).normalize();
    const distance = 45 + random() * 25;
    positions.push(direction.x * distance, direction.y * distance, direction.z * distance);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: OFF_WHITE,
      size,
      map: dot,
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  );
}

/** Frees every GPU resource owned by the scene; React StrictMode mounts twice in development, so leaks would double. */
function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const renderable = object as THREE.Mesh;
    renderable.geometry?.dispose();
    const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
    for (const material of materials) {
      if (!material) continue;
      (material as THREE.MeshBasicMaterial).map?.dispose();
      material.dispose();
    }
  });
}

/**
 * The login panel's animated landscape: a group of monoliths slowly turning on a circular
 * base under a red sphere that pulses like the wordmark's dot, in a field of stars. Drawn
 * with plain three.js (no React renderer) to keep the dependency surface small and the
 * lifecycle explicit. Honors `prefers-reduced-motion` by drawing a single still frame, and
 * renders nothing at all if WebGL is unavailable, leaving the caller's static fallback visible.
 */
export default function AuthScene({ onReady }: AuthSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // No WebGL: the static fallback stays on screen.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x141110, 0.028);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);

    const glowTexture = createGlowTexture("242,56,67");
    const starTexture = createGlowTexture("255,255,255");
    const ringTexture = createRingTexture();

    // Everything that turns lives in one group; the sphere, its light and the camera do not.
    const turntable = new THREE.Group();
    turntable.add(buildBase());
    for (const pillar of PILLARS) turntable.add(buildPillar(pillar));
    scene.add(turntable);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(SPHERE_RADIUS, 48, 32),
      new THREE.MeshStandardMaterial({ color: 0x8a121c, emissive: BRAND_RED, emissiveIntensity: 0.85, roughness: 0.3, metalness: 0, fog: false })
    );
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true })
    );
    const ping = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: ringTexture, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true })
    );
    const sphereLight = new THREE.PointLight(BRAND_RED, 38, 16, 2);
    scene.add(sphere, glow, ping, sphereLight);

    const smallStars = buildStars(320, 0.55, 23, starTexture);
    const brightStars = buildStars(46, 1.05, 61, starTexture);
    scene.add(smallStars, brightStars);

    scene.add(new THREE.HemisphereLight(0x5a4a48, 0x0a0706, 0.22));
    // Low, raking light from the left: bright faces against deep shadow is what makes the monoliths monumental.
    const keyLight = new THREE.DirectionalLight(0xfff0e6, 3.4);
    keyLight.position.set(-8, 3.2, 4);
    scene.add(keyLight);

    // A wide, faint glow lying along the base, like dust catching the sphere's light.
    const haze = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.16 })
    );
    haze.scale.set(11, 2.6, 1);
    haze.position.set(0, 0.5, -0.8);
    scene.add(haze);

    function fitCamera(width: number, height: number) {
      const aspect = width / Math.max(height, 1);
      camera.aspect = aspect;
      // Back the camera off until both the base's width and the sphere's height fit, whichever is tighter.
      const tanHalfFov = Math.tan((FOV * Math.PI) / 360);
      const distance = Math.max(VISIBLE_HALF_WIDTH / (tanHalfFov * aspect), VISIBLE_HEIGHT / (2 * tanHalfFov));
      camera.position.set(0, CAMERA_HEIGHT, distance);
      camera.lookAt(0, LOOK_AT_Y, 0);
      camera.updateProjectionMatrix();
    }

    function update(time: number) {
      turntable.rotation.y = time * ROTATION_SPEED;

      const bob = Math.sin(time * 0.7) * 0.07;
      sphere.position.set(0, SPHERE_Y + bob, 0);
      glow.position.copy(sphere.position);
      ping.position.copy(sphere.position);
      sphereLight.position.copy(sphere.position);

      glow.scale.setScalar(4.6 + Math.sin(time * ((Math.PI * 2) / PULSE_PERIOD)) * 0.35);
      const phase = (time % PULSE_PERIOD) / PULSE_PERIOD;
      ping.scale.setScalar(1.3 + phase * 3.6);
      ping.material.opacity = 0.7 * Math.pow(1 - phase, 1.6);

      smallStars.material.opacity = 0.7 + Math.sin(time * 1.3) * 0.15;
      brightStars.material.opacity = 0.85 + Math.sin(time * 0.9 + 1) * 0.15;

      camera.position.x = Math.sin(time * 0.12) * 0.7;
      camera.lookAt(0, LOOK_AT_Y, 0);
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let time = reducedMotion ? STATIC_TIME : 0;
    let lastFrame = performance.now();
    let frameId = 0;
    let announcedReady = false;

    function draw() {
      update(time);
      renderer.render(scene, camera);
      if (!announcedReady) {
        announcedReady = true;
        onReadyRef.current?.();
      }
    }

    function resize() {
      const { clientWidth, clientHeight } = container!;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight, false);
      fitCamera(clientWidth, clientHeight);
      if (reducedMotion) draw();
    }

    function loop(now: number) {
      time += Math.min((now - lastFrame) / 1000, MAX_FRAME_DELTA);
      lastFrame = now;
      draw();
      frameId = requestAnimationFrame(loop);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    if (reducedMotion) {
      draw();
    } else {
      frameId = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      disposeScene(scene);
      glowTexture.dispose();
      starTexture.dispose();
      ringTexture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
}
