import { useEffect, useRef } from "react";

const SPACING = 36;
const TRAVELER_COUNT = 36;
const BASE_DURATION_MS = 1500;
const SEGMENT_LENGTHS = [1, 2, 3, 4];

interface GridNode {
  col: number;
  row: number;
}

/** A rectangular range of grid cells (inclusive) that travelers must not step into. */
interface AvoidZone {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

interface Traveler {
  /** Sliding window of the most-recently-visited nodes, oldest first, up to `segments + 1` long. */
  nodes: GridNode[];
  /** How many full edges long this traveler's body is once fully grown. */
  segments: number;
  targetCol: number;
  targetRow: number;
  startTime: number;
  durationMs: number;
}

/** Cubic ease-in-out — slow start, fast middle, slow finish. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function isInsideAnyZone(col: number, row: number, zones: AvoidZone[]): boolean {
  return zones.some((z) => col >= z.minCol && col <= z.maxCol && row >= z.minRow && row <= z.maxRow);
}

/**
 * Picks a random orthogonal neighbor in-bounds, excluding the node just left (no immediate
 * backtracking) and any node inside an avoid zone (e.g. behind the wordmark) — this is what makes
 * travelers bend around a zone's border instead of continuing straight into it, with no special-case
 * "deflect" logic needed: they simply have no legal move that enters it.
 */
function pickNeighbor(
  col: number,
  row: number,
  cols: number,
  rows: number,
  avoidCol: number,
  avoidRow: number,
  zones: AvoidZone[]
): GridNode {
  const candidates: GridNode[] = [
    { col: col + 1, row },
    { col: col - 1, row },
    { col, row: row + 1 },
    { col, row: row - 1 },
  ].filter((n) => n.col >= 0 && n.col < cols && n.row >= 0 && n.row < rows);
  const withoutBacktrack = candidates.filter((n) => !(n.col === avoidCol && n.row === avoidRow));
  const withoutZones = withoutBacktrack.filter((n) => !isInsideAnyZone(n.col, n.row, zones));
  const pool = withoutZones.length > 0 ? withoutZones : withoutBacktrack.length > 0 ? withoutBacktrack : candidates;
  return pool[Math.floor(Math.random() * pool.length)] ?? { col, row };
}

function randomDuration(): number {
  return BASE_DURATION_MS * (0.75 + Math.random() * 0.6);
}

function randomSegments(): number {
  return SEGMENT_LENGTHS[Math.floor(Math.random() * SEGMENT_LENGTHS.length)];
}

/**
 * Ambient background for the auth pages: a handful of light "signal" snakes that travel node to
 * node along an invisible grid. Each snake has a fixed body length of 2, 3, or 4 edges: while it's
 * still short of that length it just grows from its spawn point, and once it reaches full length
 * its tail continuously retraces the oldest edge while its head advances along a newly (randomly)
 * chosen one, bending at every vertex in between — no opacity fading, the snake's own length does
 * all the work. The snakes need per-frame interpolation CSS can't express on its own, so they're
 * drawn on a transparent canvas. The stroke color is pre-mixed with the page background at full
 * opacity — two snakes are drawn as opaque, so crossing paths never darken/brighten into a
 * compositing seam the way overlapping translucent strokes would. Purely decorative (aria-hidden)
 * and static under prefers-reduced-motion.
 */
export function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !container || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Resolved once, as a concrete opaque rgb() — letting the browser blend the accent color
    // toward the page background via color-mix, rather than drawing at partial canvas alpha,
    // is what keeps overlapping snakes from compositing into a brighter/odd-colored seam.
    const probe = document.createElement("div");
    probe.style.color = "color-mix(in srgb, var(--color-primary) 62%, var(--color-bg) 38%)";
    document.body.appendChild(probe);
    const lineColor = getComputedStyle(probe).color;
    probe.remove();

    // The CSS dot grid centers each dot in the middle of its SPACING×SPACING tile (a plain
    // radial-gradient defaults to "at center"), so node pixel coordinates need the same
    // half-cell offset to land exactly on the visible dots instead of on the tile corners.
    const nodeX = (col: number) => col * SPACING + SPACING / 2;
    const nodeY = (row: number) => row * SPACING + SPACING / 2;

    let cols = 0;
    let rows = 0;
    let travelers: Traveler[] = [];
    let zones: AvoidZone[] = [];
    let frameId = 0;

