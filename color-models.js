// Pure RGB / HEX / CMYK color space conversions for single-mode color inputs.

export const COLOR_INPUT_MODES = Object.freeze(['pantone', 'hex', 'cmyk', 'rgb']);

export function clampInt(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function parseHexInput(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(cleaned)) {
    return `#${cleaned.toLowerCase()}`;
  }
  if (/^[0-9a-f]{3}$/i.test(cleaned)) {
    const [r, g, b] = cleaned.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

export function hexToRgb(hex) {
  const norm = parseHexInput(hex) || '#91c8d8';
  return {
    r: parseInt(norm.slice(1, 3), 16),
    g: parseInt(norm.slice(3, 5), 16),
    b: parseInt(norm.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  const toHex = v => clampInt(v, 0, 255, 0).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToCmyk({ r, g, b }) {
  const rn = clampInt(r, 0, 255, 0) / 255;
  const gn = clampInt(g, 0, 255, 0) / 255;
  const bn = clampInt(b, 0, 255, 0) / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 0.9999) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }
  const denom = 1 - k;
  return {
    c: Math.round(((1 - rn - k) / denom) * 100),
    m: Math.round(((1 - gn - k) / denom) * 100),
    y: Math.round(((1 - bn - k) / denom) * 100),
    k: Math.round(k * 100),
  };
}

export function hexToCmyk(hex) {
  return rgbToCmyk(hexToRgb(hex));
}

export function cmykToRgb({ c, m, y, k }) {
  const cn = clampInt(c, 0, 100, 0) / 100;
  const mn = clampInt(m, 0, 100, 0) / 100;
  const yn = clampInt(y, 0, 100, 0) / 100;
  const kn = clampInt(k, 0, 100, 0) / 100;
  return {
    r: Math.round(255 * (1 - cn) * (1 - kn)),
    g: Math.round(255 * (1 - mn) * (1 - kn)),
    b: Math.round(255 * (1 - yn) * (1 - kn)),
  };
}

export function cmykToHex(cmyk) {
  return rgbToHex(cmykToRgb(cmyk));
}
