export const DEFAULT_CAMERA_POSITION = [2.6, 2.43, 4.5];
export const DEFAULT_CAMERA_TARGET = [0, 0, 0];
export const DEFAULT_CAMERA_FOV = 34;
export const DEFAULT_CAMERA_DISTANCE = Math.hypot(...DEFAULT_CAMERA_POSITION);

export const EXPORT_RESOLUTION_PRESETS = [1000, 1024, 1500, 2000, 2048, 3000];

export const STANDARD_VIEW_PRESETS = [
  {
    id: 'default',
    label: '默认视角',
    defaultSelected: true,
    camera: item => ({
      position: [...(item?.defaultCamera || DEFAULT_CAMERA_POSITION)],
      target: [...(item?.defaultTarget || DEFAULT_CAMERA_TARGET)],
      fov: DEFAULT_CAMERA_FOV,
      up: [0, 1, 0],
    }),
  },
  {
    id: 'front',
    label: '正视',
    defaultSelected: true,
    camera: () => ({
      position: [0, 0, DEFAULT_CAMERA_DISTANCE],
      target: [0, 0, 0],
      fov: DEFAULT_CAMERA_FOV,
      up: [0, 1, 0],
    }),
  },
  {
    id: 'side',
    label: '侧视',
    defaultSelected: true,
    camera: () => ({
      position: [DEFAULT_CAMERA_DISTANCE, 0, 0],
      target: [0, 0, 0],
      fov: DEFAULT_CAMERA_FOV,
      up: [0, 1, 0],
    }),
  },
  {
    id: 'top',
    label: '俯视',
    defaultSelected: true,
    camera: () => ({
      // Tiny +Z offset avoids gimbal lock with Y-up while keeping front facing down.
      position: [0, DEFAULT_CAMERA_DISTANCE, 0.001],
      target: [0, 0, 0],
      fov: DEFAULT_CAMERA_FOV,
      up: [0, 1, 0],
    }),
  },
  {
    id: 'back',
    label: '背视',
    defaultSelected: false,
    camera: () => ({
      position: [0, 0, -DEFAULT_CAMERA_DISTANCE],
      target: [0, 0, 0],
      fov: DEFAULT_CAMERA_FOV,
      up: [0, 1, 0],
    }),
  },
  {
    id: 'current',
    label: '当前视角',
    defaultSelected: false,
    camera: (_item, currentView) => ({
      position: [...(currentView?.position || DEFAULT_CAMERA_POSITION)],
      target: [...(currentView?.target || DEFAULT_CAMERA_TARGET)],
      fov: currentView?.fov || DEFAULT_CAMERA_FOV,
      up: [0, 1, 0],
    }),
  },
];

export const DEFAULT_EXPORT_CONFIG = {
  format: 'jpg',
  bgColor: '#ffffff',
  size: 2048,
  quality: 0.92,
  views: STANDARD_VIEW_PRESETS.filter(v => v.defaultSelected).map(v => v.id),
  batchUseVolume: false,
};

const VALID_VIEW_IDS = new Set(STANDARD_VIEW_PRESETS.map(v => v.id));

export function normalizeHexColor(value, fallback = '#ffffff') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function clampExportSize(value, maxSize = 4096) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_EXPORT_CONFIG.size;
  return Math.min(maxSize, Math.max(256, Math.round(n)));
}

export function clampJpgQuality(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_EXPORT_CONFIG.quality;
  const ratio = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0.1, Math.round(ratio * 100) / 100));
}

export function normalizeExportConfig(raw = {}) {
  const format = raw?.format === 'png' ? 'png' : 'jpg';
  const bgColor = normalizeHexColor(raw?.bgColor, DEFAULT_EXPORT_CONFIG.bgColor);
  const size = clampExportSize(raw?.size);
  const quality = clampJpgQuality(raw?.quality);
  const rawViews = Array.isArray(raw?.views) ? raw.views.filter(id => VALID_VIEW_IDS.has(id)) : null;
  const views = rawViews && rawViews.length ? [...new Set(rawViews)] : [...DEFAULT_EXPORT_CONFIG.views];
  const batchUseVolume = Boolean(raw?.batchUseVolume);
  return { format, bgColor, size, quality, views, batchUseVolume };
}