    // Grid cells overlapping any element marked data-grid-avoid (currently just the auth-page
    // wordmark) — padded out by half a cell so travelers curve around the visible edge of the
    // element instead of just its exact box.
    function computeAvoidZones(): AvoidZone[] {
      const canvasRect = canvas!.getBoundingClientRect();
      const padding = SPACING / 2;
      return Array.from(document.querySelectorAll<HTMLElement>("[data-grid-avoid]")).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          minCol: Math.floor((r.left - canvasRect.left - padding) / SPACING),
          maxCol: Math.ceil((r.right - canvasRect.left + padding) / SPACING),
          minRow: Math.floor((r.top - canvasRect.top - padding) / SPACING),
          maxRow: Math.ceil((r.bottom - canvasRect.top + padding) / SPACING),
        };
      });
    }

    function spawnTraveler(delay: number): Traveler {
      let col = 0;
      let row = 0;
      let attempts = 0;
      do {
        col = Math.floor(Math.random() * cols);
        row = Math.floor(Math.random() * rows);
        attempts++;
      } while (isInsideAnyZone(col, row, zones) && attempts < 30);
      const target = pickNeighbor(col, row, cols, rows, -1, -1, zones);
      return {
        nodes: [{ col, row }],
        segments: randomSegments(),
        targetCol: target.col,
        targetRow: target.row,
        startTime: performance.now() + delay,
        durationMs: randomDuration(),
      };
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const width = container!.clientWidth;
      const height = container!.clientHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.max(2, Math.floor(width / SPACING) + 1);
      rows = Math.max(2, Math.floor(height / SPACING) + 1);
      zones = computeAvoidZones();
      travelers = Array.from({ length: TRAVELER_COUNT }, (_, i) => spawnTraveler(i * 180));
    }

    function draw(now: number) {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
      ctx!.lineWidth = 2;
      ctx!.strokeStyle = lineColor;
      ctx!.globalAlpha = 1;

      for (const tr of travelers) {
        const elapsed = now - tr.startTime;
        if (elapsed < 0) continue;

        if (elapsed >= tr.durationMs) {
          const last = tr.nodes[tr.nodes.length - 1];
          tr.nodes.push({ col: tr.targetCol, row: tr.targetRow });
          if (tr.nodes.length > tr.segments + 1) {
            tr.nodes.shift();
          }
          const secondLast = tr.nodes[tr.nodes.length - 2] ?? last;
          const next = pickNeighbor(tr.targetCol, tr.targetRow, cols, rows, secondLast.col, secondLast.row, zones);
          tr.targetCol = next.col;
          tr.targetRow = next.row;
          tr.startTime = now;
          tr.durationMs = randomDuration();
        }

        const progress = Math.min(1, Math.max(0, (now - tr.startTime) / tr.durationMs));
        const eased = easeInOutCubic(progress);
        const fromNode = tr.nodes[tr.nodes.length - 1];
        const headX = nodeX(fromNode.col) + (nodeX(tr.targetCol) - nodeX(fromNode.col)) * eased;
        const headY = nodeY(fromNode.row) + (nodeY(tr.targetRow) - nodeY(fromNode.row)) * eased;

        ctx!.beginPath();
        if (tr.nodes.length > tr.segments) {
          // Full length reached: the tail retraces the oldest edge in step with the head.
          const tailNode = tr.nodes[0];
          const nextNode = tr.nodes[1];
          const tailX = nodeX(tailNode.col) + (nodeX(nextNode.col) - nodeX(tailNode.col)) * eased;
          const tailY = nodeY(tailNode.row) + (nodeY(nextNode.row) - nodeY(tailNode.row)) * eased;
          ctx!.moveTo(tailX, tailY);
          for (let i = 1; i < tr.nodes.length; i++) {
            ctx!.lineTo(nodeX(tr.nodes[i].col), nodeY(tr.nodes[i].row));
          }
        } else {
          // Still growing toward full length: the tail stays anchored at the spawn point.
          ctx!.moveTo(nodeX(tr.nodes[0].col), nodeY(tr.nodes[0].row));
          for (let i = 1; i < tr.nodes.length; i++) {
            ctx!.lineTo(nodeX(tr.nodes[i].col), nodeY(tr.nodes[i].row));
          }
        }
        ctx!.lineTo(headX, headY);
        ctx!.stroke();
      }

      frameId = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    // The wordmark's font (Zilla Slab) can finish loading after this first resize(), changing its
    // measured box — recompute the avoid zone once it's actually settled instead of possibly
    // excluding the fallback font's (differently sized) box forever.
    document.fonts.ready.then(() => {
      zones = computeAvoidZones();
    });

    if (!reduceMotion) {
      frameId = requestAnimationFrame(draw);
    }

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
