// Pure 2D viewport safe-area calculation, Liang-Barsky line clipping,
// label clamping/de-overlapping, and 1:1 safe framing guide geometry.

export function computeSafeViewportRect({
  viewportWidth,
  viewportHeight,
  topBarBottom = 58,
  bottomBarTop = null,
  leftPanelRight = 0,
  rightPanelLeft = null,
  padding = 14,
} = {}) {
  const vw = Math.max(1, Number(viewportWidth) || 1);
  const vh = Math.max(1, Number(viewportHeight) || 1);
  const bTop = bottomBarTop ?? (vh - 36);
  const rLeft = rightPanelLeft ?? vw;

  const left = Math.min(vw - 40, Math.max(padding, Math.round(leftPanelRight + padding)));
  const right = Math.max(left + 40, Math.min(vw - padding, Math.round(rLeft - padding)));
  const top = Math.min(vh - 40, Math.max(padding, Math.round(topBarBottom + padding)));
  const bottom = Math.max(top + 40, Math.min(vh - padding, Math.round(bTop - padding)));

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

// Compute the 1:1 square export viewfinder guide intersected safely inside safeRect.
export function computeSafeFrameRect({ viewportWidth, viewportHeight, safeRect, marginRatio = 0.84 }) {
  const vw = Math.max(1, Number(viewportWidth) || 1);
  const vh = Math.max(1, Number(viewportHeight) || 1);
  // 1:1 export captures a square of side min(vw, vh) centered on the canvas.
  const exportSquareSide = Math.min(vw, vh) * marginRatio;
  const cx = vw / 2;
  const cy = vh / 2;

  const idealLeft = cx - exportSquareSide / 2;
  const idealRight = cx + exportSquareSide / 2;
  const idealTop = cy - exportSquareSide / 2;
  const idealBottom = cy + exportSquareSide / 2;

  const left = Math.max(safeRect.left + 4, idealLeft);
  const right = Math.min(safeRect.right - 4, idealRight);
  const top = Math.max(safeRect.top + 4, idealTop);
  const bottom = Math.min(safeRect.bottom - 4, idealBottom);

  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const visible = width >= 96 && height >= 96;

  return { left, top, right, bottom, width, height, visible };
}

// Liang-Barsky 2D segment clipping against an axis-aligned rectangle.
export function clipSegmentToRect(ax, ay, bx, by, rect) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;

  const checks = [
    [-dx, ax - rect.left],
    [dx, rect.right - ax],
    [-dy, ay - rect.top],
    [dy, rect.bottom - ay],
  ];

  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-8) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }

  return {
    ax: ax + t0 * dx,
    ay: ay + t0 * dy,
    bx: ax + t1 * dx,
    by: ay + t1 * dy,
  };
}

function rectsOverlap(a, b, gap = 4) {
  return !(
    a.right + gap <= b.left ||
    a.left >= b.right + gap ||
    a.bottom + gap <= b.top ||
    a.top >= b.bottom + gap
  );
}

// Place dimension label strictly inside safeRect and nudge away from previously placed labels.
export function placeSafeLabel({ x, y, text, safeRect, placedRects = [], pillHeight = 22 }) {
  const halfW = Math.max(34, Math.ceil(String(text || '').length * 4.2 + 12));
  const halfH = pillHeight / 2;

  const minX = safeRect.left + halfW + 4;
  const maxX = safeRect.right - halfW - 4;
  const minY = safeRect.top + halfH + 4;
  const maxY = safeRect.bottom - halfH - 4;

  if (minX > maxX || minY > maxY) {
    return null;
  }

  const baseX = Math.min(maxX, Math.max(minX, x));
  const baseY = Math.min(maxY, Math.max(minY, y));

  const offsets = [0, -26, 26, -52, 52, -78, 78];
  let chosen = null;

  for (const dy of offsets) {
    const cy = Math.min(maxY, Math.max(minY, baseY + dy));
    const candidate = {
      x: baseX,
      y: cy,
      width: halfW * 2,
      height: pillHeight,
      left: baseX - halfW,
      right: baseX + halfW,
      top: cy - halfH,
      bottom: cy + halfH,
    };
    if (!placedRects.some(prev => rectsOverlap(prev, candidate, 4))) {
      chosen = candidate;
      break;
    }
  }

  if (!chosen) {
    chosen = {
      x: baseX,
      y: baseY,
      width: halfW * 2,
      height: pillHeight,
      left: baseX - halfW,
      right: baseX + halfW,
      top: baseY - halfH,
      bottom: baseY + halfH,
    };
  }

  placedRects.push(chosen);
  return chosen;
}

export function layoutDimensionAnnotation({ a, b, screenCenter, text, offset = 22, safeRect, placedRects = [] }) {
  const rawLen = Math.hypot(b.x - a.x, b.y - a.y);
  if (rawLen < 12) return { visible: false };

  let nx = (a.y - b.y) / rawLen;
  let ny = (b.x - a.x) / rawLen;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  if (nx * (midX - screenCenter.x) + ny * (midY - screenCenter.y) < 0) {
    nx = -nx;
    ny = -ny;
  }

  const lineRect = {
    left: safeRect.left + 6,
    top: safeRect.top + 6,
    right: safeRect.right - 6,
    bottom: safeRect.bottom - 6,
  };
  if (lineRect.left >= lineRect.right || lineRect.top >= lineRect.bottom) {
    return { visible: false };
  }

  // Prefer outward offset; if it exits safeRect while inward/zero stays inside, adapt smoothly.
  const tryOffsets = [offset, Math.round(offset * 0.5), 0, -Math.round(offset * 0.6)];
  let clipped = null;
  let usedNx = nx;
  let usedNy = ny;

  for (const off of tryOffsets) {
    const ox = nx * off;
    const oy = ny * off;
    const candidate = clipSegmentToRect(a.x + ox, a.y + oy, b.x + ox, b.y + oy, lineRect);
    if (candidate && Math.hypot(candidate.bx - candidate.ax, candidate.by - candidate.ay) >= 14) {
      clipped = candidate;
      if (off < 0) {
        usedNx = -nx;
        usedNy = -ny;
      }
      break;
    }
  }

  if (!clipped) return { visible: false };

  const lx = (clipped.ax + clipped.bx) / 2 + usedNx * 14;
  const ly = (clipped.ay + clipped.by) / 2 + usedNy * 14;
  const label = placeSafeLabel({ x: lx, y: ly, text, safeRect, placedRects });
  if (!label) return { visible: false };

  return {
    visible: true,
    ax: clipped.ax,
    ay: clipped.ay,
    bx: clipped.bx,
    by: clipped.by,
    nx: usedNx,
    ny: usedNy,
    label,
  };
}