export function getSelectedViewPresets(viewIds) {
  const wanted = new Set(viewIds || []);
  return STANDARD_VIEW_PRESETS.filter(preset => wanted.has(preset.id));
}

export function resolveViewCamera(presetOrId, item, currentView, targetY = 0) {
  const preset = typeof presetOrId === 'string'
    ? STANDARD_VIEW_PRESETS.find(v => v.id === presetOrId) || STANDARD_VIEW_PRESETS[0]
    : presetOrId;
  const cam = preset.camera(item, currentView);
  if (preset.id === 'current' || !Number.isFinite(targetY) || targetY === 0) {
    return cam;
  }
  return {
    ...cam,
    position: [cam.position[0], cam.position[1] + targetY, cam.position[2]],
    target: [cam.target[0], cam.target[1] + targetY, cam.target[2]],
  };
}

export function sanitizeFilenamePart(value, fallback = 'model') {
  const cleaned = String(value ?? '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

export function buildExportFilename({
  modelName,
  colorHex,
  viewLabel,
  format = 'jpg',
  singleShot = false,
}) {
  const safeModel = sanitizeFilenamePart(modelName, 'model');
  const safeColor = sanitizeFilenamePart(String(colorHex || '').replace(/^#/, ''), 'color');
  const isPng = format === 'png';
  if (singleShot && isPng) {
    return `${safeModel}_${safeColor}_无背景.png`;
  }
  const safeView = sanitizeFilenamePart(viewLabel || '当前视角', '视角');
  const ext = isPng ? 'png' : 'jpg';
  return `${safeModel}_${safeColor}_${safeView}.${ext}`;
}

export function ensureUniqueFilename(filename, usedNames) {
  if (!usedNames.has(filename)) {
    usedNames.add(filename);
    return filename;
  }
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  let index = 2;
  let candidate = `${stem}_${index}${ext}`;
  while (usedNames.has(candidate)) {
    index++;
    candidate = `${stem}_${index}${ext}`;
  }
  usedNames.add(candidate);
  return candidate;
}

async function decodeBlobImage(blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close?.(),
    };
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(Error('无法导出图片'))),
      mimeType,
      mimeType === 'image/jpeg' ? quality : undefined,
    );
  });
}

export async function compositeToExportBlob(source, options = {}) {
  const format = options.format === 'png' ? 'png' : 'jpg';
  const size = clampExportSize(options.size);
  const bgColor = normalizeHexColor(options.bgColor, DEFAULT_EXPORT_CONFIG.bgColor);
  const quality = clampJpgQuality(options.quality);

  const isBlob = typeof Blob !== 'undefined' && source instanceof Blob;
  if (format === 'png' && isBlob) {
    const decoded = await decodeBlobImage(source);
    try {
      if (decoded.width === size && decoded.height === size) return source;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(decoded.source, 0, 0, size, size);
      return await canvasToBlob(canvas, 'image/png');
    } finally {
      decoded.close();
    }
  }

  if (format === 'png' && !isBlob) {
    if (source.width === size && source.height === size) {
      return canvasToBlob(source, 'image/png');
    }
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(source, 0, 0, size, size);
    return canvasToBlob(canvas, 'image/png');
  }

  // JPG with solid background compositing.
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);

  if (isBlob) {
    const decoded = await decodeBlobImage(source);
    try {
      ctx.drawImage(decoded.source, 0, 0, size, size);
    } finally {
      decoded.close();
    }
  } else {
    ctx.drawImage(source, 0, 0, size, size);
  }

  return canvasToBlob(canvas, 'image/jpeg', quality);
}
