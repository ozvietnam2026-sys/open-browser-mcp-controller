/** Pure helper: build a stepped pointer path from start to end (inclusive). */
export interface Point { x: number; y: number }

export function buildDragPath(start: Point, end: Point, steps = 25): Point[] {
  const n = Math.max(2, Math.min(200, Math.floor(Number.isFinite(steps) ? steps : 25)));
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // ease-in-out so speed is not constant (closer to a human hand)
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    pts.push({
      x: Math.round((start.x + (end.x - start.x) * e) * 100) / 100,
      y: Math.round((start.y + (end.y - start.y) * e) * 100) / 100,
    });
  }
  pts[0] = { ...start };
  pts[n - 1] = { ...end };
  return pts;
}
